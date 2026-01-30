import { exec, execSync, spawn } from "child_process";
import { promisify } from "util";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import { LinuxPackageMetadata, ReturnData } from "./types";

const execPromise = promisify(exec);

// Check if a command exists
function commandExists(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Stream-based exec for large outputs - resolves when complete
function execStream(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const proc = spawn("sh", ["-c", command], {
      stdio: ["ignore", "pipe", "ignore"],
    });

    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    proc.on("close", () => {
      resolve(output);
    });
    proc.on("error", reject);

    // Safety timeout
    setTimeout(() => {
      proc.kill();
      resolve(output);
    }, 60000);
  });
}

// Build a map of package -> desktop file path by scanning common locations ONCE
async function buildDesktopFileIndex(): Promise<Map<string, string>> {
  const index = new Map<string, string>();
  const desktopDirs = [
    "/usr/share/applications",
    "/usr/local/share/applications",
    `${process.env.HOME}/.local/share/applications`,
    "/var/lib/flatpak/exports/share/applications",
    `${process.env.HOME}/.local/share/flatpak/exports/share/applications`,
    "/var/lib/snapd/desktop/applications",
  ];

  await Promise.all(
    desktopDirs.map(async (dir) => {
      try {
        const files = await readdir(dir);
        for (const file of files) {
          if (file.endsWith(".desktop")) {
            const baseName = file.replace(".desktop", "").toLowerCase();
            // Handle names like "org.gnome.Calculator" -> "calculator"
            const simpleName = baseName.split(".").pop() || baseName;
            const fullPath = join(dir, file);
            
            // Store both the full name and simple name
            if (!index.has(baseName)) index.set(baseName, fullPath);
            if (!index.has(simpleName)) index.set(simpleName, fullPath);
          }
        }
      } catch {
        // Directory doesn't exist, skip
      }
    })
  );

  return index;
}

// Extract Exec path from a .desktop file
async function getExecFromDesktop(desktopPath: string): Promise<string> {
  try {
    const content = await readFile(desktopPath, "utf8");
    const match = content.match(/^Exec=([^\s%]+)/m);
    return match?.[1] || desktopPath;
  } catch {
    return desktopPath;
  }
}

