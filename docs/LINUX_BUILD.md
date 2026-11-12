# MPX Player (Tauri) — Linux build

Status: `.deb` and `.rpm` were bundled successfully on Ubuntu 24.04 with a placeholder frontend (config
validation only: icons, metadata, dependencies `libwebkit2gtk-4.1-0`, `libgtk-3-0`). The release binary
started under Xvfb with the migrated bridge working. AppImage, Snap and Flatpak are **not** built yet.

## Build machine (Ubuntu 24.04)

```bash
sudo apt-get install -y build-essential libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev
cargo install tauri-cli --version "^2" --locked
pnpm install --frozen-lockfile && pnpm nx build web
cd apps/tauri-desktop/src-tauri && cargo tauri build --bundles deb,rpm,appimage
```

AppImage bundling downloads `linuxdeploy` from GitHub at build time.

## Platform behaviour

- Native GTK title bar: WebKitGTK has no CSS `app-region`, so the app's own window buttons are not exposed
  on Linux (`bridge.js`); the app then renders without them.
- Inline playback uses GStreamer through WebKitGTK; HLS/MPEG-TS/H.264/AAC need `gstreamer1.0-libav` and
  `gstreamer1.0-plugins-{good,bad}` on the user machine (or inside the Snap/Flatpak).
- Embedded MPV (when migrated) needs X11 or XWayland and an `mpv` binary (MULTIMEDIA_INTEGRATION §2).

## Panel id

The panel only knows `windows` and `macos`; a Linux build reports `windows` (same rule as the TS
`panelAppId()`). A `linux` id is a panel-side change the owner has to make before a Linux release.

## Snap Store (to do)

`snap/snapcraft.yaml` with `base: core24`, `confinement: strict`, the `gnome` extension (WebKitGTK and GTK),
`plugs: [network, network-bind, audio-playback, opengl, x11, wayland, home, removable-media]`,
`stage-packages: [mpv, libmpv2, gstreamer1.0-libav, gstreamer1.0-plugins-good, gstreamer1.0-plugins-bad]`. Build the
Tauri binary in a `rust` part with `override-build` (`cargo tauri build --no-bundle`). Test: installation,
`snap refresh`, network to the panel, sound, external `mpv` started from inside the snap.

## Flathub (to do)

Manifest `io.github.<owner>.MPXPlayer.yml` with runtime `org.gnome.Platform//47` (WebKitGTK 4.1 included),
`org.freedesktop.Sdk.Extension.rust-stable`, offline cargo sources (`flatpak-cargo-generator.py`) and offline
pnpm/npm sources for the Angular build (Flathub builds have no network), mpv and FFmpeg as modules (or the
`org.freedesktop.Platform.ffmpeg-full` extension), `finish-args: --share=network --socket=pulseaudio
--socket=x11 --device=dri`. Flathub needs AppStream metainfo, an OARS rating and screenshots, and reviews
`--filesystem` holes strictly. Snap and Flatpak differ on filesystem portals, so test downloads and
"open playlist file" separately in each.
