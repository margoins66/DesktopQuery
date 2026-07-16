import { getLatestReleaseApiUrl } from "./config";

export type OS = "windows" | "macos" | "linux" | "unknown";
export type Arch = "x64" | "arm64" | "unknown";

export interface DetectedPlatform {
  os: OS;
  arch: Arch;
}

/**
 * Best-effort detection of the visitor's operating system and CPU architecture
 * from the browser. Architecture is only reliably available via the (Chromium)
 * User-Agent Client Hints API; elsewhere it stays "unknown" and we simply don't
 * pre-select an architecture-specific installer.
 */
export function detectPlatform(): DetectedPlatform {
  if (typeof navigator === "undefined") return { os: "unknown", arch: "unknown" };

  const ua = navigator.userAgent || "";
  const platform =
    (navigator as unknown as { userAgentData?: { platform?: string } })
      .userAgentData?.platform ||
    (navigator as unknown as { platform?: string }).platform ||
    "";
  const haystack = `${ua} ${platform}`.toLowerCase();

  let os: OS = "unknown";
  if (/(win|windows)/.test(haystack)) os = "windows";
  else if (/(mac|iphone|ipad|ipod|darwin)/.test(haystack)) os = "macos";
  else if (/(linux|x11|ubuntu|debian|fedora)/.test(haystack)) os = "linux";

  let arch: Arch = "unknown";
  if (/(arm64|aarch64)/.test(haystack)) arch = "arm64";
  else if (/(x86_64|x64|win64|wow64|amd64)/.test(haystack)) arch = "x64";

  return { os, arch };
}

export interface ReleaseAssetRaw {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface GitHubReleaseRaw {
  name: string | null;
  tag_name: string;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAssetRaw[];
}

export interface Installer {
  name: string;
  url: string;
  size: number;
  /** e.g. ".dmg", ".msi", ".exe", ".deb", ".AppImage" */
  format: string;
}

export interface PlatformDownloads {
  os: OS;
  /** Optional architecture qualifier for macOS builds. */
  arch?: Arch;
  label: string;
  installers: Installer[];
}

export interface ReleaseInfo {
  name: string;
  version: string;
  htmlUrl: string;
  publishedAt: string | null;
  platforms: PlatformDownloads[];
}

const INSTALLER_EXTENSIONS = [".dmg", ".msi", ".exe", ".deb", ".appimage"];

function extensionOf(name: string): string | null {
  const lower = name.toLowerCase();
  const ext = INSTALLER_EXTENSIONS.find((e) => lower.endsWith(e));
  if (!ext) return null;
  // Preserve the ".AppImage" casing users expect.
  return ext === ".appimage" ? ".AppImage" : ext;
}

function archOf(name: string): Arch {
  const lower = name.toLowerCase();
  if (/(aarch64|arm64)/.test(lower)) return "arm64";
  if (/(x86_64|x64|amd64|intel)/.test(lower)) return "x64";
  return "unknown";
}

/**
 * Groups a GitHub release's assets into per-platform installer lists, keeping
 * only recognized desktop installer formats. macOS is split into Apple Silicon
 * (arm64) and Intel (x64) so visitors grab the right build.
 */
export function buildReleaseInfo(release: GitHubReleaseRaw): ReleaseInfo {
  const windows: Installer[] = [];
  const macArm: Installer[] = [];
  const macIntel: Installer[] = [];
  const macOther: Installer[] = [];
  const linux: Installer[] = [];

  for (const asset of release.assets) {
    const format = extensionOf(asset.name);
    if (!format) continue;
    const installer: Installer = {
      name: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
      format,
    };

    if (format === ".msi" || format === ".exe") {
      windows.push(installer);
    } else if (format === ".deb" || format === ".AppImage") {
      linux.push(installer);
    } else if (format === ".dmg") {
      const arch = archOf(asset.name);
      if (arch === "arm64") macArm.push(installer);
      else if (arch === "x64") macIntel.push(installer);
      else macOther.push(installer);
    }
  }

  const platforms: PlatformDownloads[] = [];
  if (windows.length) {
    platforms.push({ os: "windows", label: "Windows", installers: windows });
  }
  if (macArm.length) {
    platforms.push({
      os: "macos",
      arch: "arm64",
      label: "macOS (Apple Silicon)",
      installers: macArm,
    });
  }
  if (macIntel.length) {
    platforms.push({
      os: "macos",
      arch: "x64",
      label: "macOS (Intel)",
      installers: macIntel,
    });
  }
  if (macOther.length) {
    platforms.push({ os: "macos", label: "macOS", installers: macOther });
  }
  if (linux.length) {
    platforms.push({ os: "linux", label: "Linux", installers: linux });
  }

  return {
    name: release.name || release.tag_name,
    version: release.tag_name,
    htmlUrl: release.html_url,
    publishedAt: release.published_at,
    platforms,
  };
}

/** Fetches the latest published release and normalizes it. Throws on failure. */
export async function fetchLatestRelease(): Promise<ReleaseInfo> {
  const url = getLatestReleaseApiUrl();
  if (!url) {
    throw new Error("No GitHub repository is configured for downloads.");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch (e) {
    throw new Error(
      "Could not reach GitHub to look up the latest release. Check your connection and try again.",
    );
  }
  if (res.status === 404) {
    throw new Error(
      "No published release was found yet. Installers appear here once a release is published.",
    );
  }
  if (!res.ok) {
    throw new Error(`GitHub returned ${res.status} ${res.statusText}.`);
  }
  const data = (await res.json()) as GitHubReleaseRaw;
  return buildReleaseInfo(data);
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
