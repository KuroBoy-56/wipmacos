# MPX Player en Linux — progreso

Última actualización: 14-11-2026 · Rama `linux` (desde `main` `4130dc5`, 1.5.24) · Electron se mantiene.

| Fase | Estado |
| --- | --- |
| 1. Auditoría | COMPLETADO (LINUX_AUDIT) |
| 2. Compatibilidad de Electron en Linux | COMPLETADO Y PROBADO a nivel de arranque en los 4 formatos (puente, id, SQLite, MPV embebido, clave del panel) |
| 3. Interfaz igual que Windows | sin cambios de frontend; se verá en las capturas de la prueba de CI |
| 4. Multimedia | mpv PROBADO en Flatpak (formatos, subtítulos, X11), mpv portable en Debian/Fedora/Arch, MPV embebido disponible en los 4 formatos; reproducción dentro de la app con una línea real: prueba manual; VLC no se incluye (decisión) |
| 5. Carpetas y permisos (XDG) | COMPLETADO Y PROBADO (SQLite escribe en Snap, Flatpak y nativo) |
| 6. Snap | COMPILADO Y PROBADO en CI (instalado con confinamiento estricto); falta registrar el nombre y subirlo a la tienda |
| 7. Flatpak | COMPILADO Y PROBADO en CI (sandbox); para Flathub faltan app-id con dominio verificable, capturas y descarga pública |
| 8. Actualizaciones | no hay actualizador propio: las tiendas actualizan; nada que adaptar |
| 9. Configuración de build | electron-builder Linux x64 (AppImage, deb, rpm), sin binarios de Windows |
| 10. Automatización | `linux-build.yml`: tag `linux-v*` → compila, prueba (también el mpv portable en Fedora, Debian y Arch) y publica el release de GitHub; exige el secreto `PANEL_MASTER_KEY`. Resultados en LINUX_BUILD_REPORT |
| 11. Pruebas | automáticas en verde (LINUX_BUILD_REPORT §0); falta la prueba manual con una cuenta real (lista abajo) |
| 12. Documentación | este conjunto de documentos |

## Lista de prueba manual (después del primer run de CI)

En una máquina Linux x64 con escritorio (Ubuntu 24.04 GNOME recomendado), con el `.deb`, el Snap
(`snap install --dangerous`) y el Flatpak (`flatpak install --user mpx-player.flatpak`), por separado:

1. Arranca, se ve la pantalla de distribuidor/login con la marca y los colores de MPX.
2. Distribuidor (código y "Omitir"), login con una cuenta real, Auto-Demo.
3. Inicio, Películas, Series, TV en vivo, Deportes cargan; la guía (EPG) aparece.
4. Un canal en vivo HLS y uno MPEG-TS en el reproductor integrado; cambio de canal; pausa; volumen; pantalla completa.
5. Una película MKV con AC-3 → cambio automático a MPV embebido; pistas de audio y subtítulos; buscar.
6. Ajustes › MPV externo: abre la ventana de mpv; al cerrar se guarda el progreso (Continuar viendo).
7. Mi lista: añadir y quitar; cerrar y abrir la app: sigue igual (SQLite y panel).
8. Descargar un episodio a Descargas; "Mostrar en carpeta".
9. Cerrar la app: no queda ningún proceso `mpx-player` ni `mpv`.
10. Snap: `snap refresh --edge` (cuando esté en la tienda); Flatpak: `flatpak update`. Los datos siguen.

## Decisiones pendientes del dueño

- App-id de Flathub: `com.latmpx.MPXPlayer` (necesita latmpx.com activo) o `io.github.kuroboy_56.MPXPlayer`.
- Nombre del Snap `mpx-player` (registrarlo).
- Capturas de pantalla públicas para AppStream.
- Descarga pública del build para el manifiesto de Flathub.
