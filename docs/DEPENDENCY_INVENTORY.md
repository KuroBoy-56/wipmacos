# MPX Player — dependency inventory (Electron → Tauri)

## 1. Runtime dependencies of the Electron main process (to be replaced)

| npm package | Used for | Rust / Tauri replacement | Status |
| --- | --- | --- | --- |
| `electron` 41 | runtime, windows, IPC, net, dialogs, shell | `tauri` 2 | shell done |
| `better-sqlite3` 12 + `drizzle-orm` | SQLite DB (worker thread), FTS5 trigram | `rusqlite` (feature `bundled`, FTS5 enabled) | pending |
| `electron-conf` | small JSON settings store (window bounds, player paths, DNS choice and route) | JSON file in `app_config_dir()` (serde) or `tauri-plugin-store` | pending |
| `electron-dl` | downloads | `reqwest` streaming + validated paths | pending |
| `axios` | Xtream/Stalker/playlist HTTP with header overrides and redirect validation | `reqwest` (rustls); redirect policy re-implemented (`validated-axios.ts` rules) | pending |
| `fix-path` | PATH on macOS/Linux for external players | not needed on Windows; `std::env` on Linux | pending |
| `iptv-playlist-parser` (GitHub tarball) | M3U parsing in the main process | Rust M3U parser (or keep parsing in the renderer, see roadmap) | pending |
| `epg-parser`, `saxes` | XMLTV streaming parse | `quick-xml` streaming reader | pending |
| `md5`, `uuid`, `ms`, `date-fns` | helpers | `md-5`, `uuid`, std / `time` | pending |
| Node `crypto` | panel AES-256-GCM + HKDF | `aes-gcm`, `hmac`, `sha2` | **done** |
| Node `child_process` | `reg query`, MPV/VLC launch | `std::process::Command` | **done** (`reg`), players pending |
| Node `http` | remote control server (8765) | `axum` / `hyper` | pending |
| `embedded_mpv.node` (node-gyp addon) | embedded MPV | Rust FFI to libmpv (Windows), `mpv --wid` IPC (Linux) | pending |

Renderer dependencies (Angular, NgRx, Material, hls.js, mpegts.js, video.js, ArtPlayer, ngx-translate …) **stay**:
the frontend is reused unchanged.

## 2. Rust crates added (`apps/tauri-desktop/src-tauri/Cargo.toml`)

| Crate | Why | Notes |
| --- | --- | --- |
| `tauri` 2, `tauri-build` 2 | runtime, IPC, ACL | no Tauri plugins enabled |
| `serde`, `serde_json` | IPC payloads | |
| `reqwest` 0.12 (`rustls-tls-native-roots`, no default features) | panel HTTPS | verification on; OS trust store; honours `HTTPS_PROXY` |
| `aes-gcm` 0.10, `hmac` 0.12, `sha2` 0.10 | panel envelope (RustCrypto) | audited, pure Rust, no OpenSSL |
| `base64` 0.22, `hex` 0.4, `url` 2 | encodings, form bodies | |
| `rand` 0.8 | salt / IV | `ThreadRng` (CSPRNG) |
| `tokio` (dev only) | local HTTP server in tests | |

Policy: no crate is added for a few lines of code; each new crate is listed here with its reason. Run
`cargo audit` (RustSec) in CI. It is not installed in this session, see RELEASE_PROCESS.

## 3. Native / system dependencies

| Component | Windows | Linux |
| --- | --- | --- |
| WebView | WebView2 Runtime (preinstalled on Windows 11, usually on 10; the NSIS/MSI installer downloads the bootstrapper if missing) | WebKitGTK 4.1 (`libwebkit2gtk-4.1-0`), GTK 3 |
| Build toolchain | Rust stable MSVC, Visual Studio 2022 Build Tools, WiX 3 (MSI) / NSIS (downloaded by tauri-cli) | `build-essential`, `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev` |
| libmpv | `libmpv-2.dll` LGPL build already staged by CI (`tools/embedded-mpv/stage-windows-runtime-archive.mjs`) | system `libmpv2` / `mpv`; inside Snap/Flatpak it must be bundled |
| External players | `bin/mpv`, `bin/vlc` (same files as the Electron package) | system `mpv` / `vlc` |

## 4. Dependency risks found

- `iptv-playlist-parser` is fetched from a GitHub tarball (`github:4gray/iptv-playlist-parser`), not a registry.
  The tarball is not pinned by registry integrity across forks and was unreachable from this build environment.
  Vendor it or publish it.
- `epg-parser` is pinned with a caret (`^0.1.6`) while everything else is exact. That's minor; pin it.
- The Electron tree pulls `electron-builder install-app-deps` in `postinstall`, which rebuilds native modules on
  every install. The Tauri build does not need it, but both live in one `package.json` until Electron is retired.
