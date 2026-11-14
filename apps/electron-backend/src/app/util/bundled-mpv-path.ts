import { existsSync } from 'fs';
import { delimiter, join } from 'path';

/**
 * PATH with the portable mpv of the Linux AppImage/.deb/.rpm first
 * (resources/bin/mpv, made by tools/linux/bundle-mpv.sh). Embedded MPV and its
 * support check run `mpv` from PATH; external MPV already looks there first.
 * The Snap and the Flatpak ship their own mpv and no resources/bin/mpv.
 */
export function pathWithBundledMpv(
    pathValue: string,
    resourcesPath: string | undefined,
    exists: (path: string) => boolean = existsSync
): string {
    if (!resourcesPath) return pathValue;
    const dir = join(resourcesPath, 'bin', 'mpv');
    if (!exists(join(dir, 'mpv'))) return pathValue;
    const rest = pathValue.split(delimiter).filter((entry) => entry && entry !== dir);
    return [dir, ...rest].join(delimiter);
}

export function preferBundledMpv(): void {
    if (process.platform !== 'linux') return;
    const { resourcesPath } = process as NodeJS.Process & { resourcesPath?: string };
    process.env['PATH'] = pathWithBundledMpv(process.env['PATH'] ?? '', resourcesPath);
}
