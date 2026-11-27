import {
    channelKey,
    DEFAULT_SPORTS_MATCH_RULES,
    findChannelByName,
    channelSimilarity,
    findSportsChannel,
    findSportsChannelForEvent,
    normalizeSportsText,
    sportsTeamScore,
    sportsTokens,
} from './sports-matcher';
import { PanelSportsEvent } from './panel-sports.types';

const rules = {
    ...DEFAULT_SPORTS_MATCH_RULES,
    alias: { spain: 'espana', 'manchester city': 'man city' },
};

const categories = [
    { category_id: 1, category_name: 'Deportes' },
    { category_id: 2, category_name: 'EVENTOS PPV' },
];

describe('sports matcher', () => {
    it('normalizes accents and punctuation', () => {
        expect(normalizeSportsText('  Atlético-Madrid ÉXITO! ')).toBe('atletico madrid exito');
    });

    it('drops stop words and short tokens', () => {
        expect(sportsTokens('Real Madrid CF', rules)).toEqual(['madrid']);
    });

    it('scores full names, aliases and distinctive tokens', () => {
        expect(sportsTeamScore('espana vs francia', 'Spain', rules)).toBe(2);
        expect(sportsTeamScore('man city hd', 'Manchester City', rules)).toBe(2);
        expect(sportsTeamScore('barcelona tv', 'FC Barcelona Atlas', rules)).toBe(1);
        expect(sportsTeamScore('espn', '', rules)).toBe(0);
    });

    it('needs both teams outside event folders', () => {
        const streams = [
            { stream_id: 10, name: 'Real Madrid TV', category_id: 1 },
            { stream_id: 11, name: 'Real Madrid vs Getafe', category_id: 1 },
        ];
        const match = findSportsChannel(
            { h: 'Real Madrid', a: 'Getafe', lg: 'La Liga', ev: '' },
            streams,
            categories,
            rules
        );
        expect(match).toMatchObject({ streamId: '11', categoryId: '1', partial: false });
    });

    it('skips "X vs Y" channels when only one team matches, prefers event folders', () => {
        const streams = [
            { stream_id: 20, name: 'PPV 1: Real Madrid vs Barcelona', category_id: 2 },
            { stream_id: 21, name: 'PPV 2: Real Madrid', category_id: 2 },
        ];
        const match = findSportsChannel(
            { h: 'Real Madrid', a: 'Getafe', lg: '', ev: '' },
            streams,
            categories,
            rules
        );
        expect(match?.streamId).toBe('21');
    });

    it('matches single events by title tokens', () => {
        const streams = [
            { stream_id: 30, name: 'UFC 300 Pereira', category_id: 2 },
            { stream_id: 31, name: 'Noticias', category_id: 1 },
        ];
        const match = findSportsChannel(
            { h: '', a: '', lg: 'UFC', ev: 'UFC 300 Pereira vs Hill' },
            streams,
            categories,
            rules
        );
        expect(match?.streamId).toBe('30');
    });

    it('falls back to the first channel of the event folders (it plays, never the list), or null', () => {
        const event = { h: 'Boca', a: 'River', lg: '', ev: '' };
        const streams = [
            { stream_id: 40, name: 'ESPN', category_id: 1 },
            { stream_id: 41, name: 'EVENTO 01', category_id: 2 },
            { stream_id: 42, name: 'EVENTO 02', category_id: 2 },
        ];
        expect(findSportsChannel(event, streams, categories, rules)).toEqual({
            streamId: '41',
            categoryId: '2',
            name: 'EVENTO 01',
            partial: true,
        });
        expect(findSportsChannel(event, [], categories, rules)).toBeNull();
        expect(findSportsChannel(event, streams, [categories[0]], null)).toBeNull();
    });
});

