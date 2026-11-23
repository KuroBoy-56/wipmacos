import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';

/**
 * The panel is the only way in: it gives the device one Xtream line and PanelSessionService
 * stores its playlist id in `session_token` (`panel-<id>`). Any other source (an M3U file, a
 * Stalker portal or an Xtream line from another provider, added by hand, dropped on the
 * window or restored from a backup) never opens, even if it is still in the database.
 */

const SOURCE_URL = /^\/workspace\/(xtreams|stalker|playlists)\/([^/?#]+)/;

/** Playlist id of the line the panel gave this device ('' without a panel session). */
export function panelLineId(): string {
    try {
        const token = localStorage.getItem('session_token') ?? '';
        return token.startsWith('panel-') ? token.slice('panel-'.length) : '';
    } catch {
        return '';
    }
}

/**
 * null = the url may open; otherwise where to go instead. Only the panel line's Xtream pages
 * open: an M3U playlist or a Stalker portal never comes from the panel.
 */
export function panelSourceRedirect(url: string, lineId: string): string | null {
    const match = SOURCE_URL.exec(url);
    if (!match) return null;
    const [, kind, rawId] = match;
    let id = rawId;
    try {
        id = decodeURIComponent(rawId);
    } catch {
        // keep the raw id
    }
    if (kind === 'xtreams' && lineId && id === lineId) return null;
    return lineId ? `/workspace/xtreams/${encodeURIComponent(lineId)}/home` : '/login';
}

export const panelSourceGuard: CanActivateChildFn = (_route, state) => {
    const redirect = panelSourceRedirect(state.url, panelLineId());
    return redirect === null ? true : inject(Router).parseUrl(redirect);
};
