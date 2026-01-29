import { exec, spawn, spawnSync } from "child_process";
import { BaseReturnData, MacMdlsMetadata, MacPlutilMetadata, ReturnData } from "./types";

export function getInstalledApps(directory:string) {
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
  directory: string
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
  directory: string
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
export async function getAppsFileInfo(appsFile: readonly string[]): Promise<Array<any>> {
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
        const endIdx = i + 1 < splitIndexArr.length ? splitIndexArr[i + 1] : stdoutDataArr.length;
        const appLines = stdoutDataArr.slice(startIdx, endIdx).filter((line: string) => line.trim());
        
        if (appLines.length > 0) {
          allAppsFileInfoList.push({ lines: appLines });
        }
      }

      // now format the output to match returnData expected format
      const returnData: ReturnData<"darwin", "mdls">[] = allAppsFileInfoList.map((appFileInfo, index) => {
            const data = parseMdlsData(appFileInfo.lines);
            return data;
          })
          .filter((app) => app.appName)
      
      return returnData;
    } else {
      throw new Error("mdls failed");
    }
  } catch (error) {
    // Fallback to plutil for all apps if mdls fails
    // Run all spawns in parallel and collect results without failing the whole batch
    const plutilPromises = appsFile.map((app) => {
      return new Promise<any>((resolve) => {
        const runPlutilShell = spawn("plutil", ["-p", `${app}/Contents/Info.plist`]);
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

            resolve(appData);
          } else {
            resolve(null);
          }
        });

        runPlutilShell.on("error", () => resolve(null));
      });
    });

    const results = await Promise.all(plutilPromises);
    for (const r of results) {
      if (r) {
        allAppsFileInfoList.push(r);
      }
    }
  }

  return allAppsFileInfoList;
}

/**
 * parseMdlsData
 * @param lines - array of lines from `mdls` command
 * @returns BaseReturnData
 */
export function parseMdlsData(lines: string[]): ReturnData<"darwin", "mdls"> {
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

  try {
    let appData: Record<string, any> = {};

    lines
      .filter(Boolean)
      .forEach((line) => {
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
    };
  }
}

/**
 * getAppData
 * @param appFileInfo 
 * @returns One app data
 */
export function getAppData(appFileInfo: any) {
  try {
    const getKeyVal = (lineData: string) => {
      try {
        // Try mdls format: 'kMDItemDisplayName = "App Name"'
        const lineDataArr = lineData.split("=");
        return {
          key: lineDataArr[0].trim().replace(/\"/g, ""),
          value: lineDataArr[1] ? lineDataArr[1].trim().replace(/\"/g, "") : "",
        };
      } catch (error) {
        return { key: "", value: "" };
      }
    };

    const getAppInfoData = (appArr: Array<any>) => {
      let appData: any = {};
      let appreturn: BaseReturnData []=[];
      try {
        appArr
          .filter((i: any) => i)
          .forEach((o: any) => {
            let appKeyVal = getKeyVal(o);
            if (appKeyVal.value) {
              appData[appKeyVal.key] = appKeyVal.value;
            }
            // mdls keys
            if (o.includes("kMDItemDisplayName")) {
              appData.appName = appKeyVal.value;
            }
            if (o.includes("kMDItemVersion")) {
              appData.appVersion = appKeyVal.value;
            }
            if (o.includes("kMDItemDateAdded")) {
              appData.appInstallDate = appKeyVal.value;
            }
            if (o.includes("kMDItemCFBundleIdentifier")) {
              appData.appIdentifier = appKeyVal.value;
            }
          });
        
        let metadata: MacMdlsMetadata = {
          ...appData
        };
        const appreturn: ReturnData<"darwin", "mdls"> = {
          appName: appData.appName || null,
          appIdentifier: appData.appIdentifier || null,
          platform: "darwin",
          appVersion: appData.appVersion || null,
          method: "mdls",
          metadata: metadata,
        };
        return appreturn;

      } catch (error) {
        // Return empty appData on error
        return {};
      }      
    };

    if (appFileInfo.isMdls && appFileInfo.lines) {
      return getAppInfoData(appFileInfo.lines);
    } else {
      try {
        const metadata: MacPlutilMetadata = {...appFileInfo};
        const appreturn: ReturnData<"darwin", "plutil">  = {
          appName: appFileInfo.CFBundleDisplayName || appFileInfo.CFBundleName || appFileInfo.CFBundleExecutable,
          appVersion: appFileInfo.CFBundleShortVersionString || appFileInfo.CFBundleVersion ,
          appIdentifier: appFileInfo.CFBundleIdentifier ,
          platform: "darwin",
          method: "plutil",
          metadata: metadata,
        };
        return appreturn;
      } catch (error) {
        console.error("Error parsing plutil app data:", error);
        return {};
      }
    }
  } catch (error) {
    return {};
  }
}
