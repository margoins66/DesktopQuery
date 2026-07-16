// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::Write;
use std::net::TcpListener;
use std::sync::Mutex;

use tauri::{Manager, RunEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Loopback interface the bundled FastAPI backend binds to. The port is chosen
/// at runtime (see `pick_free_port`) so a fixed build-time port can't collide
/// with another program already listening on the user's machine.
const BACKEND_HOST: &str = "127.0.0.1";
/// Port used only as a last-resort fallback if the OS can't hand us an
/// ephemeral one. Kept for backwards compatibility with the old fixed port.
const FALLBACK_PORT: u16 = 8765;

/// Holds the running backend child process so we can terminate it on exit.
struct BackendProcess(Mutex<Option<CommandChild>>);

/// The loopback port the backend was launched on, exposed to the webview via
/// the `get_backend_port` command so the frontend knows where to send requests.
struct BackendPort(u16);

/// Ask the OS for a free ephemeral port by binding to port 0 on the loopback
/// interface, then release it immediately. There is a small window between
/// releasing and the sidecar binding, but this avoids shipping a hard-coded
/// port that can clash with whatever else is running on the user's machine.
fn pick_free_port() -> u16 {
    TcpListener::bind((BACKEND_HOST, 0))
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .unwrap_or(FALLBACK_PORT)
}

/// Returns the loopback port the bundled backend is listening on. The frontend
/// resolves its API base URL from this when running inside the desktop shell.
#[tauri::command]
fn get_backend_port(port: tauri::State<'_, BackendPort>) -> u16 {
    port.0
}

fn main() {
    let backend_port = pick_free_port();

    // Announce the runtime-selected port on stdout so external tooling — chiefly
    // the desktop shell smoke test (scripts/desktop/shell-smoke-test.py) — can
    // observe which ephemeral port THIS shell chose and passed to the sidecar.
    // It is the same value `get_backend_port` returns to the webview, so it lets
    // a test confirm the real shell->sidecar->runtime-port handoff rather than a
    // fixed build-time port. Emitted before the sidecar is spawned so it is the
    // first line the harness sees.
    println!("RAG_BACKEND_PORT={backend_port}");

    let mut builder = tauri::Builder::default().plugin(tauri_plugin_shell::init());

    // Self-update is desktop-only. The updater plugin verifies downloaded
    // packages against the public key baked into tauri.conf.json; the process
    // plugin lets the frontend relaunch the app once an update is installed.
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_process::init());
    }

    builder
        .manage(BackendProcess(Mutex::new(None)))
        .manage(BackendPort(backend_port))
        .invoke_handler(tauri::generate_handler![get_backend_port])
        .setup(move |app| {
            // Backend writes SQLite / Chroma / uploads here. Use the per-user
            // app data directory so a packaged (read-only) install still works.
            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::env::temp_dir().join("local-document-rag"));
            std::fs::create_dir_all(&data_dir).ok();

            let sidecar = app
                .shell()
                .sidecar("rag-backend")?
                .env("RAG_HOST", BACKEND_HOST)
                .env("PORT", backend_port.to_string())
                .env("RAG_DATA_DIR", data_dir.to_string_lossy().to_string());

            let (mut rx, child) = sidecar.spawn()?;
            app.state::<BackendProcess>()
                .0
                .lock()
                .unwrap()
                .replace(child);

            // Drain the sidecar's output so the pipe never fills and blocks it,
            // forwarding to this process's stdout/stderr for debugging.
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            let _ = std::io::stdout().write_all(&line);
                        }
                        CommandEvent::Stderr(line) => {
                            let _ = std::io::stderr().write_all(&line);
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Make sure the backend process is killed when the app exits so it
            // doesn't linger after all windows close.
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                if let Some(child) = app_handle
                    .state::<BackendProcess>()
                    .0
                    .lock()
                    .unwrap()
                    .take()
                {
                    let _ = child.kill();
                }
            }
        });
}
