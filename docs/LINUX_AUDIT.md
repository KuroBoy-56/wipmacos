# MPX Player en Linux — auditoría (rama `linux`)

Base: `main` en `4130dc5` (Windows 1.5.24, 13-11-2026). La rama `linux` sale de ese commit; `main` no se toca.
Documentos relacionados: [compatibilidad](LINUX_COMPATIBILITY.md) · [dependencias](LINUX_DEPENDENCIES.md) ·
[empaquetado](LINUX_PACKAGING.md) · [progreso](LINUX_MIGRATION_PROGRESS.md) · [informe de compilación](LINUX_BUILD_REPORT.md) ·
[seguridad](LINUX_SECURITY_REPORT.md) · [informe para revisión](CHATGPT_LINUX_MIGRATION_REPORT.md).

## 1. Qué es la aplicación

| Pieza | Detalle |
| --- | --- |
| Runtime | Electron `^41.7.2`, empaquetado con electron-builder `^26.0.12` |
| Node / gestor | Node 22 (el de CI), pnpm 10.33.0 (`packageManager`), monorepo Nx 22 |
| Frontend | Angular 21 + TypeScript + SCSS (`apps/web` y `libs/`), el mismo en Windows, macOS y Linux |
| Proceso principal | `apps/electron-backend/src/main.ts` + `app/app.ts`; preload `app/api/main.preload.ts` (`window.electron`) |
| Módulos nativos | `better-sqlite3` 12.9 (SQLite, recompilado para Electron); addon `embedded_mpv.node` (node-gyp, solo con `IPTVNATOR_BUILD_EMBEDDED_MPV=1`) |
| Base de datos | SQLite (Drizzle) en un worker; ruta `~/.iptvnator/databases/iptvnator.db` |
| Ajustes | `electron-conf` en la carpeta `userData` (`LatMpx TV+`) |
| Panel (login, licencias, favoritos, progreso, EPG, deportes) | APIs PHP del panel; cifrado AES-GCM en el proceso principal; id de equipo = SHA-256 del id de la máquina |
| Reproductores | integrado (hls.js, mpegts.js, Video.js, ArtPlayer); MPV embebido; MPV / VLC externos |
| Actualizador | **ninguno** (el de IPTVnator se quitó en 1.5.22) |
| Firebase | no existe en este fork |

## 2. Lo que ya estaba preparado para Linux (heredado de IPTVnator)

- Ventana sin marco con botones propios en Windows **y Linux** (`app.ts`, `RuntimeCapabilitiesService.usesCustomWindowControls`).
- `--ozone-platform=x11` en Linux (`main.ts`): MPV embebido dibuja en una ventana X11.
- MPV embebido en Linux como proceso aparte (`mpv --wid` + IPC JSON), sin cargar libmpv en Electron.
- Rutas de MPV/VLC del sistema (`/usr/bin`, `/usr/local/bin`, `/snap/bin`) y lanzamiento por `flatpak-spawn --host`.
- Lanzador `linux-after-pack.cjs` que añade `--no-sandbox` solo si el kernel no permite el sandbox de Chromium.
- Id de equipo en Linux desde `/etc/machine-id` (`panel/device-id.ts`).

## 3. Supuestos de Windows encontrados

| Hallazgo | Dónde | Efecto en Linux | Decisión |
| --- | --- | --- | --- |
| `bin/` (mpv.exe, vlc.exe, DLLs) en `extraResources` para **todas** las plataformas | `electron-builder.json` | un build de Linux hecho desde una copia de trabajo de Windows llevaría binarios de Windows | `linux-after-pack.cjs` falla si encuentra `.exe`/`.dll` (con test) |
| `~/.iptvnator` como carpeta de datos | `libs/shared/database/src/lib/path-utils.ts` | en Flatpak el home real no se puede escribir: la base de datos no se crearía | carpetas XDG / Snap / Flatpak (con test) |
| MPV/VLC del sistema vía `flatpak-spawn --host` | `external-player-launch-context.ts` | necesita `org.freedesktop.Flatpak` (salir del sandbox) y mpv instalado en el sistema | mpv incluido en el paquete y lanzado dentro del sandbox |
| `/snap/bin/mpv` como candidato | mismo archivo | dentro de un Snap estricto no se puede ejecutar otro snap | en Snap solo `$SNAP/usr/bin/<player>` |
| `reg query MachineGuid` | `panel/device-id.ts` | ya separado por plataforma | sin cambios |
| `C:\Program Files\...`, tubería `\\.\pipe\mpv-*`, `Update.exe` (Squirrel), `process.windowsStore` | eventos de reproductores, `squirrel.events.ts`, `external-player-cwd.ts` | todo protegido por `process.platform === 'win32'` | sin cambios |
| `panelAppId()` devuelve `windows` en todo lo que no es Mac | `libs/shared/interfaces/src/lib/panel-tenant.util.ts` | un equipo Linux aparece como `windows` en el panel | resuelto en 1.5.25: Linux manda `linux` (el panel lo acepta desde panelweb aa2cb99) |
| Ejecutable `MPX Player` (con espacio) | `electron-builder.json` | `/usr/bin/MPX Player` en el .deb | `mpx-player` en Linux |
| Metadatos AppStream de IPTVnator (`com.fourgray.iptvnator`, 4gray, capturas de 4gray) | `apps/electron-backend/linux/` | marca equivocada en tiendas | `com.latmpx.MPXPlayer.metainfo.xml` + `.desktop` de MPX |
| Flatpak con `--filesystem=home` y `--talk-name=org.freedesktop.Flatpak`, runtime 24.08 (fin de soporte) | `electron-builder.json` | rechazo probable en Flathub | manifiesto propio, permisos mínimos, runtime 26.08 |
| Targets armv7l/arm64 y pacman sin probar | `electron-builder.json` | promesas de arquitectura sin pruebas | solo x64 |
| Workflow de Linux heredado escucha `master` (este repo usa `main`) | `.github/workflows/build-and-make.yaml` | nunca se ejecuta | nuevo `linux-build.yml`; el heredado queda como estaba |

## 4. Comprobaciones hechas

- **Mayúsculas/minúsculas:** script que resuelve todos los `import` relativos y rutas `assets/...` de `apps/web`,
  `apps/electron-backend`, `apps/remote-control-web` y `libs/` exigiendo coincidencia exacta: **0 problemas**
  (el script detecta los errores a propósito que se le pusieron como control).
- **Barras invertidas / rutas de Windows:** solo aparecen dentro de ramas `win32`.
- **Permisos de ejecución:** `linux-after-pack.cjs` crea el lanzador con `0755`; `snap/local/mpx-player` se guarda con bit ejecutable.
- **Dependencias en esta sesión:** `pnpm install` no puede terminar aquí (la red de la sesión rechaza `codeload.github.com`,
  de donde sale `iptv-playlist-parser`), así que la app Electron completa se compila y prueba en GitHub Actions
  (`linux-build.yml`). Ver LINUX_BUILD_REPORT.
