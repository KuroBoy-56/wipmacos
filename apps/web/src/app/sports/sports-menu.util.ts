import { PanelSportsEvent } from '@iptvnator/services';
import { SportsChannelTarget, SportsEventChannels } from './sports-data.service';

/** What a menu row does (webOS / Vega / Roku "¿Dónde quieres verlo?"). */
export type SportsMenuAct =
    | { kind: 'auto' }
    | { kind: 'tv'; index: number }
    | { kind: 'play'; target: SportsChannelTarget }
    | { kind: 'search'; q: string }
    | { kind: 'type'; q: string };

export interface SportsMenuOpt {
    title: string;
    sub?: string;
    /** the client has this channel in its list */
    green?: boolean;
    act: SportsMenuAct;
}

type Tr = (key: string, params?: Record<string, string>) => string;

/** The match's channels in the client's list: the automatic one first, the agenda's, the guide's and by teams. */
export function ownedChannels(m: SportsEventChannels | undefined): SportsChannelTarget[] {
    const out: SportsChannelTarget[] = [];
    const seen = new Set<string>();
    for (const c of m ? [m.best, ...m.tv.map((x) => x.ch), ...m.epg, m.teams] : []) {
        if (c && !seen.has(c.streamId)) {
            seen.add(c.streamId);
            out.push(c);
        }
    }
    return out;
}

/**
 * Menu of a match, as webOS: the automatic channel, the channels that broadcast it (green = in the client's list;
 * with the panel's "iptv" mode only those), the guide and team channels, search by each team and a typed search.
 */
export function sportsMenu(e: PanelSportsEvent, m: SportsEventChannels | undefined, iptv: boolean, t: Tr): SportsMenuOpt[] {
    const opts: SportsMenuOpt[] = [
        {
            title: '▶ ' + t('MPX.SPORTS.WATCH_EVENT'),
            sub: m?.best ? m.best.name : t('MPX.SPORTS.WATCH_EVENT_HINT'),
            green: !!m?.best,
            act: { kind: 'auto' },
        },
    ];
    const seen = new Set<string>();
    (m?.tv ?? []).forEach((tv, index) => {
        if (tv.ch && seen.has(tv.ch.streamId)) return;
        if (iptv && !tv.ch) return;
        if (tv.ch) seen.add(tv.ch.streamId);
        opts.push({
            title: iptv && tv.ch ? tv.ch.name : tv.n + (tv.c ? ` (${tv.c})` : ''),
            sub: (tv.usual ? t('MPX.SPORTS.USUAL') + ' · ' : '') + (tv.ch ? t('MPX.SPORTS.IN_LIST', { name: tv.ch.name }) : t('MPX.SPORTS.NOT_IN_LIST')),
            green: !!tv.ch,
            act: { kind: 'tv', index },
        });
    });
    const extra: [SportsChannelTarget, string][] = [
        ...(m?.epg ?? []).map((c): [SportsChannelTarget, string] => [c, t('MPX.SPORTS.IN_GUIDE')]),
        ...(m?.teams ? [[m.teams, t('MPX.SPORTS.BY_TEAMS_SHORT')] as [SportsChannelTarget, string]] : []),
    ];
    for (const [c, why] of extra) {
        if (seen.has(c.streamId) || opts.length > 10) continue;
        seen.add(c.streamId);
        opts.push({ title: `${c.name} · ${why}`, green: true, act: { kind: 'play', target: c } });
    }
    const names = [e.h, e.a].filter((n) => !!n?.trim());
    if (!names.length && e.ev) names.push(e.ev);
    for (const n of names) opts.push({ title: t('MPX.SPORTS.SEARCH_CHANNELS', { name: n }), act: { kind: 'search', q: n } });
    opts.push({ title: t('MPX.SPORTS.TYPE_SEARCH'), act: { kind: 'type', q: names[0] ?? '' } });
    return opts;
}
