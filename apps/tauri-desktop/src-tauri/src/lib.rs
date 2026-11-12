//! MPX Player desktop on Tauri 2. The Angular app (apps/web) is loaded unchanged; it talks to
//! this process only through `window.electron` (ElectronBridgeApi), which src/bridge/bridge.js
//! builds over Tauri commands. Only migrated methods are exposed: the app hides the rest by
//! its existing capability checks (RuntimeCapabilitiesService, `typeof bridge.x === 'function'`).

mod app_window;
mod navigation;
pub mod panel;

use tauri::{WebviewUrl, WebviewWindowBuilder, WindowEvent};

/// Node-style platform name the frontend expects in `window.electron.platform`.
fn node_platform() -> &'static str {
    match std::env::consts::OS {
        "windows" => "win32",
        "macos" => "darwin",
        other => other,
    }
}

fn bridge_script() -> String {
    format!(
        "window.__MPX_TAURI_PLATFORM__ = {};\n{}",
        serde_json::to_string(node_platform()).expect("string"),
        include_str!("bridge/bridge.js")
    )
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_window::app_version,
            app_window::window_minimize,
            app_window::window_toggle_maximize,
            app_window::window_close,
            app_window::window_get_state,
            panel::panel_get_device_id,
            panel::panel_login_request,
            panel::panel_report_error,
        ])
        .setup(|app| {
            // Same size rules as App.mainWindow in apps/electron-backend/src/app/app.ts.
            let window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("MPX Player")
                    .inner_size(1280.0, 720.0)
                    .min_inner_size(900.0, 600.0)
                    .center()
                    // Windows: the app draws its own title bar (frameless-platform). Linux keeps the native
                    // one: WebKitGTK has no CSS app-region, so the app's drag regions cannot work there.
                    .decorations(!cfg!(windows))
                    .initialization_script(bridge_script())
                    .on_navigation(navigation::allow_navigation)
                    .build()?;
            let watched = window.clone();
            window.on_window_event(move |event| {
                if matches!(event, WindowEvent::Resized(_)) {
                    app_window::emit_state(&watched);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running MPX Player");
}
