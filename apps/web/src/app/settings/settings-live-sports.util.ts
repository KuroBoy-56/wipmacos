import { FavTeam, PanelSportsEvent, PanelSportsFixtures } from '@iptvnator/services';
import { FavLeague } from '../sports/live-sports.util';

type FxEvent = PanelSportsFixtures['events'][number] & { hn?: string; an?: string };

/** equipos de una liga: los de sus próximos partidos (selecciones con su nombre en el idioma de la app: hn / an) */
export function fixtureTeams(fx: PanelSportsFixtures, league: string): FavTeam[] {
    const sp = fx.leagues[league]?.sp ?? '';
    const out = new Map<string, FavTeam>();
    for (const e of fx.events as FxEvent[]) {
        if (e.l !== league) continue;
        if (e.h && !out.has(e.h)) out.set(e.h, { n: e.h, l: e.hn ?? '', b: e.hb ?? '', lg: league, sp });
        if (e.a && !out.has(e.a)) out.set(e.a, { n: e.a, l: e.an ?? '', b: e.ab ?? '', lg: league, sp });
    }
    return [...out.values()].sort((x, y) => (x.l || x.n).localeCompare(y.l || y.n));
}

export interface LeagueChoice extends FavLeague {
    /** matches of this league today in the agenda (computer time zone) */
    today: number;
}

/**
 * Ajustes › Ligas favoritas: the agenda's leagues (with how many matches they have today) and the next 21 days' ones;
 * with a favorite sport only that sport's. Leagues playing today first; the chosen ones are always there to untick.
 */
export function leagueChoices(
    agenda: readonly PanelSportsEvent[],
    fxLeagues: PanelSportsFixtures['leagues'] | undefined,
    chosen: readonly FavLeague[],
    sport: string,
    now = Date.now()
): LeagueChoice[] {
    const today = new Date(now).toDateString();
    const map = new Map<string, LeagueChoice>();
    for (const e of agenda) {
        if (!e.li || !e.lg) continue;
        const x = map.get(e.li) ?? { id: e.li, n: e.lg, b: e.lb, sp: e.sp, today: 0 };
        const t = Date.parse(e.ts);
        if (!Number.isNaN(t) && new Date(t).toDateString() === today) x.today++;
        map.set(e.li, x);
    }
    for (const [id, l] of Object.entries(fxLeagues ?? {})) if (!map.has(id) && l?.n) map.set(id, { id, n: l.n, b: l.b, sp: l.sp, today: 0 });
    for (const l of chosen) if (!map.has(l.id)) map.set(l.id, { ...l, today: 0 });
    return [...map.values()]
        .filter((x) => !sport || x.sp === sport)
        .sort((a, b) => Number(b.today > 0) - Number(a.today > 0) || a.sp.localeCompare(b.sp) || a.n.localeCompare(b.n));
}
