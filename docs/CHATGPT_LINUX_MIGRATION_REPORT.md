# Informe: MPX Player para Linux (Electron) — para revisión

Este informe resume el estado real de la rama `linux`. Nada aquí se da por terminado sin haberlo ejecutado;
cuando algo solo está configurado, se dice. Detalles en los documentos `docs/LINUX_*.md`.

## 1. Repositorio
`https://github.com/KuroBoy-56/wipmacos`

## 2. Rama
`linux` (creada con el equivalente de `git checkout -b linux origin/main`). No se fusiona en `main`.

## 3. Commit base de `main`
`4130dc5f3848e7c1fa6060ec28b97bae2531a3fb` — "Windows 1.5.24: control parental como Roku…" (13-11-2026).

## 4. Commit actual de `linux`
Build publicado: `c67c478ae053f383d15bbb0a80f32171a8988356` (release `linux-v1.5.24`). El último commit está
siempre en `git log -1 origin/linux`.

## 5. Electron
`^41.7.2` (sin cambios), electron-builder `^26.0.12`.

## 6. Node.js
Node 22 y pnpm 10.33.0 (los mismos que Windows en CI). Módulos nativos: `better-sqlite3` 12.9 y el addon de MPV
embebido, recompilados para Electron en Linux.

## 7. Dependencias de Linux
Compilar: `build-essential`, `libx11-dev`, `libxext-dev`, `libmpv-dev`, `mpv`, `pkg-config`, `rpm`,
`libarchive-tools`. Ejecutar: GTK 3, NSS, PulseAudio/PipeWire, X11/XWayland. El AppImage, el .deb y el .rpm llevan un
mpv portable (no hace falta instalar mpv).
El Snap trae mpv (Ubuntu 24.04) y el Flatpak compila mpv 0.41.0 con libplacebo 7.360.1, libass 0.17.4, LuaJIT y
libXpresent sobre freedesktop 26.08. Ver LINUX_DEPENDENCIES.

## 8. Funciones adaptadas
- Carpeta de datos SQLite según XDG, Snap (`$SNAP_USER_COMMON`) y Flatpak (`~/.var/app/…`); Windows/macOS igual.
- MPV dentro del Flatpak sin salir del sandbox; en Snap solo el mpv incluido (otros snaps no se pueden ejecutar).
- Paquetes Linux x64 (AppImage, deb, rpm), ejecutable `mpx-player`, `.deb` recomienda `mpv`.
- Metadatos AppStream y `.desktop` de MPX Player (antes eran los de IPTVnator).
- El empaquetado de Linux falla si contiene `.exe`/`.dll` de Windows.
- Verificador de paquetes actualizado a las nuevas reglas (core24, Flatpak sin permisos de más).
- Prueba de arranque automática por CDP y workflow de CI.

## 9. Funciones pendientes
- Ejecutar el workflow y la prueba de arranque de la app real en los tres formatos (cuando el dueño lo pida).
- Prueba manual con una cuenta real (login, reproducción, descargas, favoritos): lista en LINUX_MIGRATION_PROGRESS.

## 10. Multimedia
Reproductor integrado: el de Electron, sin cambios. MPV embebido en Linux: proceso `mpv --wid` sobre una ventana
X11 (como ya hacía IPTVnator), con `vo=x11`. MPV externo: el del paquete o del sistema. **Probado aquí, dentro del
sandbox Flatpak:** H.264+AAC, HEVC+AC-3, MPEG-TS, HLS y subtítulos SRT decodifican hasta el final; salidas `x11` y
`gpu-next` funcionan bajo Xvfb. Nada de Windows (DLL, exe) se usa en Linux.

## 11. Snap
`snap/snapcraft.yaml`: nombre `mpx-player`, core24, estricto, extensión GNOME, plugs `browser-support`, `home`,
`network`, `network-bind`, `audio-playback`, `screen-inhibit-control`; mpv por stage-packages; empaqueta el
`linux-unpacked` de CI. **Estado: compilado e instalado en CI con confinamiento estricto; la prueba de arranque pasa
(MPV embebido disponible, SQLite, id de equipo, clave del panel).** Falta registrar el nombre y subirlo.

## 12. Flatpak
`flatpak/com.latmpx.MPXPlayer.yml`: freedesktop 26.08 + Electron2.BaseApp, zypak, permisos mínimos (sin `home` ni
salida del sandbox). **Estado: compilado con la app real e instalado en CI; la prueba de arranque dentro del
sandbox pasa.**
Linter de Flathub: quedan el dominio del app-id (latmpx.com da 404) y las capturas de pantalla.

