# MPX Player — Electron → Tauri 2 + Rust: migration audit

Branch: `migration/tauri-rust` (created from `claude/reproductor-windows-requisitos-7tuhbs` = `main` + nothing
on top of it at audit time). The Electron app is untouched and still builds as before.

Companion documents: [FEATURE_INVENTORY](FEATURE_INVENTORY.md) · [DEPENDENCY_INVENTORY](DEPENDENCY_INVENTORY.md) ·
[SECURITY_AUDIT](SECURITY_AUDIT.md) · [MULTIMEDIA_INTEGRATION](MULTIMEDIA_INTEGRATION.md) ·
[MIGRATION_ROADMAP](MIGRATION_ROADMAP.md) · [MIGRATION_PROGRESS](MIGRATION_PROGRESS.md) ·
[WINDOWS_BUILD](WINDOWS_BUILD.md) · [LINUX_BUILD](LINUX_BUILD.md) · [RELEASE_PROCESS](RELEASE_PROCESS.md)

## 1. What the application really is

The migration brief describes "HTML, CSS and JavaScript". The repository is more specific, and the plan follows
the repository:

| Layer | Reality in this repo | Size |
| --- | --- | --- |
| Frontend | **Angular 21 + TypeScript + SCSS**, NgRx / Signal Store, Angular Material, ngx-translate (es/en/pt/fr), Nx monorepo (`apps/web` + 30 `libs/` projects) | shared with the PWA build |
| Desktop runtime | Electron 41 (`apps/electron-backend`) | ~19 000 lines of TypeScript (no specs) |
| Native code | Embedded-MPV Node addon (`apps/electron-backend/native`, C++/Obj-C++: Win32 `HWND` + libmpv, X11 + `mpv --wid`, macOS OpenGL) | 6 files |
| Storage | SQLite (better-sqlite3 + Drizzle) in a worker thread, 11 tables + FTS5 trigram index; `electron-conf` JSON store; renderer `localStorage` | |
| Bundled players | MPV and VLC in `bin/` (shipped in the NSIS and AppX packages) | |
| Distribution | electron-builder NSIS x64 + ia32, AppX for Microsoft Store (`make:store`), macOS on the `macos` branch, Linux AppImage/deb/rpm/snap/flatpak/pacman targets inherited from IPTVnator | |

There is **no Firebase** (removed in this fork) and **no built-in updater** (removed in 1.5.22). Authentication,
licensing, favorites, Continue Watching, EPG fallback, sports and alerts all go to the operator **panel's PHP APIs**
(`api/login.php`, `progress.php`, `epg.php`, `sports*.php`, `tmdb.php`, `img.php`, `alerta.php`, `top10.php`,
`report.php`). See `docs/architecture/panel-integration.md`.

## 2. The migration seam

The renderer never touches Node or Electron directly. Everything desktop-only goes through **one contract**:

- `window.electron` typed as `ElectronBridgeApi` (`libs/shared/interfaces/src/lib/electron-api.interface.ts`):
  **136 members** plus the 6-member `PanelBridgeApi` = **142**, implemented in
  `apps/electron-backend/src/app/api/main.preload.ts` (`ipcRenderer.invoke` / `ipcRenderer.on`).
- The frontend already checks each capability by name (`RuntimeCapabilitiesService.hasElectronMethod`,
  `typeof window.electron?.x === 'function'` in 34 files) and hides features whose method is missing.
- `DataFactory()` (`apps/web/src/app/app.config.ts`) picks `ElectronService` when `window.electron` exists,
  otherwise `PwaService`.

**Decision:** keep the Angular frontend unchanged and reimplement `ElectronBridgeApi` in Rust, method by
method. A Tauri initialization script (`apps/tauri-desktop/src-tauri/src/bridge/bridge.js`) plays the role of
the preload and exposes **only the methods whose Rust side is implemented and tested**, so the app's existing
capability checks hide the rest. There are no stubs and no simulated responses.

Rejected alternatives:

- *Rewrite the UI in plain HTML/JS:* would discard 30 libraries of working UI and violate "preserve the interface".
- *Run the PWA build inside Tauri:* the PWA needs the `web-backend` HTTP proxy for Xtream/Stalker CORS and
  has no SQLite, external players, downloads or panel crypto. It would lose features, not migrate them.
- *Stub all 142 methods and fill them in later:* the app would believe features exist and fail at run time.

## 3. Electron API → Tauri replacement map

