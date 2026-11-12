# MPX Player — Tauri migration roadmap

Rule for every step: a bridge method is added to `apps/tauri-desktop/src-tauri/src/bridge/bridge.js` **only**
when its Rust command is implemented, granted in `capabilities/default.json`, listed in `build.rs`, and covered by
a test that matches the Electron behaviour. Until then the app hides the feature itself. Update
[MIGRATION_PROGRESS](MIGRATION_PROGRESS.md) at the end of each step.

## Phase 1: audit ✅
Audit documents in `docs/` (this set).

## Phase 2: branch ✅
`migration/tauri-rust`; the Electron app and its build stay as they are.

## Phase 3: Tauri shell + bridge pattern ✅ (first slice)
- `apps/tauri-desktop/src-tauri`: window, ACL, navigation gate, bridge init script.
- Migrated: app version, platform, window controls (Windows), panel device id, panel login, panel error report.
- **Next in this phase:** build `web` (`pnpm nx build web`) and run the real Angular app in the shell on
  Windows and Linux. That needs a machine where `pnpm install` works (blocked here, see MIGRATION_AUDIT §4.6).
  Acceptance: login screen renders with branding, distributor step and `check_mac` work against the real panel.

## Phase 4: backend features, in dependency order
1. **Settings store** (`electron-conf` keys: window bounds, player paths/args/reuse, DNS choice/route) as JSON in
   `app_config_dir()`. Import the Electron `config.json` once.
2. **SQLite** with `rusqlite` (bundled, FTS5): port `libs/shared/database` schema and `createTables()`
   verbatim and open the **same file** (`~/.iptvnator/databases/iptvnator.db`). Then port the 56 worker
   operation types (`apps/electron-backend/src/app/workers/database-worker.types.ts`) group by group:
   app state → playlists → categories/content (+ import progress/cancel) → favorites → recent → playback positions
   → TMDB cache → title match/global search (trigram FTS). Acceptance per group: the Electron worker's spec cases
   ported to Rust tests on a temp DB, plus opening a real Electron DB copy.
3. **Renderer storage import:** one-time read of the Electron `Local Storage/leveldb` keys (`panel_tenant*`,
   `session_*`, settings) so the distributor step is not asked again (MIGRATION_AUDIT §4.2).
4. **Xtream / Stalker clients** (`xtreamRequest`, `xtreamProbeUrl`, `stalkerRequest`, `xtreamCancelSession`):
   `reqwest`, per-host TLS policy (`tls-policy.ts`), validated redirects (`validated-axios.ts`), URL safety
   (`url-safety.ts`), scheme fallback (`xtream-scheme-fallback.ts`), header overrides. At this point the
   **workspace becomes usable** after login.
5. **DNS button**: `getSecureDns`/`setSecureDns` with system → DoH (Cloudflare → Google) fallback via a custom
   `reqwest` DNS resolver (`hickory-resolver` with DoH), remembered route. Then expose the two methods.
6. **Remote cache clear + restart** (`panelClearCacheAndRestart`): delete the re-downloadable tables, clear the
   WebView HTTP cache **without** touching localStorage (WebView2: `ICoreWebView2Profile2::ClearBrowsingData`
   with cache kinds; WebKitGTK: `WebsiteDataManager` cache types), then `AppHandle::restart()`.
7. **Playlists** (M3U by URL/file, refresh worker, auto-update) and **EPG** (streaming XMLTV with `quick-xml`,
   freshness, progress events, batch queries).
8. **Downloads** (streamed, validated directory authorization ported from `download-directory-authorization.ts`).
9. **Remote control server** (bind address + pairing token, see SECURITY_AUDIT E6).
10. **Settings/files**: save dialog, write file (scoped `tauri-plugin-dialog`), user agent, AI settings.

## Phase 5: multimedia (see MULTIMEDIA_INTEGRATION)
Media proxy → external MPV/VLC → embedded MPV Windows (libmpv FFI) → embedded MPV Linux (process + IPC) →
display-sleep inhibitor. Acceptance: manual matrix (live HLS, live MPEG-TS, VOD MKV with AC-3, series resume,
audio/subtitle tracks, seek, volume, fullscreen) compared side by side with the Electron build.

## Phase 6: security hardening
`window.open` → opener with an http(s) check; panic hook → `report.php`; `cargo audit` + `cargo deny` in CI;
keychain for the line password (evaluate); review the ACL after every phase.

## Phase 7: Windows packaging
NSIS + MSI x64 (`cargo tauri build`), WebView2 bootstrapper, `bin/` MPV/VLC as resources with byte
verification, `libmpv-2.dll` beside the exe, signing with the existing certificate (env-only), MSIX evaluation
for the Store (identity from Partner Center env vars, as `make:store` does today). See WINDOWS_BUILD.

## Phase 8: Linux packaging
deb/AppImage/rpm from Tauri; Snap (`snapcraft.yaml`, `gnome` extension, `stage-packages: mpv, gstreamer1.0-libav`)
and Flathub (`org.gnome.Platform` runtime, mpv and GStreamer modules). The panel needs a `linux` app id first.
See LINUX_BUILD.

## Phase 9: CI/CD and release
GitHub Actions: Rust test/clippy on Linux, Windows build job, artifacts only; no automatic publishing. See
RELEASE_PROCESS.

## Cut-over criteria (before the Tauri build replaces Electron for users)
All 142 bridge members migrated, or explicitly retired with the owner's approval; the multimedia matrix
passes; an Electron → Tauri upgrade on a real Windows install keeps the device registration, distributor,
favorites and positions; the installers are signed; the Store submission is decided.
