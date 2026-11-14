# MPX Player en Linux — empaquetado (Snap Store, Flathub, .deb/.rpm/AppImage)

## 1. Identidad

| | Valor | Nota |
| --- | --- | --- |
| Nombre visible | MPX Player | igual que en Windows |
| Ejecutable | `mpx-player` (`mpx-player.bin` = Electron, `mpx-player` = lanzador) | en Windows sigue `MPX Player.exe` |
| Snap | `mpx-player` | **hay que registrarlo** en la Snap Store (`snapcraft register mpx-player`); si está ocupado, cambiar `name:` |
| Flatpak / AppStream | `com.latmpx.MPXPlayer` | **pendiente de decisión:** Flathub verifica que el dueño controla `latmpx.com`, y hoy `https://latmpx.com` responde 404. Alternativa: `io.github.kuroboy_56.MPXPlayer` (verificación por la cuenta de GitHub) |
| Archivos | `MPX-Player-<versión>-linux-<arch>.{AppImage,deb,rpm}` (+ `.snap` y `.flatpak` en el release) | |
| Versión | la de `package.json` (1.5.24) | Snap la lee al compilar (`adopt-info`); AppStream lleva `<releases>` y hay que añadir cada versión |

## 2. Archivos

| Archivo | Para qué |
| --- | --- |
| `electron-builder.json` (`linux`, `deb`) | `.deb`, `.rpm`, AppImage x64 y la carpeta `linux-unpacked` que usan Snap y Flatpak |
| `tools/packaging/linux-after-pack.cjs` | lanzador con `--no-sandbox` automático; falla si hay `.exe`/`.dll` de Windows |
| `snap/snapcraft.yaml`, `snap/local/mpx-player`, `snap/gui/mpx-player.desktop` | Snap (core24, estricto) |
| `flatpak/com.latmpx.MPXPlayer.yml` | Flatpak (freedesktop 26.08, Electron2.BaseApp, mpv compilado) |
| `apps/electron-backend/linux/com.latmpx.MPXPlayer.{metainfo.xml,desktop}` | metadatos AppStream y entrada de escritorio del Flatpak |
| `tools/linux/bundle-mpv.sh` + `apps/electron-backend/src/app/util/bundled-mpv-path.ts` | mpv portable dentro del AppImage/.deb/.rpm (`resources/bin/mpv`, va primero en `PATH`) |
| `tools/linux/smoke-test.mjs` | prueba de arranque real de cada paquete (puente, id de equipo, SQLite, MPV embebido, clave del panel) |
| `.github/workflows/linux-build.yml` | compila, prueba y sube los artefactos (sin publicar) |

La app Electron se compila **una vez** en CI con los secretos (`PANEL_MASTER_KEY`, `TMDB_API_KEY`), y Snap y
Flatpak empaquetan esa misma carpeta `linux-unpacked`. Así funciona porque Flathub y Launchpad no pueden
tener secretos: un build desde el código fuente en sus servidores saldría sin la clave del panel (el login
diría "falta la clave del panel").

## 3. Permisos y por qué

### Snap (confinamiento estricto)

| Plug | Motivo |
| --- | --- |
| extensión `gnome` (`desktop`, `desktop-legacy`, `x11`, `wayland`, `opengl`, `gsettings`, …) | GTK, ventana X11, GPU, abrir enlaces/carpetas por xdg-open |
| `browser-support` | Chromium (Electron) necesita memoria compartida y otros accesos del navegador |
| `home` | carpeta Descargas (descargas y grabaciones de MPV) y elegir archivos de listas |
| `network` | panel, servidores del proveedor, TMDB |
| `network-bind` | servidor del control remoto (puerto 8765) |
| `audio-playback` | sonido |
| `screen-inhibit-control` | que la pantalla no se apague mientras se reproduce |

No se piden `removable-media`, `process-control` ni `system-files`. El sandbox de Chromium (SUID) no funciona
dentro de un Snap; el lanzador pasa `--no-sandbox` y el aislamiento lo da el confinamiento del Snap (igual que
el target Snap de electron-builder).

### Flatpak

| finish-arg | Motivo |
| --- | --- |
| `--share=ipc`, `--socket=x11` | Electron en X11 (`--ozone-platform=x11`); MPV embebido dibuja en una ventana X11 |
| `--share=network` | panel, proveedor, TMDB, control remoto |
| `--socket=pulseaudio` | sonido |
| `--device=dri` | GPU para la interfaz y mpv |
| `--filesystem=xdg-download` | descargas y grabaciones en Descargas |
| `--talk-name=org.freedesktop.ScreenSaver` | pantalla encendida mientras se reproduce |
| `--talk-name=org.freedesktop.FileManager1` | Descargas › "Mostrar en carpeta" |

