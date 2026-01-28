export interface BaseReturnData {
  appName: string;
  appIdentifier: string;
  platform: string;
  appVersion: string | null;
  metadata?: MacMdlsMetadata | MacPlutilMetadata | LinuxPackageMetadata | object;
}

export interface MacMdlsMetadata {
}

export interface MacPlutilMetadata {
}

export type LinuxPackageMetadata = {
  type: "dpkg" | "snap" | "flatpak";
  repository?: string | null;
  architecture?: string | null;
  maintainer?: string | null;
  license?: string | null;
  section?: string | null;
  description?: string | null;
  installed_size?: number | null;
  install_date?: string | null;
  is_system_package?: number;
  is_auto_installed?: number;
};

export interface LinuxReturnData extends BaseReturnData {
  platform: "linux";
  metadata: LinuxPackageMetadata;
}

export interface WinReturnData extends BaseReturnData {
  platform: "win32";
  metadata: any;
}

export interface MacReturnData extends BaseReturnData {
  platform: "darwin";
  metadata: MacMdlsMetadata | MacPlutilMetadata;
}