export async function getInstalledApps(): Promise<ReturnData<"linux", "dpkg" | "snap" | "flatpak">[]> {
  // Pre-build desktop file index (runs once, in parallel with availability checks)
  const [desktopIndex, hasDpkg, hasSnap, hasFlatpak] = await Promise.all([
    buildDesktopFileIndex(),
    Promise.resolve(commandExists("dpkg-query")),
    Promise.resolve(commandExists("snap")),
    Promise.resolve(commandExists("flatpak")),
  ]);

  /* -------------------- DPKG / APT -------------------- */
  async function dpkgResultsWorker(): Promise<ReturnData<"linux", "dpkg">[]> {
    if (!hasDpkg) return [];
    
    const apps: ReturnData<"linux", "dpkg">[] = [];
    const seen = new Set<string>();

    try {
      // Single command to get ALL package info at once
      const stdout = await execStream(
        `dpkg-query -W -f='\${Package}|\${Version}|\${Architecture}|\${Maintainer}|\${Section}|\${Installed-Size}|\${binary:Summary}|\${db:Status-Abbrev}\n'`
      );

      const lines = stdout.split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;
        
        const parts = line.split("|");
        if (parts.length < 8) continue;

        const [pkg, version, arch, maintainer, section, size, summary, status] = parts;
        if (!pkg || seen.has(pkg)) continue;
        seen.add(pkg);

        // Look up install path from pre-built index (O(1) lookup, no subprocess)
        let installPath = "";
        const desktopFile = desktopIndex.get(pkg.toLowerCase());
        if (desktopFile) {
          installPath = desktopFile;
        }

        const metadata: LinuxPackageMetadata = {
          type: "dpkg",
          architecture: arch || null,
          maintainer: maintainer || null,
          section: section || null,
          description: summary || null,
          installed_size: size ? Number(size) * 1024 : null,
          repository: null,
          license: null,
          install_date: null,
          is_system_package: section?.startsWith("libs") || section?.startsWith("admin") ? 1 : 0,
          is_auto_installed: status?.includes("iA") ? 1 : 0,
        };

        apps.push({
          appName: pkg,
          appIdentifier: pkg,
          platform: "linux",
          appVersion: version || null,
          method: "dpkg",
          metadata,
          installPath,
        });
      }
    } catch {
      // dpkg-query failed
    }

    return apps;
  }

  /* -------------------- SNAP -------------------- */
  async function snapResultsWorker(): Promise<ReturnData<"linux", "snap">[]> {
    if (!hasSnap) return [];
    
    const apps: ReturnData<"linux", "snap">[] = [];
    const seen = new Set<string>();

    try {
      // Get snap list in JSON format for reliable parsing
      let snapData: Array<{ name: string; version: string; rev: string; tracking: string; publisher: string }> = [];
      
      try {
        const { stdout: jsonOut } = await execPromise("snap list --json 2>/dev/null", {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        });
        const parsed = JSON.parse(jsonOut);
        snapData = parsed.map((s: any) => ({
          name: s.name,
          version: s.version,
          rev: s.revision,
          tracking: s.channel || s["tracking-channel"] || "",
          publisher: s.publisher?.["display-name"] || s.publisher?.username || "",
        }));
      } catch {
        // Fallback to text parsing if JSON fails
        const { stdout: textOut } = await execPromise("snap list 2>/dev/null", {
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        });
        const lines = textOut.split("\n").slice(1);
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          if (parts[0]) {
            snapData.push({
              name: parts[0],
              version: parts[1] || "",
              rev: parts[2] || "",
              tracking: parts[3] || "",
              publisher: parts[4] || "",
            });
          }
        }
      }

      for (const snap of snapData) {
        if (!snap.name || seen.has(snap.name)) continue;
        seen.add(snap.name);

        // Fast install path lookup
        let installPath = `/snap/bin/${snap.name}`;
        const desktopFile = desktopIndex.get(snap.name.toLowerCase());
        if (desktopFile) {
          installPath = desktopFile;
        }

        const metadata: LinuxPackageMetadata = {
          type: "snap",
          repository: snap.tracking || null,
          architecture: snap.rev || null,
          license: null,
          section: "snap",
          description: null,
        };

        apps.push({
          appName: snap.name,
          appIdentifier: snap.name,
          platform: "linux",
          appVersion: snap.version || null,
          metadata,
          method: "snap",
          installPath,
        });
      }
    } catch {
      // snap failed
    }

    return apps;
  }

  /* -------------------- FLATPAK -------------------- */
  async function flatpakResultsWorker(): Promise<ReturnData<"linux", "flatpak">[]> {
    if (!hasFlatpak) return [];
    
    const apps: ReturnData<"linux", "flatpak">[] = [];
    const seen = new Set<string>();

    try {
      // Get all flatpak info in a single command
      const { stdout: flatpakList } = await execPromise(
        "flatpak list --app --columns=application,name,version,origin,arch,installation 2>/dev/null",
        { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
      );

      const lines = flatpakList.split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;
        
        const [id, name, version, origin, arch, installation] = line.split("\t");
        if (!id || seen.has(id)) continue;
        seen.add(id);

        // Fast path lookup from index
        let installPath = "";
        const desktopFile = desktopIndex.get(id.toLowerCase()) || 
                          desktopIndex.get(id.split(".").pop()?.toLowerCase() || "");
        if (desktopFile) {
          installPath = desktopFile;
        } else {
          // Construct expected path
          const base = installation === "user" 
            ? `${process.env.HOME}/.local/share/flatpak`
            : "/var/lib/flatpak";
          installPath = `${base}/app/${id}/current/active`;
        }

        const metadata: LinuxPackageMetadata = {
          type: "flatpak",
          repository: origin || null,
          architecture: arch || null,
          section: "flatpak",
        };

        apps.push({
          appName: name || id.split(".").pop() || id,
          appIdentifier: id,
          platform: "linux",
          appVersion: version || null,
          method: "flatpak",
          metadata,
          installPath,
        });
      }
    } catch {
      // flatpak failed
    }

    return apps;
  }

  // Run all workers in parallel
  const [dpkgApps, snapApps, flatpakApps] = await Promise.all([
    dpkgResultsWorker(),
    snapResultsWorker(),
    flatpakResultsWorker(),
  ]);

  // Combine all results - no deduplication needed as they use different identifiers
  // dpkg uses package names, snap uses snap names, flatpak uses reverse-DNS IDs
  return [...dpkgApps, ...snapApps, ...flatpakApps];
}