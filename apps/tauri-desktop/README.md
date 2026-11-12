# apps/tauri-desktop — MPX Player on Tauri 2 + Rust (migration preview)

Loads the unchanged Angular app (`dist/apps/web`) and implements the desktop bridge (`window.electron`,
`ElectronBridgeApi`) in Rust. The Electron app (`apps/electron-backend`) is still the production build.

- `src-tauri/src/bridge/bridge.js`: preload equivalent. Exposes **only** migrated methods; the app hides
  the rest by its capability checks.
- `src-tauri/src/app_window.rs`: version, window buttons (Windows; Linux keeps the native title bar).
- `src-tauri/src/panel/`: device id, AES-GCM envelope, `api/login.php`, `api/report.php` (ports of
  `apps/electron-backend/src/app/panel/`).
- `src-tauri/src/navigation.rs`: the window never leaves the app origin.
- `src-tauri/build.rs`: panel URL from `libs/shared/interfaces/src/lib/panel-endpoint.util.ts`, panel key from
  `PANEL_MASTER_KEY` or the git-ignored `panel-key.json`, and the per-command ACL.
- `src-tauri/capabilities/default.json`: the only permissions the WebView has.

## Adding a bridge method

1. Port the Electron handler to a `#[tauri::command]` with its validation, plus tests against the Electron behaviour.
2. Register it in `lib.rs` (`generate_handler!`), `build.rs` (`AppManifest::commands`) and grant
   `allow-<name>` in `capabilities/default.json`.
3. Add it to `bridge.js` with the same signature as `ElectronBridgeApi`.
4. Update `docs/MIGRATION_PROGRESS.md` and `docs/FEATURE_INVENTORY.md`.

## Commands

```bash
pnpm nx run tauri-desktop:cargo-test     # cargo test
pnpm nx run tauri-desktop:cargo-clippy   # cargo clippy -D warnings
pnpm nx run tauri-desktop:tauri-dev      # cargo tauri dev (run `pnpm nx serve web` first)
pnpm nx run tauri-desktop:tauri-build    # web build + cargo tauri build
```

The targets are deliberately not named `test`/`lint`/`build`: the existing CI runs `nx run-many --target=test|lint --all`
on machines without Rust or WebKitGTK.

Docs: `docs/MIGRATION_AUDIT.md` and the rest of the migration set listed there.
