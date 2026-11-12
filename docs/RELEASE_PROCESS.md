# MPX Player (Tauri) — release process

Nothing in this branch publishes a release. The Tauri build is a **migration preview** until the cut-over
criteria in MIGRATION_ROADMAP are met. The Electron 1.5.x line remains the production release.

## Versioning

- One version for both builds: the root `package.json` (`1.5.22`), read by `tauri.conf.json`.
- To tell a preview apart from production, build it from `migration/tauri-rust` and name artifacts
  `mpx-player-tauri-*` (CI artifact name). Do not tag `v*` from this branch.

## Secrets (GitHub Actions, never in the repo)

| Secret | Used by | Notes |
| --- | --- | --- |
| `PANEL_MASTER_KEY` | `build.rs` (compiled in) | same secret as the Electron workflows |
| `TMDB_API_KEY` | `tools/tmdb/inject-tmdb-key.mjs` | same as Electron |
| Windows signing (certificate / Trusted Signing credentials) | `bundle.windows.signCommand` | to be added |
| `TAURI_SIGNING_PRIVATE_KEY` + password | Tauri updater signatures (minisign) | only when the updater is enabled |

## Steps (when a preview is wanted)

1. CI green on `migration/tauri-rust` (`.github/workflows/tauri-desktop.yml`: fmt, clippy, tests, Windows bundles).
2. Download the `mpx-player-tauri-windows-x64` artifact, install on a clean Windows 10 and a Windows 11 VM, and
   run the manual checklist in MIGRATION_PROGRESS (login, distributor, playback matrix once migrated).
3. Sign the installers with the authorized certificate (manual or signing job), verify with
   `signtool verify /pa`.
4. Publishing (GitHub release, website, Store) requires the owner's explicit authorization.

## Updater (future)

Use `tauri-plugin-updater` with a static `latest.json` on an HTTPS host the owner controls, signatures
required (`pubkey` in `tauri.conf.json`, private key only in CI secrets), and reject unsigned or mismatched
updates. The Store build must not include the updater (the Store updates it), as is the case today with
Electron 1.5.22.

## Supply chain checks to add to CI

`cargo audit` (RustSec advisories), `cargo deny check licenses bans sources`, `pnpm audit --prod`.