describe('broadcast channel search', () => {
    const streams = [
        { stream_id: 1, name: 'MX: ESPN HD', category_id: 1 },
        { stream_id: 2, name: 'MX: ESPN 2 HD', category_id: 1 },
        { stream_id: 3, name: 'ESPN 3 MX', category_id: 1 },
        { stream_id: 4, name: 'TUDN MX FHD', category_id: 1 },
        { stream_id: 5, name: 'Fox Sports Premium', category_id: 1 },
        { stream_id: 6, name: 'EVENTO 01: Real Madrid vs Getafe', category_id: 2 },
    ];

    it('ignores quality and country and glues numbers to the name', () => {
        expect(channelKey('MX: ESPN 2 HD')).toEqual(['espn2']);
        expect(channelKey('ESPN2 (México)')).toEqual(['espn2']);
        expect(channelKey('DAZN 1 Spain')).toEqual(['dazn1']);
    });

    it('finds the exact channel and never a sibling', () => {
        expect(findChannelByName('ESPN 2', streams)?.stream_id).toBe(2);
        expect(findChannelByName('ESPN2', streams)?.stream_id).toBe(2);
        expect(findChannelByName('ESPN', streams)?.stream_id).toBe(1);
        expect(findChannelByName('ESPN 3', streams)?.stream_id).toBe(3);
        expect(findChannelByName('ESPN 4', streams)).toBeNull();
        expect(findChannelByName('TUDN', streams)?.stream_id).toBe(4);
        expect(findChannelByName('Sky Sports', streams)).toBeNull();
    });

    it('reads a bare name as its first channel ("ESPN" = "ESPN 1", "DAZN" = "DAZN 1")', () => {
        const list = [
            { stream_id: 11, name: 'MX | ESPN 1 FHD', category_id: 1 },
            { stream_id: 12, name: 'ESPN 2 HD', category_id: 1 },
            { stream_id: 13, name: 'DAZN 1 ES', category_id: 1 },
        ];
        expect(findChannelByName('ESPN', list)?.stream_id).toBe(11);
        expect(findChannelByName('DAZN', list)?.stream_id).toBe(13);
        expect(findChannelByName('ESPN 2', list)?.stream_id).toBe(12);
        expect(findChannelByName('ESPN 3', list)).toBeNull();
    });

    it('stronger matching: plus, number words, new tags and Levenshtein with the same numbers', () => {
        const list = (names: string[]) => names.map((name, i) => ({ stream_id: i + 1, name, category_id: 1 }));
        const id = (names: string[], q: string) => findChannelByName(q, list(names))?.stream_id ?? -1;
        expect(id(['ESPN', 'ESPN+'], 'ESPN+')).toBe(2);
        expect(id(['ESPN', 'ESPN+'], 'ESPN')).toBe(1);
        expect(id(['MX: Movistar LaLiga FHD'], 'Movistar+ LaLiga')).toBe(1);
        expect(id(['TyC Sports HD'], 'TyC Sport')).toBe(1);
        expect(id(['Fox Sports Premium'], 'Fox Sport Premium')).toBe(1);
        expect(id(['Fox Sports 1', 'Fox Sports 2'], 'Fox Sport')).toBe(1);
        expect(id(['ESPN Two'], 'ESPN 2')).toBe(1);
        expect(id(['US: ESPN Deportes East'], 'ESPN Deportes')).toBe(1);
        expect(id(['|ES| DAZN LaLiga 2160p HDR'], 'DAZN LaLiga')).toBe(1);
        expect(id(['Sky Sports F1 UHD'], 'Sky Sports 1')).toBe(-1);
        expect(id(['ESPN 3'], 'ESPN 2')).toBe(-1);
        expect(id(['Telemundo'], 'TUDN')).toBe(-1);
        expect(channelSimilarity('sport tyc', 'sports tyc')).toBeCloseTo(0.9);
    });

    it('uses the usual channels (tvh) only after the agenda and the teams', () => {
        const list = [
            { stream_id: 21, name: 'TUDN HD', category_id: 1 },
            { stream_id: 22, name: 'EVENTO 05', category_id: 2 },
        ];
        const cats = [{ category_id: 1, category_name: 'Deportes' }, { category_id: 2, category_name: 'EVENTOS PPV' }];
        const ev = { id: 'x', h: 'América', a: 'Toluca', lg: 'Liga MX', ev: '' } as unknown as PanelSportsEvent;
        expect(findSportsChannelForEvent({ ...ev, tvh: [{ n: 'TUDN', c: 'México' }] }, list, cats)).toMatchObject({ streamId: '21', partial: true });
        // with the agenda's channels the usual ones are not used
        expect(findSportsChannelForEvent({ ...ev, tv: [{ n: 'Fox Sports', c: 'México' }], tvh: [{ n: 'TUDN', c: 'México' }] }, list, cats))
            .toMatchObject({ streamId: '22', partial: true });
    });

    it('reads M+ as Movistar and finds glued names, like webOS', () => {
        const list = [
            { stream_id: 7, name: 'ES: Movistar LaLiga HD', category_id: 1 },
            { stream_id: 8, name: 'LALIGAHYPERMOTION', category_id: 1 },
            { stream_id: 9, name: 'LALIGAHYPERMOTION 2', category_id: 1 },
        ];
        expect(findChannelByName('M+ LaLiga', list)?.stream_id).toBe(7);
        expect(findChannelByName('La Liga Hypermotion', list)?.stream_id).toBe(8);
        expect(findChannelByName('ESPN Network', [{ stream_id: 1, name: 'ESPN HD', category_id: 1 }])?.stream_id).toBe(1);
    });

    it('uses the broadcast channels first, then the teams', () => {
        const ev = { id: '1', sp: 'Soccer', lg: 'La Liga', lb: '', ev: 'Real Madrid vs Getafe', h: 'Real Madrid', a: 'Getafe', hb: '', ab: '', hs: null, as: null, ts: '', v: '', st: '', th: '', pp: false };
        expect(findSportsChannelForEvent({ ...ev, tv: [{ n: 'Sky Sports', c: 'Reino Unido' }, { n: 'ESPN 2', c: 'México' }] }, streams, categories, rules)?.streamId).toBe('2');
        expect(findSportsChannelForEvent({ ...ev, tv: [{ n: 'Sky Sports', c: '' }] }, streams, categories, rules)?.streamId).toBe('6');
        expect(findSportsChannelForEvent(ev, streams, categories, rules)?.streamId).toBe('6');
    });
});
