import { execSync } from "child_process";
import { BaseReturnData,LinuxPackageMetadata } from "./types";


export async function getInstalledApps(): Promise<BaseReturnData[]> {
  const apps: BaseReturnData[] = [];
  const seen = new Set<string>();

  /* -------------------- DPKG / APT -------------------- */
  try {
    const output = execSync(
      `dpkg-query -W -f='${"${Package}"}|${"${Version}"}|${"${Architecture}"}|${"${Maintainer}"}|${"${Section}"}|${"${Installed-Size}"}|${"${binary:Summary}"}|${"${db:Status-Abbrev}"}\n'`,
      { encoding: "utf8" }
    );

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

      const appreturn: BaseReturnData = {
        appName: pkg,
        appIdentifier: pkg,
        platform: "linux",
        appVersion: version || null,
        method: "dpkg",
        metadata: metadata,
      };

      apps.push(appreturn);
    }
  } catch {}

  /* -------------------- SNAP -------------------- */
  try {
    const snapList = execSync("snap list", { encoding: "utf8" });
    const snapInfoCache = new Map<string, string>();

    for (const line of snapList.split("\n").slice(1)) {
      const parts = line.trim().split(/\s+/);
      if (!parts[0] || seen.has(parts[0])) continue;

      const name = parts[0];
      seen.add(name);

      let description: string | null = null;
      let license: string | null = null;

      try {
        const info = execSync(`snap info ${name}`, { encoding: "utf8" });
        snapInfoCache.set(name, info);

        const descMatch = info.match(/description:\s+([\s\S]*?)\n\S/);
        description = descMatch?.[1]?.trim() ?? null;

        const licenseMatch = info.match(/license:\s+(.+)/);
        license = licenseMatch?.[1] ?? null;
      } catch {}

      const metadata: LinuxPackageMetadata = {
        type: "snap",
        repository: parts[3] || null,
        architecture: parts[2] || null,
        license: license,
        section: "snap",
        description: description,
      };
      const appreturn: BaseReturnData = {
        appName: name,
        appIdentifier: name,
        platform: "linux",
        appVersion: parts[1] || null,
        metadata: metadata,
        method: "snap",
      };

      apps.push(appreturn);
    }
  } catch {}

  /* -------------------- FLATPAK -------------------- */
  try {
    const flatpakList = execSync(
      "flatpak list --app --columns=application,version,origin,arch",
      { encoding: "utf8" }
    );

    for (const line of flatpakList.split("\n")) {
      if (!line.trim()) continue;

      const [id, version, origin, arch] = line.split("\t");
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const metadata: LinuxPackageMetadata = {
        type: "flatpak",
        repository: origin || null,
        architecture: arch || null,
        section: "flatpak",
      };
      const appreturn: BaseReturnData = {
        appName: id.split(".").pop() || null,
        appIdentifier: id,
        platform: "linux",
        appVersion: version || null,
        metadata,
        method: "flatpak",
      };

      apps.push(appreturn);
    }
  } catch {}

  return apps;
}
