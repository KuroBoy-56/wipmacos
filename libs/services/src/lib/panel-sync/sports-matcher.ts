import {
    PanelSportsEvent,
    SportsChannelMatch,
    SportsLiveCategory,
    SportsLiveStream,
    SportsMatchRules,
} from './panel-sports.types';

/** Used when the panel response has no rules (same values the panel sends). */
export const DEFAULT_SPORTS_MATCH_RULES: SportsMatchRules = {
    stop: [
        'fc', 'cf', 'sc', 'ac', 'cd', 'ca', 'club', 'de', 'del', 'la', 'el', 'los', 'las',
        'the', 'and', 'vs', 'v', 'city', 'united', 'real', 'sporting', 'atletico',
        'deportivo', 'union', 'women', 'femenil', 'w', 'u20', 'u21', 'u23', 'sub',
    ],
    alias: {},
    eventCategory: 'event|ppv|pay per view|deportes? en vivo|live sport|partidos? (de )?hoy',
    scoring: {
        fullName: 2,
        token: 1,
        teamWeight: 10,
        bothTeamsBonus: 15,
        leagueBonus: 3,
        eventCategoryBonus: 6,
        singleTokenWeight: 8,
    },
};

/** Lowercase, strip accents, anything outside [a-z0-9] becomes one space. */
export function normalizeSportsText(value: string | null | undefined): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

export function sportsTokens(value: string, rules: SportsMatchRules): string[] {
    const stop = new Set(rules.stop);
    return normalizeSportsText(value)
        .split(' ')
        .filter((t) => t.length >= 3 && !stop.has(t));
}

function sportsAlias(name: string, rules: SportsMatchRules): string[] {
    const n = normalizeSportsText(name);
    const alias = rules.alias[n];
    return alias ? [n, alias] : [n];
}

function hasWord(haystack: string, word: string): boolean {
    return ` ${haystack} `.includes(` ${word} `);
}

/** 0 = absent, `token` = a distinctive word matches, `fullName` = whole name. */
export function sportsTeamScore(channel: string, team: string, rules: SportsMatchRules): number {
    if (!team.trim()) return 0;
    let best = 0;
    for (const n of sportsAlias(team, rules)) {
        if (n.length >= 3 && hasWord(channel, n)) return rules.scoring.fullName;
        for (const t of sportsTokens(n, rules)) {
            if (t.length >= 4 && hasWord(channel, t)) best = rules.scoring.token;
        }
    }
    return best;
}

interface IndexedStream {
    st: SportsLiveStream;
    /** normalizeSportsText(name) */
    norm: string;
    /** channelKey(name) */
    key: string[];
}

interface SportsIndex {
    items: IndexedStream[];
    /** channelKey joined without spaces -> positions in items */
    byCompact: Map<string, number[]>;
}

// shortcut: the index lives as long as the streams array (WeakMap); a new list builds a new one
const INDEXES = new WeakMap<readonly SportsLiveStream[], SportsIndex>();

/** Normalized names and channel keys, built once per channel list (Roku: nfSportIndex). */
function sportsIndex(streams: readonly SportsLiveStream[]): SportsIndex {
    let idx = INDEXES.get(streams);
    if (idx) return idx;
    idx = { items: [], byCompact: new Map() };
    for (const st of streams) {
        if (!st?.stream_id) continue;
        const name = String(st.name ?? '');
        const key = channelKey(name);
        const pos = idx.items.push({ st, norm: normalizeSportsText(name), key }) - 1;
        const compact = key.join('');
        if (compact) idx.byCompact.set(compact, [...(idx.byCompact.get(compact) ?? []), pos]);
    }
    INDEXES.set(streams, idx);
    return idx;
}

function toMatch(st: SportsLiveStream, partial = false): SportsChannelMatch {
    return { streamId: String(st.stream_id), categoryId: String(st.category_id ?? ''), name: String(st.name ?? ''), partial };
}

function mergeRules(rules?: Partial<SportsMatchRules> | null): SportsMatchRules {
    const d = DEFAULT_SPORTS_MATCH_RULES;
    return {
        stop: Array.isArray(rules?.stop) ? rules.stop : d.stop,
        alias: rules?.alias && typeof rules.alias === 'object' ? rules.alias : d.alias,
        eventCategory: rules?.eventCategory || d.eventCategory,
        scoring: { ...d.scoring, ...(rules?.scoring ?? {}) },
    };
}

/**
 * Finds the user's live channel for a match with the panel's rules (the web
 * player's sp_find_channel). Falls back to the first channel of the event
 * folders (partial), as Roku, Vega and webOS do; null without one.
 */
