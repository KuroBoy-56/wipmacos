import { FavTeam, PanelSportsFixtures } from '@iptvnator/services';

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
