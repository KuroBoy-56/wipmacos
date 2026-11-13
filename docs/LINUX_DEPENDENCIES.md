# MPX Player en Linux — dependencias

## 1. Para compilar (Ubuntu 22.04 en CI)

| Qué | Versión / paquete | Para qué |
| --- | --- | --- |
| Node.js | 22 | toolchain del monorepo |
| pnpm | 10.33.0 (`packageManager`) | dependencias (`pnpm install --frozen-lockfile`) |
| Compilador C/C++ | `build-essential` (en el runner) | `better-sqlite3` y `embedded_mpv.node` (node-gyp para Electron) |
| `libx11-dev`, `libxext-dev`, `pkg-config` | Ubuntu | addon de MPV embebido (ventana X11) |
| `libmpv-dev`, `mpv` | Ubuntu (solo cabeceras y versión registrada) | compilar el addon; libmpv no se enlaza ni se incluye |
| `rpm`, `libarchive-tools` | Ubuntu | targets `.rpm` y AppImage/deb de electron-builder |
| `xvfb`, `appstream`, `desktop-file-utils` | Ubuntu | prueba de arranque y validación de metadatos |
| snapcraft + LXD | `snapcore/action-build@v1` (Ubuntu 24.04) | Snap |
| flatpak, flatpak-builder, `org.flatpak.Builder` | Ubuntu 24.04 + Flathub | Flatpak y linter de Flathub |

Por qué Ubuntu 22.04 para la app: glibc 2.35. Los módulos nativos compilados ahí también cargan en
Ubuntu 22.04+/Debian 12 y dentro de core24 (Snap) y freedesktop 26.08 (Flatpak), que tienen glibc más nuevo.

## 2. Para ejecutar

| Formato | Lo que trae el paquete | Lo que pone el sistema |
| --- | --- | --- |
| `.deb` / `.rpm` / AppImage (x64) | Electron completo (Chromium, FFmpeg propio de Electron para el reproductor integrado) | GTK 3, NSS, ALSA/PulseAudio, X11 o XWayland; **mpv** del sistema para MPV embebido/externo (recomendado en el .deb); VLC opcional |
| Snap (`mpx-player`, core24) | Electron + `mpv` y sus bibliotecas (stage-packages de Ubuntu 24.04) + bibliotecas de Electron que no da la extensión GNOME | core24 y `gnome-46-2404` (GTK, Mesa, etc.) |
| Flatpak (`com.latmpx.MPXPlayer`) | Electron + mpv 0.41.0, libplacebo 7.360.1, libass 0.17.4, LuaJIT 2.1, libXpresent 1.0.1 (compilados en el manifiesto) | runtime `org.freedesktop.Platform//26.08` (FFmpeg 8.1), `org.electronjs.Electron2.BaseApp//26.08` (zypak), extensión `codecs-extra` (H.264, HEVC, AAC, AC-3 completos) |

## 3. Multimedia en detalle

| Componente | Windows (original) | Linux |
| --- | --- | --- |
| Reproductor integrado | FFmpeg de Electron | igual (no depende del sistema) |
| MPV embebido | `libmpv-2.dll` LGPL dentro del proceso | proceso `mpv --wid=<ventana X11>` controlado por IPC JSON; el binario `mpv` es el del paquete (Snap/Flatpak) o del sistema |
| MPV externo | `bin/mpv/mpv.exe` | el mismo `mpv` del punto anterior |
| VLC externo | `bin/vlc/vlc.exe` | VLC del sistema (.deb/.rpm/AppImage); no disponible en Snap/Flatpak |
| FFmpeg | en las DLL de mpv | Flatpak: el del runtime + `codecs-extra`; Snap: libavcodec de Ubuntu 24.04 (dependencia de mpv); sistema: el de la distribución |
| Aceleración por hardware | `hwdec=auto-safe` (D3D11) | MPV externo: `hwdec` por defecto de mpv (VA-API disponible en el Flatpak, `-Dvaapi=enabled`); MPV embebido Linux usa `vo=x11`, `hwdec=no` (decisión heredada del addon) |
| Audio | WASAPI | PulseAudio/PipeWire (Flatpak `--socket=pulseaudio`, Snap `audio-playback`) |

## 4. Licencias y redistribución (no es asesoría legal)

- mpv se compila **sin** `-Dgpl=false` en el Flatpak, así que el binario resultante es GPL-2.0-or-later (con
  libplacebo LGPL, libass ISC, LuaJIT MIT). Es un programa aparte que la app lanza (agregación), igual que el
  `mpv.exe` de Windows. Flathub publica el código fuente de cada módulo automáticamente.
- En el Snap, mpv y sus bibliotecas vienen de los paquetes de Ubuntu con sus licencias; snapcraft las conserva en `usr/share/doc`.
- FFmpeg con códecs patentados (H.264, HEVC, AAC, AC-3): en Flathub los da `codecs-extra`, que distribuye Flathub, no esta app.
- MIT (de IPTVnator) sigue siendo la licencia del proyecto (`LICENSE.md`).

## 5. Arquitecturas

Solo **x64** (amd64). ARM64 no se activa: no hay prueba del addon de MPV embebido ni del mpv incluido en ARM, y
el prompt pide no prometer arquitecturas sin probarlas.
