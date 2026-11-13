# MPX Player en Linux — informe de compilación y pruebas

Entorno de esta sesión: Ubuntu 24.04 x64 (contenedor, sin GPU, sin sesión gráfica; Xvfb para pruebas).

## 1. Qué se compiló y probó aquí

| Prueba | Comando | Resultado |
| --- | --- | --- |
| Módulos del Flatpak (LuaJIT, libass 0.17.4, libplacebo 7.360.1, libXpresent 1.0.1, mpv 0.41.0) sobre freedesktop **26.08** | `flatpak-builder --user build flatpak/com.latmpx.MPXPlayer.yml` | **compila** (también se probó 25.08) |
| Manifiesto completo (con un archivo de prueba en lugar de la app) | mismo comando | **compila**; AppStream compuesto, `.desktop` e iconos 128/256/512 instalados, `chrome-sandbox` borrado, lanzador `zypak-wrapper … --ozone-platform=x11 "$@"` entrega los argumentos |
| mpv del Flatpak, dentro del sandbox, runtime 26.08 (FFmpeg 8.1.3 + `codecs-extra`) | `flatpak run --command=mpv com.latmpx.MPXPlayer --vo=null --ao=null <archivo>` | H.264+AAC (MP4), HEVC+AC-3 (MKV), H.264+MP2 (MPEG-TS), HLS (m3u8 + segmentos), subtítulos SRT: **todos decodifican** vídeo y audio hasta el final |
| Salidas de vídeo del mpv del Flatpak bajo Xvfb | `--vo=x11`, `--vo=gpu-next --gpu-sw` | **funcionan** (`x11` es la de MPV embebido en Linux). Sin `--gpu-sw` las salidas GPU no arrancan en Xvfb porque no hay GPU: esperado |
| Linter de Flathub | `flatpak-builder-lint manifest` / `repo` | quedan 2 errores que dependen del dueño: `appid-url-not-reachable` (latmpx.com da 404) y `metainfo-missing-screenshots` (+ su consecuencia `appstream-screenshots-not-mirrored-in-ostree`). Se corrigió `module-luajit-source-git-branch` y el aviso de runtime viejo |
| Metadatos | `appstreamcli validate --no-net`, `desktop-file-validate` | válidos (1 aviso *pedantic* por mayúsculas en el id, aceptado por Flathub) |
| Ruta de datos XDG/Snap/Flatpak | `resolveDefaultDataRoot` con Node | 8/8 |
| Lanzamiento de MPV/VLC en Flatpak y Snap | `external-player-launch-context.ts` con Node | 14/14 (incluye los casos que ya existían) |
| Bloqueo de binarios de Windows en Linux | `node --test tools/packaging/linux-after-pack.test.mjs` | 3/3 |
| Mayúsculas/minúsculas en imports y assets | script de revisión (todo `apps/` y `libs/`) | 0 problemas (detecta los errores de control) |
| Tipos | `tsc --strict` de `path-utils.ts` y `external-player-launch-context.ts` | 0 errores |
| Prueba de arranque | `tools/linux/smoke-test.mjs` contra Chromium con una página que imita el puente | pasa; con `--expect-embedded-mpv` falla cuando MPV no está (correcto); captura PNG guardada |
| YAML | `snap/snapcraft.yaml`, `linux-build.yml`, manifiesto | válidos |

## 2. Qué NO se pudo hacer aquí y por qué

| Pendiente | Motivo | Dónde se hará |
| --- | --- | --- |
| Compilar la app Electron (`pnpm install`, `nx build`, `make:app`) | la política de red de esta sesión rechaza `codeload.github.com` (dependencia `iptv-playlist-parser`, 403); no se rodeó el bloqueo | `linux-build.yml`, job `electron` |
| Jest (`pnpm nx test database / electron-backend`) | mismo motivo (sin `node_modules`) | job `electron`, paso "Unit tests of the Linux changes" |
| Construir el Snap | snapcraft necesita snapd/LXD, que el contenedor no tiene | job `snap` (`snapcore/action-build`) |
| Arrancar la app real en .deb/AppImage, Snap y Flatpak | depende de lo anterior | `smoke-test.mjs` en los tres jobs (puente, id de equipo, SQLite, MPV embebido, captura) |
| Login real, reproducción de un canal real, descargas, favoritos | necesitan una cuenta del panel y una sesión gráfica | prueba manual (lista en LINUX_MIGRATION_PROGRESS) |

## 3. Artefactos

En esta sesión no se generó ningún paquete publicable (solo pruebas locales, fuera del repositorio). Cuando
se ejecute `linux-build.yml`, quedan en la página del run de GitHub Actions:

| Artefacto | Contenido |
| --- | --- |
| `mpx-player-linux-packages` | `*.AppImage`, `*.deb`, `*.rpm`, captura de la prueba |
| `mpx-player-linux-unpacked` | `mpx-player-linux-x64.tar.gz` (entrada del Snap y del Flatpak) |
| `mpx-player-snap` | `mpx-player_<versión>_amd64.snap`, captura |
| `mpx-player-flatpak` | `mpx-player.flatpak` (bundle instalable con `flatpak install --user mpx-player.flatpak`), captura |
