import path from 'path';
import {
    ExternalPlayerName,
    parseExternalPlayerArguments,
    type ExternalPlayerArgumentsInput,
} from '@iptvnator/shared/interfaces';
import { existsSync, readdirSync } from 'fs';

export type PathExists = (path: string) => boolean;
export type ReadDirectory = (path: string) => string[];

export type ExternalPlayerLaunchMode = 'direct' | 'flatpak-host';

export interface PlayerPathOptions {
    platform?: NodeJS.Platform;
    isFlatpak?: boolean;
    /** Environment to read $SNAP from (tests pass their own). */
    env?: NodeJS.ProcessEnv;
    pathExists?: PathExists;
    readDirectory?: ReadDirectory;
}

export interface ExternalPlayerLaunchContext {
    mode: ExternalPlayerLaunchMode;
    playerPath: string;
    command: string;
    argsPrefix: string[];
}

export interface ExternalPlayerSpawnSpec {
    mode: ExternalPlayerLaunchMode;
    playerPath: string;
    command: string;
    args: string[];
}

export function isRunningInFlatpak(
    pathExists: PathExists = existsSync,
    platform: NodeJS.Platform = process.platform
): boolean {
    return platform === 'linux' && pathExists('/.flatpak-info');
}

/** Files inside the Flatpak's own /app tree run in the sandbox; anything else is on the host. */
const FLATPAK_APP_PREFIX = '/app/';

/** The player shipped inside the Flatpak (the MPX manifest bundles mpv), if present. */
/**
 * Linux player candidates. Inside a strict Snap only the player bundled in the snap
 * ($SNAP/usr/bin) can run: /snap/bin/<player> belongs to another snap and is denied.
 */
function linuxPlayerCandidates(player: ExternalPlayerName, env: NodeJS.ProcessEnv): string[] {
    const snap = env['SNAP']?.trim();
    if (snap) return [path.posix.join(snap, 'usr', 'bin', player)];
    return [`/usr/bin/${player}`, `/usr/local/bin/${player}`, `/snap/bin/${player}`];
}

function bundledFlatpakPlayer(
    player: ExternalPlayerName,
    pathExists: PathExists
): string | null {
    const bundled = `${FLATPAK_APP_PREFIX}bin/${player}`;
    return pathExists(bundled) ? bundled : null;
}

export function normalizeCustomPlayerPath(
    value: string | null | undefined
): string | null {
    const trimmedValue = value?.trim();
    return trimmedValue ? trimmedValue : null;
}

export function normalizePlayerPathForStore(
    value: string | null | undefined
): string {
    return normalizeCustomPlayerPath(value) ?? '';
}

const macOSAppBundleExecutableNames: Record<ExternalPlayerName, string> = {
    mpv: 'mpv',
    vlc: 'VLC',
};

function getMacOSAppBundleExecutableName(player: ExternalPlayerName): string {
    return macOSAppBundleExecutableNames[player];
}

function removeTrailingPathSeparators(value: string): string {
    return value.replace(/[\\/]+$/, '') || value;
}

function resolveMacOSAppBundlePlayerPath(
    player: ExternalPlayerName,
    playerPath: string,
    platform: NodeJS.Platform
): string {
    if (platform !== 'darwin') {
        return playerPath;
    }

    const appBundlePath = removeTrailingPathSeparators(playerPath);

    if (!/\.app$/i.test(appBundlePath)) {
        return playerPath;
    }

    return path.join(
        appBundlePath,
        'Contents',
        'MacOS',
        getMacOSAppBundleExecutableName(player)
    );
}

function getDefaultPlayerPath(
    player: ExternalPlayerName,
    options: PlayerPathOptions = {}
): string {
    const {
        platform = process.platform,
        isFlatpak = isRunningInFlatpak(),
        pathExists = existsSync,
        readDirectory = readdirSync,
        env = process.env,
    } = options;

    if (platform === 'linux' && isFlatpak) {
        return bundledFlatpakPlayer(player, pathExists) ?? player;
    }

    if (player === 'mpv') {
        return getDefaultMpvPath({
            platform,
            isFlatpak,
            pathExists,
            readDirectory,
            env,
        });
    }

    return getDefaultVlcPath({
        platform,
        isFlatpak,
        pathExists,
        readDirectory,
        env,
    });
}

export function resolveExternalPlayerLaunchContext(
    player: ExternalPlayerName,
    customPlayerPath?: string,
    options: PlayerPathOptions = {}
): ExternalPlayerLaunchContext {
    const {
        platform = process.platform,
        isFlatpak = isRunningInFlatpak(),
        pathExists = existsSync,
        readDirectory = readdirSync,
        env = process.env,
    } = options;
    const playerPath =
        normalizeCustomPlayerPath(customPlayerPath) ??
        getDefaultPlayerPath(player, {
            platform,
            isFlatpak,
            pathExists,
            readDirectory,
            env,
        });
    const resolvedPlayerPath = resolveMacOSAppBundlePlayerPath(
        player,
        playerPath,
        platform
    );

    // A bundled player (/app/...) runs inside the sandbox: no flatpak-spawn, no host access needed.
    if (platform === 'linux' && isFlatpak && !resolvedPlayerPath.startsWith(FLATPAK_APP_PREFIX)) {
        return {
            mode: 'flatpak-host',
            playerPath: resolvedPlayerPath,
            command: 'flatpak-spawn',
            argsPrefix: ['--host', '--watch-bus', resolvedPlayerPath],
        };
    }

    return {
        mode: 'direct',
        playerPath: resolvedPlayerPath,
        command: resolvedPlayerPath,
        argsPrefix: [],
    };
}

