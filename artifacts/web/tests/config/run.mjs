// Unit-test runner for the desktop/web API-base resolution contract.
//
// This locks the JavaScript half of the desktop runtime wiring that the
// shell-level smoke test (scripts/desktop/shell-smoke-test.py) cannot drive
// through a headless webview: given the runtime port the Rust shell serves via
// the `get_backend_port` command, `resolveApiBase()` must point requests at
// `http://127.0.0.1:<port>/api`; on the web it must keep the `/__rag/api` proxy
// base; and it must fall back to that base if the command is unavailable.
//
// Like the e2e suite, config.ts reads `import.meta.env`, so we bundle it with
// esbuild (statically defining the env) and run the assertions with node:test.
// The built module is imported multiple times with distinct query strings so
// each scenario gets a FRESH module instance (resolveApiBase memoizes its
// result per module load).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const here = path.dirname(fileURLToPath(import.meta.url)); // tests/config
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

const outDir = path.join(here, ".build");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, "config.mjs");

await esbuild.build({
  entryPoints: [path.join(webDir, "src", "lib", "config.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  packages: "external",
  define: {
    // Leave both unset so config.ts uses its defaults: `/__rag/api` for the web
    // base, "" for the GitHub repo.
    "import.meta.env.VITE_API_BASE_URL": "undefined",
    "import.meta.env.VITE_GITHUB_REPO": "undefined",
  },
  outfile,
  sourcemap: "inline",
});

const res = spawnSync(
  process.execPath,
  ["--test", path.join(here, "config.test.mjs")],
  {
    stdio: "inherit",
    cwd: webDir,
    env: { ...process.env, NODE_ENV: "development" },
  },
);

process.exit(res.status ?? 1);
