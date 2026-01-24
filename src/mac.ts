import { exec, spawn, spawnSync } from "child_process";

export function getInstalledApps(directory:string) {
  return new Promise(async (resolve, reject) => {
    try {
      const directoryContents = await getDirectoryContents(directory);
      const appsFileInfo = await getAppsFileInfo(directoryContents);
      resolve(
        appsFileInfo
          .map((appFileInfo) => getAppData(appFileInfo))
          .filter((app) => app.appName)
      );
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
  try {
  const runMdlsShell = spawnSync("mdls", appsFile, {
    encoding: "utf8",
  });    
    if (runMdlsShell.status === 0 && runMdlsShell.stdout) {
  const stdoutData = runMdlsShell.stdout;
  const stdoutDataArr = stdoutData.split(/[(\r\n)\r\n]+/);
  const splitIndexArr: Array<any> = [];
  for (let i = 0; i < stdoutDataArr.length; i++) {
    if (stdoutDataArr[i].includes("kMDItemDisplayNameWithExtensions")) {
      splitIndexArr.push(i);
    }
  }
  for (let j = 0; j < splitIndexArr.length; j++) {
    const appData = stdoutDataArr.slice(splitIndexArr[j], splitIndexArr[j + 1]);
    allAppsFileInfoList.push({
      appName: appData as string[],
      appVersion: appData as string[],
      appInstallDate: appData as string[],
      appIdentifier: appData as string[]
     });
      }
    } else {
      throw new Error("mdls failed");
    }
  } catch (error) {
    // Fallback to plutil for all apps if mdls fails
    for (const app of appsFile) {
      try {
        const result = await new Promise<any>((resolve) => {
          const runPlutilShell = spawn("plutil", ["-p", `${app}/Contents/Info.plist`]);
          let stdoutData = "";
          
          runPlutilShell.stdout.on("data", (data) => {
            stdoutData += data.toString();
          });
          
          runPlutilShell.on("close", (code) => {
            if (code === 0) {
              const lines = stdoutData.split(/[(\r\n)\r\n]+/);
              
              let appName = "";
              let appVersion = "";
              let appIdentifier = "";
              
              for (const line of lines) {
                const match = line.match(/"([^"]+)"\s*=>\s*"([^"]+)"/);
                if (match) {
                  const key = match[1];
                  const value = match[2];
                  
                  if (key === "CFBundleDisplayName" || (key === "CFBundleName" && !appName)) {
                    appName = value;
                  }
                  if (key === "CFBundleVersion") {
                    appVersion = value;
                  }
                  if (key === "CFBundleIdentifier") {
                    appIdentifier = value;
                  }
                }
              }
              
              resolve({ appName, appVersion, appInstallDate: "", appIdentifier });
            } else {
              resolve(null);
            }
          });
          
          runPlutilShell.on("error", () => resolve(null));
        });
        
        if (result) {
          allAppsFileInfoList.push(result);
        }
      } catch (err) {
        // plutil failed
        console.log(`plutil failed for app: ${app}`, err);
      }
    }
  }

  return allAppsFileInfoList;
}

/**
 * getAppData
 * @param appFileInfo 
 * @returns One app data
 */
export function getAppData(appFileInfo: { appName: string[], appVersion: string[], appInstallDate: string[], appIdentifier: string[] }) {
  try {
    const getKeyVal = (lineData: string) => {
      try {
        // Try plutil format: '  "CFBundleName" => "ActivityWatch"'
        const plutilMatch = lineData.match(/"([^"]+)"\s*=>\s*(.+)/);
        if (plutilMatch) {
          const key = plutilMatch[1];
          let value = plutilMatch[2].trim();
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }
          return { key, value };
        }
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
      } catch (error) {
        // Return empty appData on error
      }
      return appData;
    };
    return getAppInfoData(appFileInfo.appName);
  } catch (error) {
    return {};
  }
}
