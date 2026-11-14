# MPX Player en Linux — compatibilidad por función

Estados: **COMPLETADO Y PROBADO** · **IMPLEMENTADO SIN PROBAR** · **PARCIAL** · **PENDIENTE** · **BLOQUEADO**.
"Probado" quiere decir ejecutado de verdad en Linux. Lo que solo se prueba en GitHub Actions al compilar
(`.github/workflows/linux-build.yml`) figura como **IMPLEMENTADO SIN PROBAR** hasta que ese workflow se ejecute.

| Función | Windows (original) | Linux | Cambios y archivos | Estado | Límites |
| --- | --- | --- | --- | --- | --- |
| Interfaz, marca, colores, idiomas | Angular en Electron | el mismo frontend, sin cambios | ninguno | IMPLEMENTADO SIN PROBAR (la prueba de arranque de CI captura la pantalla) | — |
| Ventana y botones propios | marco oculto + botones de la app | igual (Linux ya usaba botones propios) | ninguno | IMPLEMENTADO SIN PROBAR | en Wayland corre por XWayland (`--ozone-platform=x11`) |
| Carpeta de datos (SQLite) | `~/.iptvnator` | Snap `$SNAP_USER_COMMON/iptvnator`; Flatpak `~/.var/app/com.latmpx.MPXPlayer/data/iptvnator`; .deb/.rpm/AppImage `~/.iptvnator` si existe, si no `~/.local/share/iptvnator` | `libs/shared/database/src/lib/path-utils.ts` (+ spec) | lógica PROBADA (8 casos con Node); paquete IMPLEMENTADO SIN PROBAR (la prueba de CI escribe y lee SQLite en cada formato) | — |
| Ajustes (`electron-conf`) y sesión | `%APPDATA%\LatMpx TV+` | `$XDG_CONFIG_HOME/LatMpx TV+` (en Flatpak/Snap, dentro del sandbox) | ninguno (Electron ya usa XDG) | IMPLEMENTADO SIN PROBAR | — |
| Id de equipo (panel) | `MachineGuid` del registro | `/etc/machine-id` (legible en Snap y Flatpak) | ninguno | IMPLEMENTADO SIN PROBAR (la prueba de CI comprueba el formato en cada paquete) | id nuevo respecto a Windows: es otra máquina |
| Login, distribuidor, demo, PIN, lista negra | `login.php` cifrado en el proceso principal | igual | ninguno | IMPLEMENTADO SIN PROBAR | la prueba de CI no contacta el panel a propósito |
| Tipo de equipo en el panel | `platform: windows` | también `windows` | ninguno | BLOQUEADO (decisión) | el panel no tiene id `linux`; mandarlo sin soporte del panel puede romper el login |
| Favoritos, Continuar viendo, EPG, deportes | APIs del panel + caché SQLite | igual | ninguno | IMPLEMENTADO SIN PROBAR | — |
| Reproductor integrado (HLS, MPEG-TS) | Chromium de Electron | igual (Electron trae sus códecs) | ninguno | IMPLEMENTADO SIN PROBAR | — |
| MPV embebido | libmpv en el proceso + `HWND` | proceso `mpv --wid` sobre una ventana X11 | build del addon en CI; mensaje del sandbox (`embedded-mpv-native.service.ts`) | Flatpak: mpv del paquete PROBADO (H.264/AAC, HEVC/AC-3, MPEG-TS, HLS, subtítulos, salida `x11`); app completa IMPLEMENTADO SIN PROBAR | solo X11/XWayland |
| MPV externo y embebido: binario | `bin/mpv/mpv.exe` incluido | .deb/.rpm/AppImage: mpv portable incluido (`resources/bin/mpv`, primero en `PATH`); Snap: `$SNAP/usr/bin/mpv`; Flatpak: `/app/bin/mpv` | `tools/linux/bundle-mpv.sh`, `util/bundled-mpv-path.ts`, `external-player-launch-context.ts` (+ tests) | mpv portable PROBADO aquí (5 formatos y salida X11); en otras distribuciones lo prueba CI (Fedora 41, Debian 12, Arch) | el mpv portable añade unos 75–95 MB al paquete |
| VLC externo | `bin/vlc/vlc.exe` incluido | .deb/.rpm/AppImage: VLC del sistema | ninguno | PARCIAL | **no disponible en Snap ni Flatpak**: el sandbox no puede ejecutar el VLC del sistema y VLC no se incluye (tamaño y licencias); la app muestra el error de "no encontrado" |
| Descargas | carpeta Descargas | carpeta XDG Descargas | Flatpak `--filesystem=xdg-download`; Snap `home` | IMPLEMENTADO SIN PROBAR | otra carpeta fuera de Descargas: en Flatpak va por el portal de archivos |
| "Mostrar en carpeta" / abrir enlaces | `shell` de Electron | xdg-open / portales | Flatpak `org.freedesktop.FileManager1`; Snap `desktop` (extensión gnome) | IMPLEMENTADO SIN PROBAR | — |
| Pantalla encendida mientras se reproduce | `powerSaveBlocker` | igual vía D-Bus | Flatpak `org.freedesktop.ScreenSaver`; Snap `screen-inhibit-control` | IMPLEMENTADO SIN PROBAR | — |
| Control remoto (puerto 8765) | servidor HTTP local | igual | Snap `network-bind`; Flatpak `--share=network` | IMPLEMENTADO SIN PROBAR | — |
| Actualizaciones | ninguna integrada (Store/EXE) | Snap Store y Flathub actualizan; .deb/.rpm/AppImage sin auto-actualización | ninguno: no hay actualizador que choque | COMPLETADO (no hay código que adaptar) | AppImage/deb: el usuario descarga la nueva versión |
| Pantallas táctiles | Pointer Events | igual | ninguno | IMPLEMENTADO SIN PROBAR | — |
| Empaquetado sin binarios de Windows | — | build falla si hay `.exe`/`.dll` | `tools/packaging/linux-after-pack.cjs` (+ 3 tests) | COMPLETADO Y PROBADO (`node --test`) | — |
| Rutas con mayúsculas/minúsculas | Windows no distingue | Linux distingue | revisión de todos los imports y assets | COMPLETADO Y PROBADO (0 problemas) | — |

## Compatibilidad con Windows

Los cambios de código solo actúan con `process.platform === 'linux'` (o con `FLATPAK_ID` / `SNAP`). En
`electron-builder.json` solo cambian los bloques `linux`, `snap` y `flatpak`; `win`, `nsis`, `mac` y
`extraResources` quedan byte a byte iguales. Los tests añadidos cubren el caso Windows/macOS
(`resolveDefaultDataRoot` devuelve `~/.iptvnator`).
