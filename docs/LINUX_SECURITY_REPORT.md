# MPX Player en Linux — informe de seguridad

## 1. Cambios que reducen permisos

| Antes (config heredada de IPTVnator) | Ahora |
| --- | --- |
| Flatpak con `--filesystem=home` (todo el home) | solo `--filesystem=xdg-download` |
| Flatpak con `--talk-name=org.freedesktop.Flatpak` (ejecutar cualquier programa del sistema fuera del sandbox) | quitado: mpv va dentro del paquete y corre en el sandbox |
| Flatpak runtime 24.08 (sin soporte en noviembre de 2026) | 26.08 |
| Snap core22 generado por electron-builder | core24, `confinement: strict`, plugs listados uno por uno |
| Podía colarse un `.exe`/`.dll` de Windows en un paquete Linux | el empaquetado falla (con test) |

## 2. Sandbox de Chromium

- `.deb`/`.rpm`/AppImage: se usa el sandbox de Chromium. El lanzador solo añade `--no-sandbox` cuando el kernel
  no permite los espacios de nombres sin privilegios (`unprivileged_userns_clone` o la restricción de AppArmor
  de Ubuntu 24.04). Es la misma lógica de antes.
- Snap: siempre `--no-sandbox` (el SUID de Chromium no funciona en un Snap estricto). El aislamiento lo da el
  confinamiento del Snap (AppArmor + seccomp), como en las apps Electron de la Snap Store.
- Flatpak: zypak reemplaza el sandbox de Chromium por el de Flatpak; `chrome-sandbox` se borra del paquete.

## 3. Secretos

- La clave AES del panel (`PANEL_MASTER_KEY`) y la de TMDB solo existen como secretos de GitHub Actions. Se
  inyectan al compilar la app (como en Windows) y nunca entran en el repositorio, en el manifiesto ni en
  `snapcraft.yaml`.
- La clave del panel va dentro de la app (`app.asar`). Quien tenga el paquete puede extraerla, igual que en
  Windows: la autorización real la decide el panel (id de equipo, lista negra, `ts` anti-repetición).
- Por eso Snap y Flatpak reempaquetan el build de CI en lugar de compilar en servidores públicos sin secretos.

## 4. Red y TLS

Sin cambios respecto a Windows: el panel y las APIs públicas exigen un certificado válido; los servidores
IPTV pueden tener certificados propios (`apps/electron-backend/src/app/util/tls-policy.ts`).

## 5. Prueba de arranque

`tools/linux/smoke-test.mjs` arranca la app con `--host-resolver-rules=MAP * ~NOTFOUND`, así que CI **nunca
contacta el panel ni registra los equipos de CI**. El puerto de DevTools (9333) solo se abre en esa prueba.

## 6. Pendientes / riesgos

- El servidor del control remoto escucha en el puerto 8765 en todas las interfaces, sin autenticación (igual
  que en Windows). En Linux la red local también lo ve. Se recomienda un token de emparejamiento.
- En Snap el control remoto necesita `network-bind`. Si no se usa, ese plug se puede quitar.
- `vo=x11`/`hwdec=no` en MPV embebido de Linux: sin decodificación por hardware en esa vía (decisión heredada:
  más compatible, más CPU).
