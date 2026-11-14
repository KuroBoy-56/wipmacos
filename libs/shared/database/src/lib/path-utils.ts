import { existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { isAbsolute, join } from 'path';

export const IPTVNATOR_E2E_DATA_DIR_ENV = 'IPTVNATOR_E2E_DATA_DIR';

function ensureDirectory(dirPath: string): string {
    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
    }

    return dirPath;
}

export function getIptvnatorDataRoot(): string {
    const e2eDataDir = process.env[IPTVNATOR_E2E_DATA_DIR_ENV]?.trim();

    if (e2eDataDir) {
        return ensureDirectory(e2eDataDir);
    }

    return ensureDirectory(
        resolveDefaultDataRoot({
            platform: process.platform,
            env: process.env,
            home: homedir(),
            exists: existsSync,
        })
    );
}

export interface DataRootContext {
    platform: NodeJS.Platform;
    env: NodeJS.ProcessEnv;
    home: string;
    exists: (path: string) => boolean;
}

/**
 * Folder of the SQLite database. Windows and macOS keep ~/.iptvnator. Linux follows
 * the XDG base directories and the store sandboxes:
 * - Snap: $SNAP_USER_COMMON (kept across refreshes, not copied for every revision);
 * - Flatpak: $XDG_DATA_HOME (~/.var/app/<id>/data), the real home is not writable there;
 * - .deb/.rpm/AppImage: an existing ~/.iptvnator (older installs keep their data),
 *   otherwise $XDG_DATA_HOME or ~/.local/share.
 */
export function resolveDefaultDataRoot({ platform, env, home, exists }: DataRootContext): string {
    const legacy = join(home, '.iptvnator');
    if (platform !== 'linux') return legacy;

    // XDG: relative values are invalid and must be ignored
    const absolute = (value: string | undefined) =>
        value && isAbsolute(value) ? value : undefined;
    const snapCommon = absolute(env['SNAP_USER_COMMON']);
    if (snapCommon) return join(snapCommon, 'iptvnator');

    const xdgDataHome = absolute(env['XDG_DATA_HOME']);
    const flatpakId = env['FLATPAK_ID']?.trim();
    if (flatpakId) {
        return join(xdgDataHome ?? join(home, '.var', 'app', flatpakId, 'data'), 'iptvnator');
    }

    if (exists(legacy)) return legacy;
    return join(xdgDataHome ?? join(home, '.local', 'share'), 'iptvnator');
}

export function getIptvnatorDatabaseDirectory(): string {
    return ensureDirectory(join(getIptvnatorDataRoot(), 'databases'));
}

export function getIptvnatorDatabasePath(): string {
    return join(getIptvnatorDatabaseDirectory(), 'iptvnator.db');
}

export function getElectronUserDataPath(): string | null {
    const e2eDataDir = process.env[IPTVNATOR_E2E_DATA_DIR_ENV]?.trim();

    if (!e2eDataDir) {
        return null;
    }

    return ensureDirectory(join(e2eDataDir, 'user-data'));
}

export function getElectronConfigDirectory(): string | null {
    const e2eDataDir = process.env[IPTVNATOR_E2E_DATA_DIR_ENV]?.trim();

    if (!e2eDataDir) {
        return null;
    }

    return ensureDirectory(join(e2eDataDir, 'config'));
}
