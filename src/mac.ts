import { exec, spawn, spawnSync } from "child_process";
import { MacMdlsMetadata, MacPlutilMetadata, ReturnData } from "./types";

export function getInstalledApps(directory: string) {
  return new Promise(async (resolve, reject) => {
    try {
      const directoryContents = await getDirectoryContents(directory);
      const appsFileInfo = await getAppsFileInfo(directoryContents);
      resolve(appsFileInfo);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * getDirectoryContents
 * @param directory
 * @returns A Promise with directory contents
 */
export function getDirectoryContents(
  directory: string,
): Promise<Array<string>> {
  return new Promise((resolve, reject) => {
    exec(`ls ${directory}`, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        try {
          resolve(getAppsSubDirectory(stdout, directory));
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}

/**
 * getAppSubDirectorys
 * @param stdout
 * @param directory
 * @returns Apps sub directorys
 */
export function getAppsSubDirectory(
  stdout: string,
  directory: string,
): Array<string> {
  let stdoutArr = stdout.split(/[(\r\n)\r\n]+/);
  stdoutArr = stdoutArr
    .filter((o: any) => o)
    .map((i: any) => {
      return `${directory}/${i}`;
    });
  return stdoutArr;
}

/**
 * getAppsFileInfo
 * @param appsFile
 * @returns All apps fileInfo data (tries mdls first, falls back to plutil)
 */
export async function getAppsFileInfo(
  appsFile: readonly string[],
): Promise<ReturnData<"darwin", "mdls" | "plutil">[]> {
  const allAppsFileInfoList: any[] = [];

  // First preference: try using mdls for all apps
  try {
    const runMdlsShell = spawnSync("mdls", appsFile, {
      encoding: "utf8",
    });
    if (runMdlsShell.status === 0 && runMdlsShell.stdout) {
      const stdoutData = runMdlsShell.stdout;
      const stdoutDataArr = stdoutData.split(/[(\r\n)\r\n]+/);
      const splitIndexArr: Array<number> = [];

      // Find indices where each app's mdls output begins
      for (let i = 0; i < stdoutDataArr.length; i++) {
        if (stdoutDataArr[i].includes("kMDItemDisplayNameWithExtensions")) {
          splitIndexArr.push(i);
        }
      }

      // If no valid mdls data found, fall back to plutil
      if (splitIndexArr.length === 0) {
        throw new Error("mdls returned no valid data");
      }

      // Split the output into per-app chunks and parse each
      for (let i = 0; i < splitIndexArr.length; i++) {
        const startIdx = splitIndexArr[i];
        const endIdx =
          i + 1 < splitIndexArr.length
            ? splitIndexArr[i + 1]
            : stdoutDataArr.length;
        const appLines = stdoutDataArr
          .slice(startIdx, endIdx)
          .filter((line: string) => line.trim());

        if (appLines.length > 0) {
          allAppsFileInfoList.push({ lines: appLines });
        }
      }

      // now format the output to match returnData expected format
      const returnData: ReturnData<"darwin", "mdls">[] = allAppsFileInfoList
        .map((appFileInfo) => {
          const data = parseMdlsData(appFileInfo.lines);
          return data;
        })
        .filter((app) => app.appName);

      return returnData;
    } else {
      throw new Error("mdls failed");
    }
  } catch (error) {
    // Fallback to plutil for all apps if mdls fails
    return await parsePlutilData(appsFile);
  }
}

/**
 * getAppsFileInfoPlutil
 * @param appsFile - array of app paths
 * @returns All apps fileInfo data using plutil
 */
export async function parsePlutilData(
  appsFile: readonly string[],
): Promise<Array<ReturnData<"darwin", "plutil">>> {
  const plutilPromises = appsFile.map((app) => {
    return new Promise<ReturnData<"darwin", "plutil"> | null>((resolve) => {
      const runPlutilShell = spawn("plutil", [
        "-p",
        `${app}/Contents/Info.plist`,
      ]);
      let stdoutData = "";

      runPlutilShell.stdout.on("data", (data) => {
        stdoutData += data.toString();
      });

      runPlutilShell.on("close", (code) => {
        if (code === 0) {
          const lines = stdoutData.split(/[(\r\n)\r\n]+/);

          const appData: Record<string, any> = {};

          for (const line of lines) {
            // Match key-value pairs: "Key" => "Value" or "Key" => Value
            const match = line.match(/"([^"]+)"\s*=>\s*(.+)/);
            if (match) {
              const key = match[1];
              let value = match[2].trim();

              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
              }

              appData[key] = value;
            }
          }

          const metadata: MacPlutilMetadata = { ...appData };
          const appReturn: ReturnData<"darwin", "plutil"> = {
            appName:
              appData.CFBundleDisplayName ||
              appData.CFBundleName ||
              appData.CFBundleExecutable ||
              null,
            appVersion:
              appData.CFBundleShortVersionString ||
              appData.CFBundleVersion ||
              null,
            appIdentifier: appData.CFBundleIdentifier || null,
            platform: "darwin",
            method: "plutil",
            metadata,
          };

          resolve(appReturn);
        } else {
          resolve(null);
        }
      });

      runPlutilShell.on("error", () => resolve(null));
    });
  });

  const results = await Promise.all(plutilPromises);
  return results.filter((r): r is ReturnData<"darwin", "plutil"> => r !== null);
}

/**
 * parseMdlsData
 * @param lines - array of lines from `mdls` command
 * @returns BaseReturnData
 */
const getKeyVal = (lineData: string) => {
  try {
    // mdls format: 'kMDItemDisplayName = "App Name"'
    const lineDataArr = lineData.split("=");
    return {
      key: lineDataArr[0].trim().replace(/\"/g, ""),
      value: lineDataArr[1] ? lineDataArr[1].trim().replace(/\"/g, "") : "",
    };
  } catch {
    return { key: "", value: "" };
  }
};

export function parseMdlsData(lines: string[]): ReturnData<"darwin", "mdls"> {

  try {
    let appData: Record<string, any> = {};

    lines.filter(Boolean).forEach((line) => {
      const { key, value } = getKeyVal(line);
      if (value) {
        appData[key] = value;
      }

      // Map common mdls keys
      if (key === "kMDItemDisplayName") appData.appName = value;
      if (key === "kMDItemVersion") appData.appVersion = value;
      if (key === "kMDItemDateAdded") appData.appInstallDate = value;
      if (key === "kMDItemCFBundleIdentifier") appData.appIdentifier = value;
    });

    const metadata: MacMdlsMetadata = { ...appData };
    const appReturn: ReturnData<"darwin", "mdls"> = {
      appName: appData.appName || null,
      appIdentifier: appData.appIdentifier || null,
      platform: "darwin",
      appVersion: appData.appVersion || null,
      method: "mdls",
      metadata,
      installPath: appData.kMDItemPath || null,
    };

    return appReturn;
  } catch {
    return {
      appName: null,
      appIdentifier: null,
      platform: "darwin",
      appVersion: null,
      method: "mdls",
      metadata: {},
      installPath: null,
  }
}
}