## 13. Windows
Sin cambios de comportamiento: el código nuevo solo actúa en `linux` (o con `SNAP`/`FLATPAK_ID`). En
`electron-builder.json` cambian solo `linux`, `deb`, `snap` y `flatpak`; `win`, `nsis`, `mac` y
`extraResources` no se tocan. Tests añadidos para el caso Windows/macOS de la carpeta de datos.

## 14. Resultados de pruebas en Linux
Ver LINUX_BUILD_REPORT. Resumen: mpv del Flatpak OK en 5 formatos y 2 salidas de vídeo; lógica de rutas 8/8;
lanzamiento de reproductores 14/14; bloqueo de binarios de Windows 3/3; mayúsculas/minúsculas 0 problemas;
`tsc --strict` 0 errores; metadatos válidos. Jest y la app completa no se pudieron ejecutar en esta sesión
(dependencia de GitHub bloqueada por la red de la sesión); corren en CI.

## 15. Artefactos
Release `linux-v1.5.24`: AppImage, .deb, .rpm, .snap y .flatpak (https://github.com/KuroBoy-56/wipmacos/releases/tag/linux-v1.5.24).
macOS 1.5.24 en el release `mac-v1.5.24` (rama `macos`, `main` fusionado).

## 16. Seguridad
Menos permisos que la configuración heredada (sin `--filesystem=home`, sin `org.freedesktop.Flatpak`), runtime
con soporte, claves solo como secretos de CI, la prueba de CI no contacta el panel. Riesgo heredado: el control
remoto (8765) escucha en la red sin autenticación. Ver LINUX_SECURITY_REPORT.

## 17. Problemas conocidos
- `latmpx.com` responde 404: Flathub no podrá verificar `com.latmpx.MPXPlayer` hasta que el dominio sirva la verificación.
- Faltan capturas de pantalla públicas para AppStream.
- MPV embebido en Linux sin aceleración por hardware (`hwdec=no`, heredado).
- El workflow heredado `build-and-make.yaml` sigue apuntando a `master` y a los nombres de IPTVnator; no se usa.

## 18. Comandos para reproducir
```bash
git fetch origin && git checkout linux
# CI completo (deb, AppImage, rpm, Snap, Flatpak + pruebas + release de GitHub); necesita el secreto PANEL_MASTER_KEY:
git commit --allow-empty -m "Linux <versión> [linux build]" && git push origin linux   # o un tag linux-v*
# local: ver docs/LINUX_PACKAGING.md §4
```

## 19. Cómo seguir
1. Elegir app-id de Flathub y registrar el nombre del Snap.
2. Ejecutar `linux-build.yml` (tag) y revisar las tres capturas y los logs de la prueba de arranque.
3. Prueba manual (LINUX_MIGRATION_PROGRESS) en Ubuntu 24.04 y otra distribución (Fedora).
4. Snap: `snapcraft upload --release=edge`; Flathub: release público del tarball, capturas, PR a `flathub/flathub`.
5. Mantener `linux` al día fusionando `main` (los cambios de Windows llegan sin tocar los de Linux).

## Comparación `main` ↔ `linux`

| | `main` | `linux` |
| --- | --- | --- |
| Aplicación (Electron, Angular, backend) | igual | igual (mismo código; cambios solo en ramas `linux`) |
| Carpeta de datos en Linux | `~/.iptvnator` (rompe en Flatpak) | XDG / Snap / Flatpak |
| Reproductores en Flatpak | `flatpak-spawn --host` (mpv del sistema) | mpv incluido, dentro del sandbox |
| Reproductores en Snap | `/snap/bin/mpv` (bloqueado por el confinamiento) | `$SNAP/usr/bin/mpv` |
| Targets Linux | AppImage/deb (x64, armv7l, arm64), Snap core22, rpm, pacman, Flatpak 24.08 | AppImage, deb, rpm (x64) + Snap core24 y Flatpak 26.08 propios |
| Metadatos Linux | IPTVnator (`com.fourgray.iptvnator`) | MPX Player (`com.latmpx.MPXPlayer`) |
| CI de Linux | `build-and-make.yaml` (nunca corre: `master`) | `linux-build.yml` (tag `linux-v*`) con pruebas de arranque |
| Diferencia total | — | 20 archivos en el commit de código (+1062/−396); el commit siguiente añade esta documentación y `deb.recommends: mpv` |
