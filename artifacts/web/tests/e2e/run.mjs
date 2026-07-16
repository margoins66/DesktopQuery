// E2E test runner.
//
// vitest is blocked by the package firewall in this environment, so this suite
// uses Node's built-in test runner (node:test). The tests import the REAL
// frontend API client (src/lib/api.ts, including the askStream SSE parser) so
// that backend<->frontend contract drift (e.g. the token `content` vs `token`
// field mismatch) is caught. Because that code reads `import.meta.env`, we
// bundle the test with esbuild (already present via Vite) and statically define
// VITE_API_BASE_URL so the client points at the Vite proxy we spin up.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url)); // tests/e2e
const webDir = path.resolve(here, "..", ".."); // artifacts/web
const repoRoot = path.resolve(webDir, "..", "..");

// Resolve esbuild from the pnpm store (it ships as a dependency of Vite).
const pnpmDir = path.join(repoRoot, "node_modules", ".pnpm");
const esbuildPkg = fs
  .readdirSync(pnpmDir)
  .find((d) => d.startsWith("esbuild@"));
if (!esbuildPkg) {
  throw new Error("Could not locate esbuild in the pnpm store.");
}
const esbuild = await import(
  path.join(pnpmDir, esbuildPkg, "node_modules", "esbuild", "lib", "main.js")
);

const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5817);
const BACKEND_URL = process.env.E2E_BACKEND_URL || "http://localhost:8000";
const proxyBase = `http://localhost:${WEB_PORT}/__rag/api`;

const outDir = path.join(here, ".build");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Each *.test.ts in this directory is bundled to a matching *.test.mjs and run
// under node:test. e2e.test.ts hits the live backend through a Vite proxy;
// download.test.ts covers the pure download-page installer logic (no backend).
const entryPoints = fs
  .readdirSync(here)
  .filter((f) => f.endsWith(".test.ts"))
  .map((f) => path.join(here, f));
const outfiles = entryPoints.map((e) =>
  path.join(outDir, path.basename(e).replace(/\.ts$/, ".mjs")),
);

await esbuild.build({
  entryPoints,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  outdir: outDir,
  outExtension: { ".js": ".mjs" },
  // Bundle only our relative source (api.ts/config.ts/download.ts); keep node +
  // vite external.
  packages: "external",
  define: {
    "import.meta.env.VITE_API_BASE_URL": JSON.stringify(proxyBase),
    "import.meta.env.VITE_GITHUB_REPO": JSON.stringify(
      process.env.VITE_GITHUB_REPO || "",
    ),
  },
  sourcemap: "inline",
});

const res = spawnSync(process.execPath, ["--test", ...outfiles], {
  stdio: "inherit",
  cwd: webDir,
  env: {
    ...process.env,
    E2E_WEB_PORT: String(WEB_PORT),
    E2E_WEB_DIR: webDir,
    E2E_BACKEND_URL: BACKEND_URL,
    BASE_PATH: process.env.BASE_PATH || "/",
    NODE_ENV: "development",
  },
});

process.exit(res.status ?? 1);
