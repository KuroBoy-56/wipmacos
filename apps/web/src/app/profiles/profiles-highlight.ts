import { currentAppLanguage, panelEndpoint, tmdbLanguageFor, withPanelLang, withTenantQuery } from '@iptvnator/shared/interfaces';
import { panelBackdropSources } from '@iptvnator/services';

export interface ProfilesHighlight {
    id: string;
    title: string;
    rating: number;
    year: string;
    kind: 'movie' | 'tv';
    /** TMDB original (4K) */
    backdrop: string;
}

/** Como la web player (wp_prof_highlights): 15 a 20 títulos, la página 2 solo si la 1 no llega a 15. */
export const HIGHLIGHTS_MIN = 15;
export const HIGHLIGHTS_MAX = 20;

let cache: { lang: string; at: number; list: ProfilesHighlight[] } | null = null;

/** Un título de trending/all/week con fondo y nombre; null si no sirve. */
export function toHighlight(r: Record<string, unknown> | null | undefined): ProfilesHighlight | null {
    const kind = r?.['media_type'];
    const backdrop = String(r?.['backdrop_path'] ?? '');
    if (!r || !backdrop || (kind !== 'movie' && kind !== 'tv')) return null;
    const title = String(r['title'] ?? r['name'] ?? '');
    if (!title) return null;
    const date = String(r['release_date'] ?? r['first_air_date'] ?? '');
    return {
        id: `${kind}:${String(r['id'] ?? title)}`,
        title,
        rating: Math.round((Number(r['vote_average']) || 0) * 10) / 10,
        year: date.slice(0, 4),
        kind,
        backdrop: 'https://image.tmdb.org/t/p/original' + backdrop,
    };
}

/** Agrega los títulos de una respuesta a la lista (sin repetir, hasta 20). */
export function addHighlights(list: ProfilesHighlight[], body: unknown): void {
    const results = (body as { results?: Record<string, unknown>[] } | null)?.results;
    for (const r of Array.isArray(results) ? results : []) {
        if (list.length >= HIGHLIGHTS_MAX) return;
        const h = toHighlight(r);
        if (h && !list.some((x) => x.id === h.id)) list.push(h);
    }
}

/** Direcciones del fondo: Full HD (caché de imágenes del panel, o TMDB w1280) y el original para pantallas grandes. */
export function highlightSources(h: ProfilesHighlight): { fhd: string; w: number; orig: string } {
    const srcs = panelBackdropSources(h.backdrop);
    return srcs.length > 1
        ? { fhd: srcs[0], w: 1920, orig: h.backdrop }
        : { fhd: h.backdrop.replace('/t/p/original/', '/t/p/w1280/'), w: 1280, orig: h.backdrop };
}

/**
 * Lo más destacado de la semana en TMDB, de fondo en «¿Quién está viendo?» (docs/PERFILES.md del panel, sección 6):
 * por el panel (api/tmdb.php, la clave del distribuidor o del dueño), 6 h en memoria. Sin respuesta del panel no se
 * guarda (se vuelve a probar la próxima vez) y no hay fondo.
 */
export async function weekHighlights(fetcher: typeof fetch = fetch): Promise<ProfilesHighlight[]> {
    const lang = currentAppLanguage();
    if (cache && cache.lang === lang && Date.now() - cache.at < 6 * 3600_000) return cache.list;
    const list: ProfilesHighlight[] = [];
    let ok = false;
    for (const page of [1, 2]) {
        if (list.length >= HIGHLIGHTS_MIN) break;
        try {
            const path = `${panelEndpoint('tmdb.php')}?path=trending/all/week&language=${tmdbLanguageFor(lang)}&page=${page}`;
            const res = await fetcher(withTenantQuery(withPanelLang(path, lang)));
            if (!res.ok) break;
            const body = (await res.json()) as { error?: unknown } | null;
            if (!body || body.error) break;
            ok = true;
            addHighlights(list, body);
        } catch {
            break;
        }
    }
    if (ok) cache = { lang, at: Date.now(), list };
    return list;
}

/** Pruebas: olvida la lista guardada. */
export function resetHighlightsCache(): void {
    cache = null;
}
