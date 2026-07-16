// Pure-logic tests for the download page's installer selection.
//
// The download page picks an installer per operating system by parsing GitHub
// Release asset filenames (`buildReleaseInfo`) and detecting the visitor's
// OS/architecture from the browser (`detectPlatform`). If an asset-naming
// change or a browser quirk breaks that matching, users could be offered the
// wrong file. These tests lock the grouping and detection behavior in place.
//
// Both functions are pure (no backend needed), so unlike e2e.test.ts this file
// spins nothing up. It runs in the same node:test + esbuild harness; download.ts
// imports config.ts which reads `import.meta.env.VITE_GITHUB_REPO`, already in
// the `define` map in run.mjs.
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  buildReleaseInfo,
  detectPlatform,
  type GitHubReleaseRaw,
  type ReleaseAssetRaw,
} from "../../src/lib/download";

function asset(name: string): ReleaseAssetRaw {
  return {
    name,
    browser_download_url: `https://example.com/${name}`,
    size: 1024,
    content_type: "application/octet-stream",
  };
}

function release(names: string[]): GitHubReleaseRaw {
  return {
    name: "Local Document RAG 1.2.3",
    tag_name: "v1.2.3",
    html_url: "https://github.com/acme/rag/releases/tag/v1.2.3",
    published_at: "2026-07-01T00:00:00Z",
    draft: false,
    prerelease: false,
    assets: names.map(asset),
  };
}

describe("buildReleaseInfo", () => {
  it("carries release metadata through", () => {
    const info = buildReleaseInfo(release(["App_1.2.3_x64.msi"]));
    assert.equal(info.name, "Local Document RAG 1.2.3");
    assert.equal(info.version, "v1.2.3");
    assert.equal(info.htmlUrl, "https://github.com/acme/rag/releases/tag/v1.2.3");
    assert.equal(info.publishedAt, "2026-07-01T00:00:00Z");
  });

  it("falls back to the tag name when the release has no name", () => {
    const raw = release(["App_1.2.3_x64.msi"]);
    raw.name = null;
    const info = buildReleaseInfo(raw);
    assert.equal(info.name, "v1.2.3");
  });

  it("groups .msi and .exe assets under Windows", () => {
    const info = buildReleaseInfo(
      release(["App_1.2.3_x64.msi", "App_1.2.3_x64-setup.exe"]),
    );
    const win = info.platforms.find((p) => p.os === "windows");
    assert.ok(win, "a Windows platform is present");
    assert.equal(win!.label, "Windows");
    assert.deepEqual(
      win!.installers.map((i) => i.format).sort(),
      [".exe", ".msi"],
    );
  });

  it("splits .dmg into Apple Silicon (arm64) and Intel (x64)", () => {
    const info = buildReleaseInfo(
      release(["App_1.2.3_aarch64.dmg", "App_1.2.3_x64.dmg"]),
    );
    const arm = info.platforms.find(
      (p) => p.os === "macos" && p.arch === "arm64",
    );
    const intel = info.platforms.find(
      (p) => p.os === "macos" && p.arch === "x64",
    );
    assert.ok(arm, "Apple Silicon platform is present");
    assert.equal(arm!.label, "macOS (Apple Silicon)");
    assert.equal(arm!.installers.length, 1);
    assert.match(arm!.installers[0].name, /aarch64/);

    assert.ok(intel, "Intel platform is present");
    assert.equal(intel!.label, "macOS (Intel)");
    assert.equal(intel!.installers.length, 1);
    assert.match(intel!.installers[0].name, /x64/);
  });

  it("recognizes 'arm64' and 'intel' naming variants for .dmg", () => {
    const info = buildReleaseInfo(
      release(["App-arm64.dmg", "App-intel.dmg"]),
    );
    const arm = info.platforms.find(
      (p) => p.os === "macos" && p.arch === "arm64",
    );
    const intel = info.platforms.find(
      (p) => p.os === "macos" && p.arch === "x64",
    );
    assert.ok(arm, "arm64-named dmg mapped to Apple Silicon");
    assert.ok(intel, "intel-named dmg mapped to Intel");
  });

  it("keeps an architecture-less .dmg as a generic macOS build", () => {
    const info = buildReleaseInfo(release(["App_1.2.3.dmg"]));
    const macArch = info.platforms.filter(
      (p) => p.os === "macos" && p.arch,
    );
    const macGeneric = info.platforms.find(
      (p) => p.os === "macos" && !p.arch,
    );
    assert.equal(macArch.length, 0, "no arch-specific macOS platform");
    assert.ok(macGeneric, "generic macOS platform is present");
    assert.equal(macGeneric!.label, "macOS");
  });

  it("groups .deb and .AppImage assets under Linux", () => {
    const info = buildReleaseInfo(
      release(["app_1.2.3_amd64.deb", "app_1.2.3_amd64.AppImage"]),
    );
    const linux = info.platforms.find((p) => p.os === "linux");
    assert.ok(linux, "a Linux platform is present");
    assert.equal(linux!.label, "Linux");
    assert.deepEqual(
      linux!.installers.map((i) => i.format).sort(),
      [".AppImage", ".deb"],
    );
  });

  it("preserves the .AppImage casing regardless of filename casing", () => {
    const info = buildReleaseInfo(release(["App_1.2.3.appimage"]));
    const linux = info.platforms.find((p) => p.os === "linux");
    assert.ok(linux, "a Linux platform is present");
    assert.equal(linux!.installers[0].format, ".AppImage");
  });

  it("ignores non-installer assets like latest.json and signatures", () => {
    const info = buildReleaseInfo(
      release([
        "App_1.2.3_x64.msi",
        "latest.json",
        "App_1.2.3_x64.msi.sig",
        "SHA256SUMS.txt",
        "README.md",
      ]),
    );
    const allInstallers = info.platforms.flatMap((p) => p.installers);
    assert.equal(allInstallers.length, 1, "only the .msi is kept");
    assert.equal(allInstallers[0].name, "App_1.2.3_x64.msi");
  });

  it("produces no platforms when a release carries no installers", () => {
    const info = buildReleaseInfo(release(["latest.json", "README.md"]));
    assert.equal(info.platforms.length, 0);
  });

  it("orders platforms Windows, macOS (arm/intel), then Linux", () => {
    const info = buildReleaseInfo(
      release([
        "App_x64.msi",
        "App_aarch64.dmg",
        "App_x64.dmg",
        "app_amd64.deb",
      ]),
    );
    assert.deepEqual(
      info.platforms.map((p) => p.label),
      ["Windows", "macOS (Apple Silicon)", "macOS (Intel)", "Linux"],
    );
  });

  it("copies asset url and size onto each installer", () => {
    const info = buildReleaseInfo(release(["App_x64.msi"]));
    const inst = info.platforms[0].installers[0];
    assert.equal(inst.url, "https://example.com/App_x64.msi");
    assert.equal(inst.size, 1024);
  });
});

