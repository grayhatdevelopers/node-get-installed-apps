import { exec, spawnSync } from "child_process";

export function getInstalledApps(directory:string) {
  return new Promise(async (resolve, reject) => {
    try {
      const directoryContents = await getDirectoryContents(directory);
      const appsFileInfo = getAppsFileInfo(directoryContents);
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
 * @returns All apps fileInfo data (tries plutil first, falls back to mdls)
 */
export function getAppsFileInfo(appsFile: readonly string[]): Array<any> {
  const allAppsFileInfoList: any[] = [];
  const failedApps: string[] = [];

  // Try plutil first for each app
  for (const app of appsFile) {
    const runPlutilShell = spawnSync(
      "plutil",
      ["-p", `${app}/Contents/Info.plist`],
      { encoding: "utf8" }
    );

    if (runPlutilShell.status === 0) {
      const stdoutData = runPlutilShell.stdout ?? "";
      const stdoutDataArrPlutils = stdoutData.split(/[(\r\n)\r\n]+/)    .filter((line) => line.length > 0);
      allAppsFileInfoList.push({ data: stdoutDataArrPlutils, isPlutil: true });
    } else {
      // plutil failed, add to fallback list
      failedApps.push(app);
    }
  }

  // Fallback to mdls for apps where plutil failed
  if (failedApps.length > 0) {
  const runMdlsShell = spawnSync("mdls", appsFile, {
    encoding: "utf8",
  });
  const stdoutData = runMdlsShell.stdout;
  // const allAppsFileInfoList: Array<number> = []; 
  // now we are using allAppsFileInfoList array to store app info objects so no need for allAppsFileInfoList
  const stdoutDataArr = stdoutData.split(/[(\r\n)\r\n]+/);
  const splitIndexArr: Array<any> = [];
  for (let i = 0; i < stdoutDataArr.length; i++) {
    if (stdoutDataArr[i].includes("kMDItemDisplayNameWithExtensions")) {
      splitIndexArr.push(i);
    }
  }
  for (let j = 0; j < splitIndexArr.length; j++) {
    const appData = stdoutDataArr.slice(splitIndexArr[j], splitIndexArr[j + 1]);
    allAppsFileInfoList.push({ data: appData, isPlutil: false });
  }
  }

  return allAppsFileInfoList;
}

/**
 * getAppData
 * @param appFileInfo - Object with data array and isPlutil flag
 * @returns One app data
 */
export function getAppData(appFileInfo: { data: Array<any>, isPlutil: boolean }) {
  const getKeyVal = (lineData: string) => {
    if (appFileInfo.isPlutil) {
      // plutil format: '  "CFBundleName" => "ActivityWatch"'
      const match = lineData.match(/"([^"]+)"\s*=>\s*(.+)/);
      if (match) {
        const key = match[1];
        let value = match[2].trim();
        // Remove quotes if present
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        }
        return { key, value };
      }
    } else {
      // mdls format: 'kMDItemCFBundleIdentifier         
      const lineDataArr = lineData.split("=");
      return {
        key: lineDataArr[0].trim().replace(/\"/g, ""),
        value: lineDataArr[1] ? lineDataArr[1].trim().replace(/\"/g, "") : "",
      };
    }
    return { key: "", value: "" };
  };

  const getAppInfoData = (appArr: Array<any>, isPlutil: boolean) => {
    let appData: any = {};
    appArr
      .filter((i: any) => i)
      .forEach((o: any) => {
      if(isPlutil){
        let appKeyVal = getKeyVal(o);
        if (appKeyVal.value) {
          appData[appKeyVal.key] = appKeyVal.value;
        }
        if (o.includes("CFBundleName")) {
          appData.appName = appKeyVal.value;
        }
        if (o.includes("CFBundleShortVersionString")) {
          appData.appVersion = appKeyVal.value;
        }
        if (o.includes("CFBundleItemDateAdded")) {
          appData.appInstallDate = appKeyVal.value;
        }
        if (o.includes("CFBundleIdentifier")) {
          appData.appIdentifier = appKeyVal.value;
        }
      }
      else{
        let appKeyVal = getKeyVal(o);
        if (appKeyVal.value) {
          appData[appKeyVal.key] = appKeyVal.value;
        }
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
      }
    }
    );
    return appData;
  };
  return getAppInfoData(appFileInfo.data, appFileInfo.isPlutil);
}
