# MPX Player — multimedia integration (Tauri 2 + Rust)

## 1. What the Electron build plays with today

| Path | Engine | Where | Used for |
| --- | --- | --- | --- |
| Inline web player | hls.js 1.6, mpegts.js 1.8, Video.js 8 (VHS), ArtPlayer 5, inside the renderer | `libs/ui/playback` | default for live TV, VOD and series |
| Embedded MPV (Windows) | libmpv **in process** (`libmpv-2.dll`, LGPL build), `wid` = app-owned child `HWND`, `vo=gpu`, `hwdec=auto-safe` | `native/src/embedded_mpv_win32.cc`, `embedded_mpv_wid_common.h` | automatic switch when the web player fails on format (`externalFallbackRecommended`), or chosen in Settings |
| Embedded MPV (Linux) | separate `mpv --wid=<X11 window>` process, JSON IPC socket, `vo=x11`, `hwdec=no`; X11/XWayland only | same files | same |
| External players | bundled `bin/mpv/mpv.exe`, `bin/vlc/vlc.exe` (Windows); system binaries on Linux | `mpv-session.service.ts`, `vlc-session.service.ts` | Settings "MPV/VLC" mode; movies/series by default, live with `liveExternalPlayer` |

The Electron build also carries playback recovery: http ↔ https retry per host, then a switch to embedded MPV.
It also overrides User-Agent/Referer per stream (`request-header-overrides.service.ts`) and holds
`powerSaveBlocker` while embedded MPV plays. All of this is behaviour to keep.

## 2. Decision for embedded MPV

| | Option A: libmpv in process (Rust FFI) | Option B: mpv process + JSON IPC |
| --- | --- | --- |
| Windows | **Chosen.** It is the current Windows design (child `HWND` + `wid`). The LGPL `libmpv-2.dll` is already produced by CI and checked by `electron-after-pack.cjs`. A Tauri window is a normal Win32 window, so a child `HWND` below the WebView2 controller behaves as it does in Electron | Possible but loses frame-accurate control and adds a process per session |
| Linux | Possible (no Electron `libffmpeg` symbol clash in Tauri), but `wid` still needs X11 | **Chosen.** It is the current Linux design, isolates crashes, and works from Snap/Flatpak with a bundled `mpv` |

Implementation notes:

- Load `libmpv-2.dll` with `libloading` at run time, not at link time. A missing or broken DLL must hide
  embedded MPV (`getEmbeddedMpvSupport` → unsupported) instead of failing at startup. This is the same rule
  as the Electron support probe. Keep the DLL basename (`docs/architecture/embedded-mpv-native.md`).
- FFI surface: `mpv_create`, `mpv_set_option_string`, `mpv_initialize`, `mpv_command(_node)`,
  `mpv_set_property(_string)`, `mpv_get_property`, `mpv_observe_property`, `mpv_wait_event`,
  `mpv_terminate_destroy`. That's about 12 functions, so a hand-written `extern "C"` block is enough. Every
  `unsafe` block gets a `// SAFETY:` comment.
- The event loop runs on its own thread. Snapshots go to the WebView with `emit_to("main", "embedded-mpv-session", …)`,
  the same contract as `onEmbeddedMpvSessionUpdate`.
- The child `HWND` geometry follows `setEmbeddedMpvBounds` (CSS pixels × scale factor). The renderer's
  "control dock below the video" layout stays, because native video still cannot sit under DOM overlays.
- Linux: start the WebView with `GDK_BACKEND=x11` when embedded MPV is enabled on Wayland (Electron used
  `--ozone-platform=x11`). Native Wayland embedding stays out of scope, as it is today.
- Power: hold a display-sleep inhibitor while any session is `playing` (`keepawake` crate or
  `SetThreadExecutionState` / `org.freedesktop.ScreenSaver.Inhibit`).

## 3. Blocker: inline web playback and CORS

Electron disables web security, so hls.js/mpegts.js fetch provider playlists and segments from any origin. Tauri
WebViews enforce CORS (SECURITY_AUDIT E1), and most IPTV servers send no CORS headers. Without a fix, the default
player fails on most lines and every stream falls back to embedded MPV.

Planned fix: a **Rust media proxy** on a Tauri custom scheme, registered with
`register_asynchronous_uri_scheme_protocol("mpxmedia", …)`. The WebView reaches it as `mpxmedia://localhost/…`
(Linux) or `http://mpxmedia.localhost/…` (Windows).

- URL layout: `…/<scheme>/<host[:port]>/<path>?<query>`. HLS relative segment URIs then resolve back into the
  proxy without rewriting. Absolute URIs inside `#EXTM3U` bodies are rewritten by the proxy.
- The proxy streams the body (no buffering), forwards `Range`, applies the per-stream User-Agent/Referer
  overrides, and adds `Access-Control-Allow-Origin` for the app origin only.
- Upstream allowed: `http`/`https` only. Private-network targets are refused unless the user trusted them
  (port `url-safety.ts` and `trustedPrivateNetworkEpgUrls`). TLS: verified, with the per-host provider
  exception from `tls-policy.ts`.
- Frontend change: one URL-mapping function in the playback layer, used only when the bridge exposes it.

Rejected: WebView2 `--disable-web-security` through `additional_browser_args`. It is Windows-only, would
recreate E1, and has no Linux equivalent.

## 4. Codecs and hardware decoding

| Engine | Windows | Linux |
| --- | --- | --- |
| Inline (WebView) | WebView2 = Chromium codecs: H.264/AAC/MP3/Opus/VP9/AV1. HEVC only with hardware support and the HEVC extension. No AC-3/E-AC-3/DTS | WebKitGTK = GStreamer: codecs depend on installed plugins (`gstreamer1.0-libav`, `-plugins-good/bad/ugly`). Snap and Flatpak must ship them |
| Embedded / external MPV | FFmpeg in the LGPL build: everything the web player lacks (MKV, AC-3, HEVC 10-bit, HDR), `hwdec=auto-safe` (D3D11VA/DXVA2) | system or bundled mpv; `hwdec=no` today with `vo=x11` (VA-API can be evaluated with `vo=gpu` on X11) |

## 5. Licensing and redistribution (not legal advice)

- `libmpv-2.dll` is built **LGPL** (`--disable-gpl --disable-nonfree`, manifest origin `vendored-lgpl`). Load
  it dynamically, ship its license text and the source offer, and keep it replaceable by the user.
- `mpv.exe` (often a GPL build) and VLC (GPL/LGPL) are separate programs (aggregation). Ship their licenses and a
  source offer as the Electron package does.
- FFmpeg decoders for patented formats (HEVC, AAC, AC-3) can have patent implications depending on the
  distribution country. That's a business decision, unchanged by this migration.
- Copying the Electron `bin/` folder and DLLs into the Tauri bundle is **not** enough on its own. The packager
  must verify the same files and bytes, as `tools/packaging/store/store-players.mjs` already does for the AppX.

## 6. Status

Nothing in this document is implemented in the Tauri build yet (see MIGRATION_PROGRESS). Order: media proxy
(unblocks the default player) → external MPV/VLC launch → embedded MPV Windows → embedded MPV Linux.