Se quitaron `--filesystem=home` y `--talk-name=org.freedesktop.Flatpak` (salida del sandbox): mpv va dentro
del paquete. Abrir otros archivos usa el portal de archivos. El sandbox de Chromium lo reemplaza zypak.

## 4. Compilar a mano (en Linux x64)

```bash
# app Electron (Ubuntu 22.04 recomendado)
sudo apt-get install -y rpm libarchive-tools libx11-dev libxext-dev libmpv-dev mpv pkg-config
pnpm install --frozen-lockfile
PANEL_MASTER_KEY=<64 hex> node tools/panel/write-panel-key.mjs
pnpm nx build web
# MPV embebido: ver el paso "Stage Linux embedded MPV build inputs" de linux-build.yml
IPTVNATOR_BUILD_EMBEDDED_MPV=1 IPTVNATOR_EMBEDDED_MPV_PLATFORM=linux IPTVNATOR_EMBEDDED_MPV_ARCH=x64 pnpm run build:backend
tools/linux/bundle-mpv.sh bin/mpv                    # mpv portable para AppImage/.deb/.rpm
pnpm run make:app -- --publishPolicy=never          # dist/executables: AppImage, deb, rpm, linux-unpacked
pnpm run verify:package-layout -- linux x64

# Snap
mkdir -p build/linux-unpacked && cp -a dist/executables/linux-unpacked/. build/linux-unpacked/
snapcraft                                             # mpx-player_<versión>_amd64.snap
sudo snap install --dangerous mpx-player_*.snap

# Flatpak
tar -C dist/executables/linux-unpacked --exclude=./resources/bin -czf flatpak/mpx-player-linux-x64.tar.gz .
cd flatpak && flatpak-builder --user --install-deps-from=flathub --install --force-clean build-dir com.latmpx.MPXPlayer.yml
flatpak run com.latmpx.MPXPlayer

# prueba de arranque (cualquier formato)
xvfb-run -a node tools/linux/smoke-test.mjs --expect-embedded-mpv -- flatpak run com.latmpx.MPXPlayer
```

En CI: un push a `linux` con `[linux build]` en el mensaje del commit (o un tag `linux-v*`) arranca `linux-build.yml`;
el release se llama `linux-v<versión de package.json>`. Necesita el secreto del
repositorio **`PANEL_MASTER_KEY`** (64 caracteres hex; Settings › Secrets and variables › Actions): sin él el run se
detiene al principio. Si todas las pruebas pasan, publica un **release de GitHub** con el AppImage, `.deb`, `.rpm`,
`.snap` y `.flatpak` (las tiendas no se tocan).

## 5. Publicar (requiere autorización explícita del dueño)

### Snap Store

1. Cuenta en snapcraft.io, `snapcraft login`, `snapcraft register mpx-player`.
2. Descargar el artefacto `mpx-player-snap` del workflow y subirlo: `snapcraft upload --release=edge mpx-player_*.snap`.
3. Probar desde `edge` en una máquina limpia (`snap install mpx-player --edge`), luego promover a `stable`.
4. La revisión automática de la tienda acepta los plugs de arriba sin pedir permisos especiales (todos se conectan solos).
5. Más adelante: guardar las credenciales (`snapcraft export-login`) como secreto `SNAPCRAFT_STORE_CREDENTIALS` para subir desde CI.

### Flathub

1. Decidir el app-id (sección 1) y, si es `com.latmpx.*`, servir `https://latmpx.com/.well-known/org.flathub.VerifiedApps.txt`.
2. Hacer pública la descarga de `mpx-player-linux-x64.tar.gz` (p. ej. adjunta a un release público). En el
   manifiesto para Flathub, cambiar la fuente `path: mpx-player-linux-x64.tar.gz` por `url:` + `sha256:`.
3. Capturas de pantalla: al menos una imagen PNG pública en `<screenshots>` del metainfo (hoy faltan; el linter lo marca como error).
4. Abrir el PR de envío en `github.com/flathub/flathub` (rama `new-pr`) con el manifiesto. Ver https://docs.flathub.org/docs/for-app-authors/submission
5. Linter: `flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest flatpak/com.latmpx.MPXPlayer.yml`
   (estado actual en LINUX_BUILD_REPORT).

## 6. Actualizaciones

No hay actualizador dentro de la app (se quitó en 1.5.22), así que no hay nada que pueda chocar con las tiendas:
la Snap Store actualiza el snap (`snap refresh`), Flathub el Flatpak (`flatpak update`). `.deb`/`.rpm`/AppImage
no se actualizan solos. Si algún día se añade un actualizador propio, tiene que desactivarse cuando
`process.env.SNAP` o `process.env.FLATPAK_ID` existan.
