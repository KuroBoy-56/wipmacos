# MPX Player — feature inventory and migration status

Status legend: **Migrated** = implemented in Rust, tested, exposed by the bridge · **Partial** = some methods
migrated · **Pending** = still Electron-only (hidden in the Tauri build by the app's capability checks) ·
**Frontend** = runs inside the WebView, no port needed, but depends on something listed here.

## 1. Bridge contract (`ElectronBridgeApi` + `PanelBridgeApi`, 142 members)

| Domain | Members | Electron owner | Status |
| --- | --- | --- | --- |
| Window / app | `platform`, `getAppVersion`, `minimizeWindow`, `toggleMaximizeWindow`, `closeWindow`, `getWindowState`, `onWindowStateChange` (7) | `window.events.ts`, `electron.events.ts` | **Migrated** (window buttons on Windows only; Linux uses the native title bar) |
| Panel | `panelGetDeviceId`, `panelLoginRequest`, `panelReportError` (3 of 6) | `panel/*.ts` | **Partial**: `getSecureDns`, `setSecureDns` (DNS-over-HTTPS fallback) and `panelClearCacheAndRestart` pending |
| Database: playlists, categories, content, search, app state | `dbCreatePlaylist` … `dbCancelOperation`, `onDbOperationEvent`, `onDbSaveContentProgress` (27) | `events/database/*.ts`, `workers/database.worker.ts` | Pending |
| Database: M3U app playlists | `dbUpsertAppPlaylist(s)`, `dbGetAppPlaylist(s)`, `dbGetAppPlaylistMetas` (5) | same | Pending |
| Database: favorites | `dbAddFavorite` … `dbReorderGlobalFavorites`, `dbGetAppPlaylistFavoriteChannels` (8) | same | Pending |
| Database: recently viewed / added | `dbGetRecentlyViewed` … `dbRemoveRecentItemsBatch` (8) | same | Pending |
| Database: playback positions | `dbSavePlaybackPosition` … `onPlaybackPositionUpdate` (8) | same | Pending |
| Database: TMDB cache | `dbGetTmdbMetadata`, `dbSetTmdbMetadata` (2) | same | Pending |
| EPG | `fetchEpg`, `getChannelPrograms`, `getCurrentProgramsBatch`, `getEpgChannels(ByRange)`, `getEpgChannelMetadata`, `forceFetchEpg`, `clearEpgData(ForSource)`, `checkEpgFreshness`, `searchEpgPrograms`, `onEpgProgress` (12) | `epg.events.ts`, `epg-worker.service.ts`, `workers/epg-*.ts` | Pending |
| Playlists import / refresh | `fetchPlaylistByUrl`, `updatePlaylistFromFilePath`, `openPlaylistFromFile`, `getPathForFile`, `autoUpdatePlaylists`, `refreshPlaylist`, `cancelPlaylistRefresh`, `onPlaylistRefreshEvent` (8) | `playlist.events.ts`, `playlist-refresh.worker.ts` | Pending |
| Xtream / Stalker | `xtreamRequest`, `xtreamProbeUrl`, `xtreamCancelSession`, `stalkerRequest`, `onPortalDebugEvent` (5) | `xtream.events.ts`, `stalker.events.ts`, `util/tls-policy.ts`, `smart-dns.service.ts` | Pending |
| External players | `openInMpv`, `openInVlc`, `setMpvPlayerPath`, `setVlcPlayerPath`, `closeExternalPlayerSession`, `onPlayerError`, `onExternalPlayerSessionUpdate` (7) | `player.events.ts`, `mpv-session.service.ts`, `vlc-session.service.ts` | Pending |
| Embedded MPV | `getEmbeddedMpvSupport`, `prepareEmbeddedMpv`, `create/load/dispose…Session`, bounds, pause, seek, volume, audio/subtitle track, speed, aspect, recording (18) | `embedded-mpv-native.service.ts` + native addon | Pending (see MULTIMEDIA_INTEGRATION) |
| Downloads | `downloadsStart` … `onDownloadsUpdate` (12) | `events/database/downloads.events.ts`, `download-*.ts` | Pending |
| Remote control | `updateRemoteControlStatus`, `getLocalIpAddresses`, `onRemoteControlCommand`, `onChannelChange` (4) | `remote-control.events.ts`, `server/http-server.ts` | Pending |
| Settings / files | `updateSettings`, `setUserAgent`, `getAiSettings`, `saveFileDialog`, `writeFile` (5) | `settings.events.ts`, `shared.events.ts` | Pending |

Totals: **10 of 142 members migrated** (7 window/app + 3 panel).

## 2. User-facing features

| Feature | Depends on (bridge domains) | Tauri status |
| --- | --- | --- |
| App shell, Netflix-style UI, branding, dark theme, translations (es/en/pt/fr), distributor palette | Frontend | Frontend unchanged; loads in Tauri (renders once `web:build` output is bundled) |
| Custom title bar and window buttons (Windows) | Window / app | **Migrated** |
| Distributor step (`tenant_config`), device login (`check_mac`, `submit_url`, `fetch_dns`), Auto-Demo, reseller code, review theme, PIN change, blacklist (`device_blocked`), fake screen | Panel login | **Migrated** (Rust `panel_login_request`, same payloads and replies) |
| Error reports to the panel («Errores de las apps») | Panel report | **Migrated** for renderer reports; Rust panics are not reported yet |
| DNS button (Automático / DoH providers) | Panel DNS | Pending (button hidden in Tauri until DoH works) |
| Remote cache clear + restart (`cache_clear`) | Panel cache clear + Database | Pending |
| Workspace after login: Xtream line import, Inicio / Películas / Series / Explorar / Mi lista / Continuar viendo | Database, Xtream | Pending: **the workspace is not usable in the Tauri build yet** |
| Panel sync (progress, favorites) | Frontend `fetch` to `progress.php` + Database cache | Frontend; needs Database and CORS check |
| EPG (provider + panel fallback) | EPG, Database | Pending |
| Live TV, VOD, series inline playback (hls.js, mpegts.js, Video.js, ArtPlayer) | Frontend + stream CORS proxy | Pending (blocker: renderer CORS, see MIGRATION_AUDIT §4.1) |
| Embedded MPV, automatic switch on format errors | Embedded MPV | Pending |
| External MPV / VLC (bundled `bin/`) | External players | Pending |
| Sports agenda, tables, fixtures, "Ver canales" | Frontend `fetch` to panel APIs | Frontend; needs CORS check |
| Top 10, alerts, login poster wall | Frontend `fetch` to panel APIs | Frontend; needs CORS check |
| Parental control (PIN from `check_mac`, `set_pin`) | Panel login | **Migrated** (login side); category filtering is frontend |
| TMDB enrichment, actor pages, similar rails | Frontend + Database (cache, `dbMatchTitles`) | Pending (Database) |
| Downloads manager | Downloads | Pending |
| Remote control web app (port 8765) | Remote control | Pending |
| Global search (Electron-only route) | Database | Pending |
| M3U playlists, Stalker portals | Database, Playlists, Stalker | Pending |
| Playlist backup / restore | Settings / files, Database | Pending |
| Touch and pen input (Windows) | Frontend | Frontend unchanged |
