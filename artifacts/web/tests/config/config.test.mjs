// Contract tests for src/lib/config.ts — the JS half of the desktop runtime
// wiring. See run.mjs for how config.ts is bundled and why each scenario
// re-imports the built module with a distinct query string (fresh module state).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const builtUrl = pathToFileURL(path.join(here, ".build", "config.mjs")).href;

// Import a FRESH instance of the built config module (resolveApiBase memoizes
// per module load, so a new query string gives us a clean slate each time).
function loadConfig(tag) {
  return import(`${builtUrl}?${tag}`);
}

describe("config API-base resolution", () => {
  it("web (no Tauri shell): keeps the /__rag proxy base and is not desktop", async () => {
    delete globalThis.window;
    const config = await loadConfig("web");

    assert.equal(config.isDesktop(), false);
    const base = await config.resolveApiBase();
    assert.equal(base, "/__rag/api");
    assert.equal(config.getApiBase(), "/__rag/api");
  });

  it("desktop: resolves the runtime port from get_backend_port into the api base", async () => {
    const RUNTIME_PORT = 45871; // an ephemeral port, NOT the fixed 8765 fallback
    let invokedCmd = null;
    globalThis.window = {
      __TAURI_INTERNALS__: {
        invoke: async (cmd) => {
          invokedCmd = cmd;
          return RUNTIME_PORT;
        },
      },
    };
    const config = await loadConfig("desktop");

    assert.equal(config.isDesktop(), true);
    const base = await config.resolveApiBase();
    assert.equal(invokedCmd, "get_backend_port");
    assert.equal(base, `http://127.0.0.1:${RUNTIME_PORT}/api`);
    assert.equal(config.getApiBase(), `http://127.0.0.1:${RUNTIME_PORT}/api`);
    assert.notEqual(base, "http://127.0.0.1:8765/api"); // not the pinned fallback
  });

  it("desktop: falls back to the proxy base if get_backend_port is unavailable", async () => {
    globalThis.window = {
      __TAURI_INTERNALS__: {
        invoke: async () => {
          throw new Error("command not available");
        },
      },
    };
    const config = await loadConfig("fallback");

    assert.equal(config.isDesktop(), true);
    const base = await config.resolveApiBase();
    assert.equal(base, "/__rag/api");
  });
});
