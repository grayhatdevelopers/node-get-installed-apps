import { exec } from "child_process";
import { promisify } from "util";
import { LinuxPackageMetadata, ReturnData } from "./types";

const execAsync = promisify(exec);


export async function getInstalledApps(): Promise<ReturnData<"linux", "dpkg" | "snap" | "flatpak">[]> {
  const apps: ReturnData<"linux", "dpkg" | "snap" | "flatpak">[] = [];
  const seen = new Set<string>();

  async function processDpkg() {
  try {
    const output = (await execAsync(
      `dpkg-query -W -f='${"${Package}"}|${"${Version}"}|${"${Architecture}"}|${"${Maintainer}"}|${"${Section}"}|${"${Installed-Size}"}|${"${binary:Summary}"}|${"${db:Status-Abbrev}"}\n'`,
      { encoding: "utf8" }
    )).stdout;

    const packages: Array<{
      pkg: string;
      version: string;
      arch: string;
      maintainer: string;
      section: string;
      size: string;
      summary: string;
      status: string;
    }> = [];

    for (const line of output.split("\n")) {
      if (!line.trim()) continue;

      const parts = line.split("|");
      if (parts.length < 8) continue;

      const [
        pkg,
        version,
        arch,
        maintainer,
        section,
        size,
        summary,
        status,
      ] = parts;

      if (!pkg || seen.has(pkg)) continue;
      seen.add(pkg);

      packages.push({ pkg, version, arch, maintainer, section, size, summary, status });
    }

    const installPaths = await Promise.all(packages.map(async ({ pkg }) => {
      try {
        const result = await execAsync(
          `dpkg-query -L "${pkg}" | grep -E '\.desktop$' | head -1 | xargs -r grep -m 1 '^Exec=' | cut -d'=' -f2-`,
          { encoding: "utf8" }
        );
        return result.stdout.trim();
      } catch {
        return "";
      }
    }));

    packages.forEach(({ pkg, version, arch, maintainer, section, size, summary, status }, index) => {
      const installPath = installPaths[index];

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

      const appReturn: ReturnData<"linux", "dpkg"> = {
        appName: pkg,
        appIdentifier: pkg,
        platform: "linux",
        appVersion: version || null,
        method: "dpkg",
        metadata: metadata,
        installPath: installPath || "",
      };

      apps.push(appReturn);
    });
  } catch {}
  }

  async function processSnap() {
  try {
    const snapListOutput = (await execAsync("snap list", { encoding: "utf8" })).stdout;

    const snaps: Array<{
      name: string;
      version: string;
      arch: string;
      repository: string;
    }> = [];

    for (const line of snapListOutput.split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (!parts[0] || seen.has(parts[0])) continue;

      const name = parts[0];
      seen.add(name);

      snaps.push({
        name,
        version: parts[1] || "",
        arch: parts[2] || "",
        repository: parts[3] || "",
      });
    }

    const snapInfos = await Promise.all(snaps.map(async ({ name }) => {
      try {
        const info = (await execAsync(`snap info "${name}"`, { encoding: "utf8" })).stdout;
        const descMatch = info.match(/description:\s+([\s\S]*?)\n\S/);
        const description = descMatch?.[1]?.trim() ?? null;
        const licenseMatch = info.match(/license:\s+(.+)/);
        const license = licenseMatch?.[1] ?? null;
        return { description, license };
      } catch {
        return { description: null, license: null };
      }
    }));

    const installPaths = await Promise.all(snaps.map(async ({ name }) => {
      try {
        const result = await execAsync(`find /snap/bin -name "${name}" -type l`, { encoding: "utf8" });
        return result.stdout.trim();
      } catch {
        return "";
      }
    }));

    snaps.forEach(({ name, version, arch, repository }, index) => {
      const { description, license } = snapInfos[index];
      const installPath = installPaths[index];

      const metadata: LinuxPackageMetadata = {
        type: "snap",
        repository: repository || null,
        architecture: arch || null,
        license: license,
        section: "snap",
        description: description,
      };
      const appReturn: ReturnData<"linux", "snap"> = {
        appName: name,
        appIdentifier: name,
        platform: "linux",
        appVersion: version || null,
        metadata: metadata,
        method: "snap",
        installPath: installPath || "",
      };

      apps.push(appReturn);
    });
  } catch {}
  }

  async function processFlatpak() {
  try {
    const flatpakListOutput = (await execAsync(
      "flatpak list --app --columns=application,version,origin,arch",
      { encoding: "utf8" }
    )).stdout;

    const flatpaks: Array<{
      id: string;
      version: string;
      origin: string;
      arch: string;
    }> = [];

    for (const line of flatpakListOutput.split("\n")) {
      if (!line.trim()) continue;

      const [id, version, origin, arch] = line.split("\t");
      if (!id || seen.has(id)) continue;
      seen.add(id);

      flatpaks.push({ id, version: version || "", origin: origin || "", arch: arch || "" });
    }

    const installPaths = await Promise.all(flatpaks.map(async ({ id }) => {
      try {
        const result = await execAsync(`flatpak info --show-location "${id}"`, {
          encoding: "utf8",
        });
        return result.stdout.trim();
      } catch {
        return "";
      }
    }));

    flatpaks.forEach(({ id, version, origin, arch }, index) => {
      const installPath = installPaths[index];

      const metadata: LinuxPackageMetadata = {
        type: "flatpak",
        repository: origin || null,
        architecture: arch || null,
        section: "flatpak",
      };
      const appReturn: ReturnData<"linux", "flatpak"> = {
        appName: id.split(".").pop() || null,
        appIdentifier: id,
        platform: "linux",
        appVersion: version || null,
        method: "flatpak",
        metadata,
        installPath: installPath || null,
      };

      apps.push(appReturn);
    });
  } catch {}
  }

  await Promise.all([processDpkg(), processSnap(), processFlatpak()]);

  return apps;
}