| Electron (where) | Tauri 2 / Rust replacement | Status |
| --- | --- | --- |
| `contextBridge.exposeInMainWorld('electron', …)` (`main.preload.ts`) | `WebviewWindowBuilder::initialization_script(bridge.js)`, frozen `window.electron` | done |
| `ipcRenderer.invoke` / `ipcMain.handle` | `window.__TAURI__.core.invoke` / `#[tauri::command]` + `generate_handler!` | done (pattern) |
| `ipcRenderer.on` + `webContents.send` | `window.__TAURI__.event.listen` / `Emitter::emit_to` (bridge returns a sync unsubscribe) | done (pattern) |
| `contextIsolation` / `sandbox: true` / `nodeIntegration: false` | no Node in the WebView at all; per-command ACL (`AppManifest::commands` + `capabilities/default.json`) | done |
| `will-navigate` gate, `setWindowOpenHandler` (`app.ts`) | `on_navigation` → `navigation::allow_navigation` | navigation done; `window.open` → system browser pending |
| `BrowserWindow` frameless + `WINDOW:*` IPC (`window.events.ts`) | `decorations(false)` on Windows, window commands, `window-state-changed` event | done (Windows); Linux keeps the native title bar |
| CSS `app-region: drag` | bridge maps it to `startDragging()` (WebView2); not supported by WebKitGTK | Windows only |
| `app.getVersion()` | `package_info().version`, read from root `package.json` | done |
| `net.fetch` (Chromium network stack) for the panel | `reqwest` + rustls, OS trust store | done for login/report |
| Node `crypto` (AES-256-GCM, HMAC-SHA256) | `aes-gcm`, `hmac`, `sha2` | done, byte-compatible |
| `child_process.execFile('reg', …)` | `std::process::Command` with `CREATE_NO_WINDOW` | done |
| `electron-conf` (`store.service.ts`) | JSON file in `app_config_dir()` (or `tauri-plugin-store`) | pending |
| `better-sqlite3` + Drizzle + `worker_threads` | `rusqlite` (bundled, FTS5) on a blocking thread pool, same schema and file | pending |
| `dialog.showSaveDialog/showOpenDialog` | `tauri-plugin-dialog` (scoped) | pending |
| `shell.openExternal` / `showItemInFolder` | `tauri-plugin-opener` with an http(s)-only rule | pending |
| `electron-dl` + `session.downloadURL` | `reqwest` streaming to a validated path, progress events | pending |
| `app.relaunch()` | `AppHandle::restart()` | pending (with cache clear) |
| `session.clearCache/clearStorageData` | `WebviewWindow::clear_all_browsing_data()` clears **too much** (localStorage); needs a narrower API | blocker, see roadmap |
| `powerSaveBlocker` | `keepawake` crate or platform API | pending (with embedded MPV) |
| `app.commandLine.appendSwitch('disable-web-security')` | **no equivalent on WebKitGTK**; WebView2 `additional_browser_args` exists but is not adopted | see §4 |
| Node `http.createServer` (remote control, port 8765) | `axum`/`hyper` server on a Tokio task | pending |
| Native addon `embedded_mpv.node` | Rust FFI to libmpv (Windows), `mpv --wid` + JSON IPC (Linux) | pending, see MULTIMEDIA_INTEGRATION |

## 4. Blockers and risks found by the audit

1. **Cross-origin requests from the renderer.** Electron starts with `disable-web-security` and
   `allow-running-insecure-content`, so the Angular code (hls.js, mpegts.js, video.js, ArtPlayer, panel
   `fetch`es such as `progress.php`, `tmdb.php`, `img.php`) reads any origin without CORS headers. A Tauri WebView
   enforces CORS. Whether the panel APIs send CORS headers has not been checked yet (they must be tested
   from the Tauri origin). IPTV providers usually do not send them. **Inline playback of most provider streams will fail in Tauri until a Rust stream proxy (custom URI
   scheme that adds CORS headers and the provider User-Agent/Referer) is in place.** The plan is in
   MULTIMEDIA_INTEGRATION §3.
2. **Renderer storage does not carry over.** `localStorage` (panel session `session_*`, distributor code,
   settings, `cache_clear_seen`) lives in Electron's Chromium profile, which WebView2/WebKitGTK cannot read.
   After the switch the device is still recognized (same device id, verified), so `check_mac` restores the line
   automatically, but the **distributor choice is asked again**. Mitigation: a one-time import of the Electron
   `Local Storage/leveldb` keys from Rust (roadmap phase 4).
3. **SQLite data can be kept.** The Electron DB file (`~/.iptvnator/databases/iptvnator.db`) is plain SQLite
   that `rusqlite` can open in place, so favorites, positions and caches survive if the schema is ported 1:1.
4. **Panel app id on Linux.** `panelAppId()` reports `windows` for every non-Mac platform. A Linux build would
   register as `windows` on the panel. The panel needs a `linux` id (owner decision, panel-side change).
5. **The Microsoft Store listing.** A Tauri MSIX is a new package. It can only update the existing listing if
   the Partner Center identity (Name, Publisher) matches, and it still has to pass certification as a new
   submission. The Partner Center identity is not reserved yet (`docs/MICROSOFT-STORE.md`).
6. **Dependencies blocked in this environment.** `pnpm install --frozen-lockfile` fails here because the agent's
   network policy refuses `codeload.github.com` (dependency `iptv-playlist-parser` is a GitHub tarball). The
   Angular build, Jest and Playwright suites therefore **could not run in this session**. The Rust side builds and
   is tested here. Long term, publishing that parser to npm (or vendoring it) would also remove a supply-chain
   risk.
7. **Ported code is large.** About 19 000 lines of backend TypeScript map to Rust. The heaviest parts are
   the DB worker (56 operation types, FTS5 trigram search, import progress/cancel), EPG streaming XMLTV parsing,
   Xtream/Stalker clients with the TLS policy and DNS-over-HTTPS fallback, downloads, and embedded MPV.

## 5. What was verified in this session

- Rust crate `apps/tauri-desktop/src-tauri` builds on Ubuntu 24.04 (Rust 1.97, Tauri 2, WebKitGTK 4.1);
  `cargo clippy -D warnings` is clean; 16 unit/integration tests pass.
- Panel crypto is byte-compatible with the Electron code in both directions (Node → Rust vector in the tests;
  Rust → Node checked with the original `panel-crypto.ts`).
- The compiled-in panel URL equals the TypeScript `panelEndpoint('login.php')` (compared by SHA-256, URL never
  printed).
- The device id computed by Rust equals Electron's `normalizeDeviceId(readRawMachineId())` on this machine.
- The real binary was started under Xvfb: `window.electron` is injected and frozen with exactly the 5 migrated
  members, IPC works, the version is read from `package.json`, and a non-granted plugin call (`fs`) is refused.
