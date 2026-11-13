# MPX Player en Linux — progreso

Última actualización: 13-11-2026 · Rama `linux` (desde `main` `4130dc5`, 1.5.24) · Electron se mantiene.

| Fase | Estado |
| --- | --- |
| 1. Auditoría | COMPLETADO (LINUX_AUDIT) |
| 2. Compatibilidad de Electron en Linux | IMPLEMENTADO; lógica probada con Node, app completa SIN PROBAR (necesita el build de CI) |
| 3. Interfaz igual que Windows | sin cambios de frontend; se verá en las capturas de la prueba de CI |
| 4. Multimedia | mpv del Flatpak PROBADO (formatos, subtítulos, salida X11); Snap y app completa SIN PROBAR; VLC no disponible en Snap/Flatpak |
| 5. Carpetas y permisos (XDG) | IMPLEMENTADO y probado (lógica); en paquete SIN PROBAR |
| 6. Snap | configuración lista (`snap/`); SIN COMPILAR (necesita LXD → CI) |
| 7. Flatpak | manifiesto listo; módulos nativos COMPILADOS Y PROBADOS aquí; con la app real SIN PROBAR |
| 8. Actualizaciones | no hay actualizador propio: las tiendas actualizan; nada que adaptar |
| 9. Configuración de build | electron-builder Linux x64 (AppImage, deb, rpm), sin binarios de Windows |
| 10. Automatización | `linux-build.yml` listo; **no ejecutado** (se arranca con un tag `linux-v*` cuando el dueño lo pida) |
| 11. Pruebas | ver LINUX_BUILD_REPORT; pruebas de la app real pendientes del primer run de CI y de una prueba manual |
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
- Id `linux` en el panel (hoy Linux se registra como `windows`).
- Descarga pública del build para el manifiesto de Flathub.
