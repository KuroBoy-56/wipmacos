// Tauri replacement for apps/electron-backend/src/app/api/main.preload.ts.
// Builds `window.electron` (ElectronBridgeApi) over Tauri commands. ONLY methods whose Rust side
// is migrated are listed: the Angular app checks `typeof window.electron.x === 'function'`
// (RuntimeCapabilitiesService and others) and hides what is missing.
// Track progress in docs/MIGRATION_PROGRESS.md before adding a method here.
(function () {
    'use strict';
    if (window.electron) return;

    const platform = window.__MPX_TAURI_PLATFORM__;
    const tauri = () => window.__TAURI__;
    const invoke = (cmd, args) => tauri().core.invoke(cmd, args);

    // Same contract as ipcRenderer.on/off in the preload: returns a synchronous unsubscribe.
    function subscribe(event, callback) {
        let unlisten = null;
        let stopped = false;
        tauri()
            .event.listen(event, (e) => callback(e.payload))
            .then((fn) => (stopped ? fn() : (unlisten = fn)));
        return () => {
            stopped = true;
            if (unlisten) unlisten();
        };
    }

    const bridge = {
        platform,
        getAppVersion: () => invoke('app_version'),

        // Panel (PanelBridgeApi): crypto and the master key stay in Rust.
        panelGetDeviceId: () => invoke('panel_get_device_id'),
        panelLoginRequest: (action, payload) => invoke('panel_login_request', { action, payload: payload ?? null }),
        panelReportError: (report) => invoke('panel_report_error', { report }),
    };

    // Frameless window with the app's own buttons: Windows only. WebKitGTK (Linux) does not support
    // CSS app-region, so there the native title bar stays and these methods are left out on purpose.
    if (platform === 'win32') {
        Object.assign(bridge, {
            minimizeWindow: () => invoke('window_minimize'),
            toggleMaximizeWindow: () => invoke('window_toggle_maximize'),
            closeWindow: () => invoke('window_close'),
            getWindowState: () => invoke('window_get_state'),
            onWindowStateChange: (callback) => subscribe('window-state-changed', callback),
        });
        installDragRegions();
    }

    Object.defineProperty(window, 'electron', { value: Object.freeze(bridge), writable: false });

    // Electron honours CSS `app-region: drag`; Tauri does not, so a press on a drag region
    // starts a native window drag (and a double click toggles maximize), like the title bar.
    function regionOf(target) {
        for (let el = target; el && el.nodeType === 1; el = el.parentElement) {
            const style = getComputedStyle(el);
            const value = style.getPropertyValue('app-region') || style.getPropertyValue('-webkit-app-region');
            if (value === 'drag' || value === 'no-drag') return value;
        }
        return 'none';
    }

    function installDragRegions() {
        document.addEventListener('mousedown', (e) => {
            if (e.button !== 0 || regionOf(e.target) !== 'drag') return;
            if (e.detail === 2) {
                invoke('window_toggle_maximize');
            } else {
                tauri().window.getCurrentWindow().startDragging();
            }
        });
    }
})();