export function findSportsChannel(
    event: Pick<PanelSportsEvent, 'h' | 'a' | 'lg' | 'ev'>,
    streams: SportsLiveStream[],
    categories: SportsLiveCategory[],
    panelRules?: Partial<SportsMatchRules> | null
): SportsChannelMatch | null {
    const rules = mergeRules(panelRules);
    const s = rules.scoring;
    let eventRe: RegExp | null = null;
    try {
        eventRe = new RegExp(rules.eventCategory, 'i');
    } catch {
        eventRe = null;
    }
    const eventCats = new Map<string, string>();
    for (const c of categories) {
        if (eventRe?.test(normalizeSportsText(c.category_name))) {
            eventCats.set(String(c.category_id), c.category_name);
        }
    }

    const home = event.h ?? '';
    const away = event.a ?? '';
    const withTeams = home !== '' || away !== '';
    const leagueToks = sportsTokens(event.lg ?? '', rules);
    const single = withTeams ? [] : sportsTokens(event.ev ?? '', rules);
    let best: { score: number; stream: SportsLiveStream } | null = null;

    let folder: SportsLiveStream | null = null;
    for (const { st, norm: chan } of sportsIndex(streams).items) {
        const isEv = eventCats.has(String(st.category_id ?? ''));
        if (isEv && !folder) folder = st;
        let score: number;
        if (withTeams) {
            const hs = sportsTeamScore(chan, home, rules);
            const as = sportsTeamScore(chan, away, rules);
            if (!hs && !as) continue;
            // Outside event folders both teams must appear ("Real Madrid TV").
            if (!isEv && !(hs && as)) continue;
            // "Real Madrid vs Barcelona" is not "Real Madrid vs Getafe".
            if (!(hs && as) && / (vs|v|x) /.test(` ${chan} `)) continue;
            score = hs * s.teamWeight + as * s.teamWeight + (hs && as ? s.bothTeamsBonus : 0);
        } else {
            const hit = single.filter((t) => hasWord(chan, t)).length;
            if (!hit || (!isEv && hit < 2)) continue;
            score = hit * s.singleTokenWeight;
        }
        if (leagueToks.some((t) => hasWord(chan, t))) score += s.leagueBonus;
        if (isEv) score += s.eventCategoryBonus;
        if (!best || score > best.score) best = { score, stream: st };
    }

    if (best) return toMatch(best.stream);
    return folder ? toMatch(folder, true) : null;
}

/* ---------- broadcast channel -> the client's channels ("ESPN 2" -> its ESPN 2 channels) ---------- */

// what does not tell one channel from another: quality and country/region tags
const CHANNEL_NOISE = new Set([
    'hd', 'fhd', 'uhd', 'sd', '4k', '8k', 'hq', 'hevc', 'h264', 'h265', '1080', '1080p', '720', '720p', '50fps', '60fps', 'fps',
    'backup', 'bk', 'alt', 'vip', 'op1', 'op2', 'tv', 'channel', 'canal',
    'mx', 'mex', 'mexico', 'us', 'usa', 'eeuu', 'ar', 'arg', 'argentina', 'co', 'col', 'colombia', 'cl', 'chile', 'pe', 'peru', 'ec', 'ecuador',
    've', 'venezuela', 'uy', 'uruguay', 'py', 'paraguay', 'bo', 'bolivia', 'cr', 'pa', 'panama', 'gt', 'hn', 'sv', 'ni', 'do', 'pr',
    'latam', 'latin', 'latino', 'latina', 'lat', 'america', 'es', 'esp', 'spain', 'espana', 'uk', 'gb', 'int', 'intl', 'international',
    'br', 'bra', 'brasil', 'brazil', 'pt', 'portugal', 'ca', 'can', 'canada', 'fr', 'france', 'it', 'italy', 'de', 'germany',
    'nl', 'netherlands', 'au', 'australia', 'nz', 'zealand', 'new', 'ie', 'ireland', 'en', 'network', 'net',
]);

/** Words that identify a channel; a number sticks to the word before it ("ESPN 2" -> ["espn2"]). */
export function channelKey(name: string): string[] {
    const out: string[] = [];
    for (let t of normalizeSportsText(name).split(' ')) {
        // "M+ LaLiga" (Movistar Plus) arrives as "m laliga"
        if (t === 'm') t = 'movistar';
        if (!t || CHANNEL_NOISE.has(t)) continue;
        if (/^\d+$/.test(t) && out.length && !/^\d+$/.test(out[out.length - 1])) out[out.length - 1] += t;
        else out.push(t);
    }
    return out;
}

/**
 * The client's channel for a broadcast channel name (webOS / Vega / Roku): same name without quality or country
 * first, then one that contains all its words, last one that has them glued ("La Liga Hypermotion" =
 * "laligahypermotion"). "ESPN 2" never returns "ESPN" or "ESPN 3".
 */
export function findChannelByName(tvName: string, streams: readonly SportsLiveStream[]): SportsLiveStream | null {
    const q = channelKey(tvName);
    const qs = q.join(' ');
    const qc = q.join('');
    if (!q.length || qc.length < 2) return null;
    const idx = sportsIndex(streams);
    const len = (it: IndexedStream) => String(it.st.name ?? '').length;
    let best: IndexedStream | null = null;
    let bestScore = -Infinity;
    const consider = (it: IndexedStream, score: number) => {
        if (!best || score > bestScore) {
            best = it;
            bestScore = score;
        }
    };
    const exact = idx.byCompact.get(qc);
    if (exact) {
        for (const i of exact) {
            const it = idx.items[i];
            consider(it, 1000 - it.key.length * 10 - len(it) + (it.key.join(' ') === qs ? 100 : 0));
        }
    } else {
        for (const it of idx.items) {
            if (it.key.length && q.every((t) => it.key.includes(t))) consider(it, 500 - 10 * (it.key.length - q.length) - len(it));
        }
        if (!best && q[0].length >= 3) {
            // glued words: each word inside the channel's key, not followed by a number
            const want = qc.length;
            for (const it of idx.items) {
                const compact = it.key.join('');
                if (!compact || !q.every((t) => {
                    const p = compact.indexOf(t);
                    return p >= 0 && !/\d/.test(compact.charAt(p + t.length));
                })) continue;
                consider(it, 300 - (compact.length - want) - len(it));
            }
        }
    }
    return best ? (best as IndexedStream).st : null;
}

/** First broadcast channel of the match the client has, else the team / event-name match. */
export function findSportsChannelForEvent(
    event: PanelSportsEvent,
    streams: SportsLiveStream[],
    categories: SportsLiveCategory[],
    panelRules?: Partial<SportsMatchRules> | null
): SportsChannelMatch | null {
    for (const t of event.tv ?? []) {
        const st = findChannelByName(t.n, streams);
        if (st) return toMatch(st);
    }
    return findSportsChannel(event, streams, categories, panelRules);
}
