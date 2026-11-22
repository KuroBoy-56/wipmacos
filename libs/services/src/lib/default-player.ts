import { VideoPlayer } from '@iptvnator/shared/interfaces';

/** process.platform of the desktop app, '' when the bridge does not say, null in the PWA. */
function desktopPlatform(): string | null {
    if (typeof window === 'undefined' || !window.electron) return null;
    const platform = (window.electron as unknown as Record<string, unknown>)['platform'];
    return typeof platform === 'string' ? platform : '';
}

/**
 * MPX Player: MPV is the default player of the desktop app.
 * - Windows and Linux: MPV (the app ships it: `resources/bin/mpv`; Snap and Flatpak bring their own). Movies and
 *   series open in MPV; live channels still play inline unless Settings › "Canales en vivo también con MPV/VLC".
 * - macOS: MPV integrado (embedded MPV). The Mac app ships libmpv only, not the mpv program, so external MPV would
 *   need a separate install.
 * The PWA cannot start MPV and keeps the built-in Video.js player.
 */
export function defaultVideoPlayer(): VideoPlayer {
    const platform = desktopPlatform();
    if (platform === null) return VideoPlayer.VideoJs;
    return platform === 'darwin' ? VideoPlayer.EmbeddedMpv : VideoPlayer.MPV;
}

/** localStorage flag: the one-time switch of the old Video.js default to MPV already ran. */
export const PLAYER_MPV_MIGRATED_KEY = 'mpx:player-mpv-v1';

function readPlayerMigrated(): boolean {
    try {
        return localStorage.getItem(PLAYER_MPV_MIGRATED_KEY) === '1';
    } catch {
        return true; // no storage: never flip a saved choice
    }
}

export function markPlayerMigrated(): void {
    try {
        localStorage.setItem(PLAYER_MPV_MIGRATED_KEY, '1');
    } catch {
        // storage blocked
    }
}

/**
 * Saved settings from before MPV was the default hold Video.js (the old default, written with every settings save).
 * In the desktop app they move to the MPV default once; a player chosen after that (Video.js included) is kept.
 */
export function migrateDefaultPlayer(
    stored: VideoPlayer | undefined
): VideoPlayer | undefined {
    if (readPlayerMigrated()) return stored;
    const target = defaultVideoPlayer();
    if ((stored === undefined || stored === VideoPlayer.VideoJs) && target !== VideoPlayer.VideoJs) {
        return target;
    }
    return stored;
}

/**
 * The default MPV integrado (macOS) on a Mac where it does not work (addon or libmpv missing): back to the built-in
 * player, so a movie never stays without video. Only for the default; a player chosen by hand is never touched.
 */
export async function embeddedDefaultWorks(): Promise<boolean> {
    try {
        const support = await window.electron?.prepareEmbeddedMpv?.();
        return support?.supported === true;
    } catch {
        return false;
    }
}
