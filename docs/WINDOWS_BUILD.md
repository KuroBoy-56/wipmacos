# MPX Player (Tauri) — Windows 10/11 x64 build

Status: the crate compiles for Windows (checked with `cargo check`/`clippy --target x86_64-pc-windows-gnu`
from Linux). NSIS/MSI installers come from the `windows` job of `.github/workflows/tauri-desktop.yml`. They were
**not** produced or run on a real Windows machine in the session that created this document.

## Requirements (build machine)

- Windows 10/11 x64, Rust stable (MSVC toolchain), Visual Studio 2022 Build Tools ("Desktop development with C++").
- Node 22 + pnpm 10 (for `pnpm nx build web`).
- `cargo install tauri-cli --version "^2" --locked`.
- NSIS and WiX are downloaded by tauri-cli on first bundle.

## Requirements (user machine)

- Windows 10 (1809+) or 11, x64. The Electron build also had ia32; Tauri x64 only, as the brief asks.
- WebView2 Runtime: preinstalled on Windows 11 and on most Windows 10. If it's missing, the installer downloads
  the Evergreen bootstrapper (`webviewInstallMode: downloadBootstrapper`), which needs internet during setup.
  An offline variant can use `offlineInstaller` (much larger installer).

## Build

```powershell
pnpm install --frozen-lockfile
node tools/tmdb/inject-tmdb-key.mjs          # optional, TMDB_API_KEY env
pnpm nx build web                            # Angular app → dist/apps/web
$env:PANEL_MASTER_KEY = "<64 hex>"           # compiled in by build.rs; never commit it
cd apps/tauri-desktop/src-tauri
cargo tauri build --bundles nsis,msi         # → target/release/bundle/{nsis,msi}
```

Development: `pnpm nx serve web` in one terminal, `cargo tauri dev` in `apps/tauri-desktop/src-tauri`.

## Identity and coexistence with the Electron build

- `productName` "MPX Player", identifier `com.fourgray.iptvnator` (same `appId` as the Electron NSIS build),
  version read from the root `package.json`.
- The NSIS installer is per-user (`installMode: currentUser`). The Electron NSIS installer is a different
  installer technology. **Before shipping, test an upgrade over an Electron install**: both register an
  uninstaller under the same product name, which must not leave two entries, and Electron's
  `deleteAppDataOnUninstall: true` must not wipe data the Tauri build still needs (the SQLite file it reopens).
- WebView2 profile data lives in `%LOCALAPPDATA%\com.fourgray.iptvnator\EBWebView`. Electron's localStorage is not
  read (MIGRATION_AUDIT §4.2).

## Signing

Use the existing Authenticode certificate from the CI secret store only: `bundle.windows.certificateThumbprint`
on a machine with the certificate installed, or `bundle.windows.signCommand` (e.g. `signtool`, Azure Trusted
Signing) with credentials from secrets. Never commit `.pfx` files or passwords.

## Microsoft Store (MSIX) — evaluation

- Tauri 2 does not emit MSIX. Options: package the Tauri output with the MSIX Packaging Tool / `makeappx` and a
  hand-written `AppxManifest.xml` (full-trust desktop app, `runFullTrust`), or submit the signed MSI/EXE as a
  Win32 app in Partner Center (allowed for desktop apps; then the Store doesn't update it).
- Replacing the existing listing needs the **same Partner Center identity** (`Package/Identity/Name`, Publisher).
  It's not reserved yet (`docs/MICROSOFT-STORE.md`), so no package can be built for it today. The env-var
  validation in `tools/packaging/store/store-identity.mjs` should be reused for the Tauri MSIX.
- Bundled MPV/VLC (`bin/`) must be added as Tauri `bundle.resources` and byte-verified the same way
  `store-players.mjs` does for the AppX.
