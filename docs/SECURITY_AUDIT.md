# MPX Player — security audit (Electron today, Tauri target)

Scope: `apps/electron-backend`, the renderer bridge, the panel integration, and the new
`apps/tauri-desktop`. Findings are ordered by impact. This document does not claim that Rust or Tauri prevents
reverse engineering. A desktop client can always be inspected. The goals are a smaller exposed surface, no
privileged code in the WebView, and authorization decided on the server.

## 1. Findings in the Electron build

| # | Finding | Where | Impact | Tauri decision |
| --- | --- | --- | --- | --- |
| E1 | Chromium runs with `disable-web-security`, `allow-running-insecure-content`, site isolation off, `BlockInsecurePrivateNetworkRequests` off | `apps/electron-backend/src/main.ts` | Same-origin policy is off for the whole renderer: any script injection (a malicious provider title rendered unsafely, a compromised CDN asset) can read every origin, including LAN devices. `webSecurity: true` in `webPreferences` is overridden by the switch | **Not reproduced.** CORS stays on; cross-origin needs move to a Rust stream proxy with an explicit allow rule (MULTIMEDIA_INTEGRATION §3) |
| E2 | `NODE_TLS_REJECT_UNAUTHORIZED=0` for the whole main process, plus `certificate-error` accepting any certificate except the panel/public-API list | `main.ts`, `util/tls-policy.ts` | Provider traffic (line credentials in Xtream URLs) can be intercepted on hostile networks. It is a deliberate trade-off for self-signed IPTV servers | Keep the **per-host** policy only: panel and public APIs always verified (done for panel login/report), provider hosts relaxed **per request** instead of process-wide |
| E3 | Panel master key is a symmetric key shipped inside every client (`assets/panel-key.json` in the asar) | `panel/panel-master-key.ts` | Anyone with the installer can extract it, forge `login.php` requests and decrypt line replies. Encryption here hides traffic from casual sniffing; it does not authenticate the client | Same model (key compiled into the binary, never in the WebView). **The server must remain the authority**: device binding, blacklist, `ts` anti-replay (present), rate limits. A per-device key exchange would be the real fix (panel change) |
| E4 | Panel URL is XOR + base64 + hex "obfuscated" | `panel-endpoint.util.ts` | Not a security control: it is in the JS bundle and now the binary | Kept for parity; documented as obfuscation only |
| E5 | Line password is stored in the Xtream playlist record (SQLite, plaintext) | `panel-session.service.ts` → playlist → `playlists` table | Readable by any local process of the user | Tauri DB port: keep the file for compatibility, evaluate the OS keychain (`keyring` crate) for the password field |
| E6 | Remote-control HTTP server listens on port 8765 on **all interfaces**, no authentication | `server/http-server.ts` (`listen(port)` without host) | Anyone on the LAN can send player commands when it is enabled | Tauri port: bind explicitly, add a pairing token |
| E7 | Positive: `contextIsolation`, `sandbox: true`, `nodeIntegration: false`, CSP meta tag, navigation and `window.open` gates, IPC payload validation (URL safety, download directory authorization, playlist write authorization) | `app.ts`, `events/*` | | Carried over (see §2); the validation helpers must be ported with the handlers |

## 2. Tauri build: controls in place now

| Control | Implementation | Verified |
| --- | --- | --- |
| No Node, no fs/shell/http plugin in the WebView | `Cargo.toml` enables no Tauri plugin; WebView only reaches `#[tauri::command]`s | smoke test: `plugin:fs|read_file` → "not allowed" |
| Per-command ACL | `build.rs` `AppManifest::commands([...])` makes every app command require a grant; `capabilities/default.json` grants only the migrated ones to window `main`, local content only | build fails on an unknown permission |
| Minimal core permissions | only `core:event:allow-listen/unlisten`, `core:window:allow-start-dragging` | |
| Frozen bridge | `window.electron` defined non-writable and `Object.freeze`d | smoke test |
| Navigation gate | `on_navigation` allows only `tauri://localhost`, `http(s)://tauri.localhost`, and `localhost:4200` in debug builds | unit test (`navigation.rs`) |
| Panel crypto and master key stay in Rust | the WebView only sees `panelLoginRequest` results; key from `PANEL_MASTER_KEY` (dev) or compiled in from the git-ignored file | tests |
| TLS for the panel | `reqwest` + rustls + OS roots; no "accept invalid" switch exists in the crate | |
| Input validation at the trust boundary | action allow-list, tenant/reseller/PIN/lang validation before any request, report field clipping and kind allow-list, 60 s de-duplication | tests (`login_tests.rs`) |
| CSP | the app's own meta CSP (`apps/web/src/index.html`) stays authoritative; only `ipc:` was added to `connect-src` for Tauri IPC on Linux | |
| `unsafe` | none in the crate | `grep unsafe` = 0 |

## 3. Open items (tracked in MIGRATION_ROADMAP)

- `withGlobalTauri: true` exposes `window.__TAURI__` to the page. This is equivalent to Electron's exposed
  bridge, and the ACL is the boundary. If the page ever loads remote content, it needs its own capability.
- `window.open` / external links: route through `tauri-plugin-opener` with an http(s)-only check (Electron used
  `shell.openExternal` after validation).
- Updater: Tauri updater with minisign signatures. The private key lives in CI secrets only (RELEASE_PROCESS).
- Supply chain: `cargo audit` and `cargo deny` in CI; `pnpm audit` for the frontend; vendor the GitHub-tarball
  dependency (DEPENDENCY_INVENTORY §4).
- Rust panics should be reported like Electron's `uncaughtExceptionMonitor` (panic hook → `report.php`).