describe("detectPlatform", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete (globalThis as { navigator?: unknown }).navigator;
  });

  function setNavigator(nav: unknown): void {
    Object.defineProperty(globalThis, "navigator", {
      value: nav,
      configurable: true,
      writable: true,
    });
  }

  it("returns unknown/unknown when there is no navigator", () => {
    setNavigator(undefined);
    assert.deepEqual(detectPlatform(), { os: "unknown", arch: "unknown" });
  });

  it("detects Windows x64 from a Chrome user agent", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      platform: "Win32",
    });
    assert.deepEqual(detectPlatform(), { os: "windows", arch: "x64" });
  });

  it("detects macOS arm64 when the UA carries an aarch64 hint", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (Macintosh; aarch64 Mac OS X 14_0) AppleWebKit/605.1.15",
      userAgentData: { platform: "macOS" },
    });
    assert.deepEqual(detectPlatform(), { os: "macos", arch: "arm64" });
  });

  it("detects macOS with unknown arch when no arch hint is present", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
    });
    // "Intel Mac" contains x86-less tokens; the UA lacks x86_64/x64 so arch
    // stays unknown and no arch-specific installer is pre-selected.
    assert.deepEqual(detectPlatform(), { os: "macos", arch: "unknown" });
  });

  it("detects iPhone (iOS) as macOS family", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
      platform: "iPhone",
    });
    assert.equal(detectPlatform().os, "macos");
  });

  it("detects Linux x64 from an X11 user agent", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      platform: "Linux x86_64",
    });
    assert.deepEqual(detectPlatform(), { os: "linux", arch: "x64" });
  });

  it("detects Linux arm64 (aarch64)", () => {
    setNavigator({
      userAgent:
        "Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      platform: "Linux aarch64",
    });
    assert.deepEqual(detectPlatform(), { os: "linux", arch: "arm64" });
  });

  it("falls back to navigator.platform when userAgent is empty", () => {
    setNavigator({ userAgent: "", platform: "Win32" });
    assert.equal(detectPlatform().os, "windows");
  });

  it("returns unknown OS for an unrecognized platform", () => {
    setNavigator({ userAgent: "SomeBot/1.0", platform: "" });
    assert.deepEqual(detectPlatform(), { os: "unknown", arch: "unknown" });
  });
});
