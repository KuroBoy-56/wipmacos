# MPX Player — Tauri migration progress

Last update: 2026-11-12 · Branch `migration/tauri-rust` · Bridge members migrated: **10 / 142**

## Phase status

| Phase | Status |
| --- | --- |
| 1. Audit | ✅ MIGRATION_AUDIT, FEATURE_INVENTORY, DEPENDENCY_INVENTORY, SECURITY_AUDIT, MULTIMEDIA_INTEGRATION, MIGRATION_ROADMAP |
| 2. Branch | ✅ `migration/tauri-rust`; Electron untouched |
| 3. Tauri shell | ✅ first slice: window, ACL, bridge, panel login · ⏳ running the real Angular build (needs `pnpm install`) |
| 4. Backend features | ⏳ not started (next: settings store, SQLite) |
| 5. Multimedia | ⏳ design only (MULTIMEDIA_INTEGRATION) |
| 6. Security hardening | ◐ ACL, navigation gate, no plugins, TLS on for the panel; rest in SECURITY_AUDIT §3 |
| 7. Windows packaging | ◐ NSIS/MSI config + CI job; not run on Windows yet |
| 8. Linux packaging | ◐ deb/rpm bundle validated; Snap/Flatpak to do |
| 9. CI | ◐ `.github/workflows/tauri-desktop.yml` (fmt, clippy, tests, Windows bundles); not run yet |

## Implemented (Rust, tested)

| Bridge member | Rust | Tests |
| --- | --- | --- |
| `platform`, `getAppVersion` | `lib.rs`, `app_window::app_version` | smoke test |
| `minimizeWindow`, `toggleMaximizeWindow`, `closeWindow`, `getWindowState`, `onWindowStateChange` (Windows) | `app_window.rs` | Windows compile check; manual test on Windows pending |
| `panelGetDeviceId` | `panel/device_id.rs` | identical to Electron (vectors + this machine) |
| `panelLoginRequest` | `panel/login.rs` | 7 tests: payloads, `enc`, `cc`/`poll`, `ts` retry, encrypted replies, errors, validation |
| `panelReportError` | `panel/report.rs` | covered by crypto tests; no live call made |

Cross-checks against the Electron code: crypto in both directions, panel URL (hash), device id.

## Validation run in this session

| Command | Result |
| --- | --- |
| `cargo test` (apps/tauri-desktop/src-tauri) | 16 passed |
| `cargo clippy --all-targets -- -D warnings` (Linux) and `cargo clippy --target x86_64-pc-windows-gnu -- -D warnings` | clean |
| `cargo fmt --check` | clean |
| `cargo tauri build --bundles deb,rpm` (placeholder frontend) | both bundles built |
| Release/debug binary under Xvfb with a test page | bridge has exactly the 5 Linux members, IPC + ACL work, `fs` plugin refused |
| `pnpm install --frozen-lockfile` | **failed**: `codeload.github.com` refused by this environment's network policy (403) |
| Angular build, Jest, Playwright | **not run** (needs the install above) |

## Known issues

- The workspace after login does not work in the Tauri build yet (Database and Xtream bridge pending).
- Inline playback will hit CORS until the media proxy exists (MULTIMEDIA_INTEGRATION §3).
- Linux build reports `windows` to the panel (panel needs a `linux` id).
- Electron localStorage (distributor choice) is not imported yet.

## Manual checklist for the next Windows run

1. `pnpm nx build web`, `cargo tauri dev`: login screen shows branding, custom title bar, drag by the top bar,
   double-click maximizes, buttons minimize/maximize/close.
2. Distributor step with a real code → `tenant_config` palette applied; "Omitir" path.
3. `check_mac` on a registered device → line restored; on a blocked device → panel text.
4. Panel «Errores de las apps» receives a test error from the renderer.
