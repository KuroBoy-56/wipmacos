# MPX Player en Linux — informe de compilación y pruebas

Entorno de esta sesión: Ubuntu 24.04 x64 (contenedor, sin GPU, sin sesión gráfica; Xvfb para pruebas).

## 0. Resultado del build de CI (14-11-2026)

**1.5.25:** run `43600666554` (commit `76ee9b7`), todo en verde, release **`linux-v1.5.25`**
(https://github.com/KuroBoy-56/wipmacos/releases/tag/linux-v1.5.25). Además de las pruebas de abajo corrió los tests
del login (Auto-Demo / tema de prueba), de VLC solo en Windows y del id `linux` ante el panel (login, reporte,
progreso, distribuidor).

**1.5.24:**

Run `43572679461` de `linux-build.yml` (commit `c67c478`), todo en verde, publicado como release
**`linux-v1.5.24`** (https://github.com/KuroBoy-56/wipmacos/releases/tag/linux-v1.5.24).

| Prueba (app real, Xvfb, sin contactar el panel) | linux-unpacked | AppImage | Snap (estricto) | Flatpak |
| --- | --- | --- | --- | --- |
| Puente `window.electron`, interfaz dibujada, título, versión 1.5.24 | OK | OK | OK | OK |
| Id de equipo (formato del panel) | OK | OK | OK | OK |
| SQLite escribe y lee en la carpeta de datos del paquete | OK | OK | OK | OK |
| Clave del panel dentro del build (`NETWORK`, no `NO_MASTER_KEY`) | OK | OK | OK | OK |
| MPV embebido disponible (`prepareEmbeddedMpv().supported`) | OK (mpv portable, mpv del sistema desinstalado) | OK | OK | OK |

mpv portable reproduciendo H.264/AAC, HEVC/AC-3 y MPEG-TS en contenedores **Debian 12, Fedora 41 y Arch**: OK.
Tests unitarios de los cambios de Linux (Jest): OK. Layout del paquete, metadatos AppStream y `.desktop`: OK.

Problemas que aparecieron en CI y se corrigieron (cada uno con su causa comprobada):

| Problema | Causa | Arreglo |
| --- | --- | --- |
| 12 tests fallaban en `player.events.spec.ts` | ya fallaban en `main` (VLC reescrito en MPX; `buildVlcEnqueueCommands`/`parseVlcRc*` ya no existen) | los tests de Linux pasaron a `external-player-launch-context.spec.ts`; el spec viejo queda como en `main` (pendiente arreglarlo allí) |
| La prueba de arranque no veía la ventana | Angular cambia la URL de `…/index.html` a `…/login` | la prueba toma la página de la app sea cual sea la ruta |
| Arch: dependencias sin resolver | `pacman -Sy` sin `-u` en la imagen de prueba | `pacman -Syu` |
| Flatpak: `eu-strip` no encontrado | `elfutils` no llega con `--no-install-recommends` | instalarlo en el job |
| Snap: MPV embebido «no encontrado» | la limpieza del Snap quitaba 21 bibliotecas de mpv (FFmpeg, PulseAudio, fontconfig…) por estar también en `gnome-46-2404`, pero la extensión de core24 no pone esas bibliotecas en `LD_LIBRARY_PATH`. Reproducido aquí con core24 + gnome-46-2404 + mesa-2404 en `bwrap` | la limpieza solo quita lo que trae core24; además `fix-path` ya no se usa dentro de Snap/Flatpak |


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

Publicados en el release `linux-v1.5.24`: `MPX-Player-1.5.24-linux-x86_64.AppImage`, `MPX-Player-1.5.24-linux-amd64.deb`,
`MPX-Player-1.5.24-linux-x86_64.rpm`, `mpx-player_1.5.24_amd64.snap`, `MPX-Player-1.5.24-linux-x86_64.flatpak`.
En cada run de `linux-build.yml` quedan además en la página del run:

| Artefacto | Contenido |
| --- | --- |
| `mpx-player-linux-packages` | `*.AppImage`, `*.deb`, `*.rpm`, captura de la prueba |
| `mpx-player-linux-unpacked` | `mpx-player-linux-x64.tar.gz` (entrada del Snap y del Flatpak) |
| `mpx-player-snap` | `mpx-player_<versión>_amd64.snap`, captura |
| `mpx-player-flatpak` | `mpx-player.flatpak` (bundle instalable con `flatpak install --user mpx-player.flatpak`), captura |
