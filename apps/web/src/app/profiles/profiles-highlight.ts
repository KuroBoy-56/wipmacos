import { currentAppLanguage, panelEndpoint, tmdbLanguageFor, withPanelLang, withTenantQuery } from '@iptvnator/shared/interfaces';

export interface ProfilesHighlight {
    title: string;
    rating: number;
    year: string;
    kind: 'movie' | 'tv';
    backdrop: string;
}

let cache: { lang: string; at: number; h: ProfilesHighlight | null } | null = null;

/** Lo primero con fondo de una respuesta de trending/all/week (como la web player). */
export function pickHighlight(body: unknown): ProfilesHighlight | null {
    const results = (body as { results?: Record<string, unknown>[] } | null)?.results;
    for (const r of Array.isArray(results) ? results : []) {
        const kind = r?.['media_type'];
        const backdrop = String(r?.['backdrop_path'] ?? '');
        if (!backdrop || (kind !== 'movie' && kind !== 'tv')) continue;
        const title = String(r['title'] ?? r['name'] ?? '');
        if (!title) continue;
        const date = String(r['release_date'] ?? r['first_air_date'] ?? '');
        return { title, rating: Math.round((Number(r['vote_average']) || 0) * 10) / 10, year: date.slice(0, 4), kind, backdrop: 'https://image.tmdb.org/t/p/original' + backdrop };
    }
    return null;
}

/**
 * Lo más destacado de la semana en TMDB, de fondo en «¿Quién está viendo?»: por el panel (api/tmdb.php, la clave del
 * distribuidor o del dueño), 6 h en memoria. Sin clave o sin respuesta, sin fondo.
 */
export async function weekHighlight(fetcher: typeof fetch = fetch): Promise<ProfilesHighlight | null> {
    const lang = currentAppLanguage();
    if (cache && cache.lang === lang && Date.now() - cache.at < 6 * 3600_000) return cache.h;
    try {
        const url = withTenantQuery(withPanelLang(`${panelEndpoint('tmdb.php')}?path=trending/all/week&language=${tmdbLanguageFor(lang)}`, lang));
        const res = await fetcher(url);
        if (!res.ok) return null;
        const h = pickHighlight(await res.json());
        cache = { lang, at: Date.now(), h };
        return h;
    } catch {
        return null;
    }
}
