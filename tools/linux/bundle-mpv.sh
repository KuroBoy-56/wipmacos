#!/usr/bin/env bash
# Portable mpv for the AppImage/.deb/.rpm (any x64 distribution): the build machine's mpv plus
# its libraries, minus the ones every desktop provides and that must match the host (glibc,
# GPU drivers, X11/Wayland, ALSA, fonts, D-Bus/systemd). The app puts this folder first in PATH
# (apps/electron-backend/src/app/util/bundled-mpv-path.ts). Run on the oldest supported base
# (Ubuntu 22.04 in CI) so the binaries need at most glibc 2.35.
#   tools/linux/bundle-mpv.sh [output-dir]   (default: bin/mpv, an extraResource of electron-builder)
set -euo pipefail

OUT="${1:-bin/mpv}"
MPV="$(command -v mpv)"
EXCLUDE='^(ld-linux.*|libc|libm|libdl|libpthread|librt|libresolv|libutil|libanl|libgcc_s|libstdc\+\+|libGL|libGLX|libEGL|libGLdispatch|libOpenGL|libGLESv2|libgbm|libdrm|libX11|libX11-xcb|libxcb|libwayland-client|libwayland-cursor|libwayland-egl|libasound|libfontconfig|libfreetype|libexpat|libz|libdbus-1|libsystemd|libudev)\.so'

rm -rf "$OUT"
mkdir -p "$OUT/lib"
cp -L "$MPV" "$OUT/mpv.bin"

ldd "$MPV" | awk '/=> \// { print $3 }' | sort -u | while read -r lib; do
    if basename "$lib" | grep -qE "$EXCLUDE"; then
        continue
    fi
    cp -L "$lib" "$OUT/lib/"
done

cat > "$OUT/mpv" <<'WRAPPER'
#!/bin/sh
# Bundled mpv (tools/linux/bundle-mpv.sh): its own libraries first, the host's for the rest.
HERE="$(dirname "$(readlink -f "$0")")"
LD_LIBRARY_PATH="$HERE/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" exec "$HERE/mpv.bin" "$@"
WRAPPER
chmod 755 "$OUT/mpv" "$OUT/mpv.bin"

# every library must resolve (bundled or host) or mpv would not start on a clean machine
if LD_LIBRARY_PATH="$OUT/lib" ldd "$OUT/mpv.bin" | grep -q 'not found'; then
    LD_LIBRARY_PATH="$OUT/lib" ldd "$OUT/mpv.bin" | grep 'not found'
    exit 1
fi
"$OUT/mpv" --version | head -n 1
echo "bundled mpv: $(ls "$OUT/lib" | wc -l) libraries, $(du -sh "$OUT" | cut -f1)"