export function buildExternalPlayerSpawnSpec(
    launchContext: ExternalPlayerLaunchContext,
    playerArgs: string[]
): ExternalPlayerSpawnSpec {
    return {
        mode: launchContext.mode,
        playerPath: launchContext.playerPath,
        command: launchContext.command,
        args: [...launchContext.argsPrefix, ...playerArgs],
    };
}

export { parseExternalPlayerArguments };

export function buildPlayerArgsWithCustomArguments(
    customArguments: ExternalPlayerArgumentsInput,
    playerArgs: string[]
): string[] {
    return [...parseExternalPlayerArguments(customArguments), ...playerArgs];
}

export function shouldReuseMpvInstance(
    requestedReuseInstance: boolean,
    isFlatpak: boolean = isRunningInFlatpak()
): boolean {
    return !isFlatpak && requestedReuseInstance;
}

export function shouldUseMpvSocketBridge(
    isFlatpak: boolean = isRunningInFlatpak()
): boolean {
    return !isFlatpak;
}

export function shouldReuseVlcInstance(
    requestedReuseInstance: boolean,
    isFlatpak: boolean = isRunningInFlatpak()
): boolean {
    return !isFlatpak && requestedReuseInstance;
}

export function getDefaultMpvPath(options: PlayerPathOptions = {}): string {
    const {
        platform = process.platform,
        isFlatpak = isRunningInFlatpak(),
        pathExists = existsSync,
        env = process.env,
    } = options;

    if (platform === 'linux' && isFlatpak) {
        return bundledFlatpakPlayer('mpv', pathExists) ?? 'mpv';
    }

    if (platform === 'win32') {
        const windowsPaths = [
            path.join('C:', 'Program Files', 'mpv', 'mpv.exe'),
            path.join('C:', 'Program Files (x86)', 'mpv', 'mpv.exe'),
        ];

        for (const mpvPath of windowsPaths) {
            if (pathExists(mpvPath)) {
                return mpvPath;
            }
        }
        return 'mpv';
    } else if (platform === 'linux') {
        for (const mpvPath of linuxPlayerCandidates('mpv', env)) {
            if (pathExists(mpvPath)) {
                return mpvPath;
            }
        }
        return 'mpv';
    } else if (platform === 'darwin') {
        const macosPaths = [
            '/Applications/mpv.app/Contents/MacOS/mpv',
            '/opt/homebrew/bin/mpv',
            '/usr/local/bin/mpv',
        ];

        for (const mpvPath of macosPaths) {
            if (pathExists(mpvPath)) {
                return mpvPath;
            }
        }
        return 'mpv';
    }

    return 'mpv';
}

export function getDefaultVlcPath(options: PlayerPathOptions = {}): string {
    const {
        platform = process.platform,
        isFlatpak = isRunningInFlatpak(),
        pathExists = existsSync,
        readDirectory = readdirSync,
        env = process.env,
    } = options;

    if (platform === 'linux' && isFlatpak) {
        return bundledFlatpakPlayer('vlc', pathExists) ?? 'vlc';
    }

    if (platform === 'win32') {
        const windowsPaths = [
            path.join('C:', 'Program Files', 'VideoLAN', 'VLC', 'vlc.exe'),
            path.join(
                'C:',
                'Program Files (x86)',
                'VideoLAN',
                'VLC',
                'vlc.exe'
            ),
        ];

        for (const vlcPath of windowsPaths) {
            if (pathExists(vlcPath)) {
                return vlcPath;
            }
        }
        return 'vlc';
    } else if (platform === 'linux') {
        for (const vlcPath of linuxPlayerCandidates('vlc', env)) {
            if (pathExists(vlcPath)) {
                return vlcPath;
            }
        }
        return 'vlc';
    } else if (platform === 'darwin') {
        const macosPaths = [
            '/Applications/VLC.app/Contents/MacOS/VLC',
            ...getHomebrewCaskVlcPaths(readDirectory),
        ];

        for (const vlcPath of macosPaths) {
            if (pathExists(vlcPath)) {
                return vlcPath;
            }
        }
        return 'vlc';
    }
    return 'vlc';
}

function getHomebrewCaskVlcPaths(readDirectory: ReadDirectory): string[] {
    const caskroomPath = '/opt/homebrew/Caskroom/vlc';

    try {
        return readDirectory(caskroomPath)
            .filter((entry) => entry.trim().length > 0)
            .map((entry) =>
                path.join(
                    caskroomPath,
                    entry,
                    'VLC.app',
                    'Contents',
                    'MacOS',
                    'VLC'
                )
            );
    } catch {
        return [];
    }
}
