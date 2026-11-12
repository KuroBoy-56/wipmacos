//! Window and app-info half of the bridge (Electron: window.events.ts + electron.events.ts).

use serde::Serialize;
use tauri::{AppHandle, Emitter, WebviewWindow};

/// Same event name the bridge listens to (Electron channel WINDOW:STATE_CHANGED).
pub const WINDOW_STATE_EVENT: &str = "window-state-changed";

/// ElectronBridgeWindowState.
#[derive(Debug, Clone, Copy, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub is_maximized: bool,
    pub is_full_screen: bool,
}

pub fn state_of(window: &WebviewWindow) -> WindowState {
    WindowState {
        is_maximized: window.is_maximized().unwrap_or(false),
        is_full_screen: window.is_fullscreen().unwrap_or(false),
    }
}

pub fn emit_state(window: &WebviewWindow) {
    let _ = window.emit_to(window.label(), WINDOW_STATE_EVENT, state_of(window));
}

#[tauri::command]
pub fn app_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
pub fn window_minimize(window: WebviewWindow) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: WebviewWindow) -> Result<WindowState, String> {
    let result = if window.is_maximized().unwrap_or(false) {
        window.unmaximize()
    } else {
        window.maximize()
    };
    result.map_err(|e| e.to_string())?;
    Ok(state_of(&window))
}

#[tauri::command]
pub fn window_close(window: WebviewWindow) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_get_state(window: WebviewWindow) -> WindowState {
    state_of(&window)
}
