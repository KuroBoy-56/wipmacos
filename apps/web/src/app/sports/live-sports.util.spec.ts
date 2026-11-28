import { PanelLiveEvent } from '@iptvnator/services';
import { clockText, competitionTheme, fieldKind, isSoloEvent, LIVE_ROW_MAX, liveCards, score, soloName } from './live-sports.util';
import { SportsChannelsMap } from './sports-data.service';
import { leagueChoices } from '../settings/settings-live-sports.util';

const ev = (id: string, sp: string): PanelLiveEvent =>
    ({ id, sp, lg: '', lb: '', ev: '', h: 'A', a: 'B', hb: '', ab: '', hs: '1', as: '0', ts: '', v: '', st: '2H', th: '', pp: false, pr: '67' });
const ch = (streamId: string) => ({ streamId, categoryId: '1', name: 'ESPN', partial: false, playlistId: 'p' });

describe('live sports row', () => {
    it('shows only matches with a real channel of the client, of the preferred sport', () => {
        const map: SportsChannelsMap = {
            byEvent: {
                '1': { tv: [], epg: [], teams: null, best: ch('10') },
                '2': { tv: [], epg: [], teams: null, best: null },
                '3': { tv: [], epg: [], teams: null, best: ch('30') },
            },
            folder: null,
        };
        const events = [ev('1', 'Soccer'), ev('2', 'Soccer'), ev('3', 'Basketball'), ev('4', 'Soccer')];
        expect(liveCards(events, map, '').map((c) => c.e.id)).toEqual(['1', '3']);
        expect(liveCards(events, map, 'Basketball').map((c) => c.e.id)).toEqual(['3']);
        expect(liveCards(events, null, '')).toEqual([]);
        // Ajustes › Ligas favoritas: solo esas ligas
        const withLeague = [{ ...ev('1', 'Soccer'), li: '4328' }, { ...ev('3', 'Basketball'), li: '4387' }];
        expect(liveCards(withLeague, map, '', Date.now(), new Set(['4387'])).map((c) => c.e.id)).toEqual(['3']);
        expect(liveCards(withLeague, map, 'Soccer', Date.now(), new Set(['4387']))).toEqual([]);
    });

    it('Ligas favoritas: today first, then the 21-day ones, and the chosen ones even if gone', () => {
        const now = Date.parse('2026-11-27T18:00:00Z');
        const today = new Date(now).toISOString();
        const base = { lb: '', ev: '', h: 'A', a: 'B', hb: '', ab: '', hs: null, as: null, v: '', st: '', th: '', pp: false };
        const agenda = [
            { ...base, id: '1', sp: 'Soccer', lg: 'Premier League', li: '4328', ts: today },
            { ...base, id: '2', sp: 'Soccer', lg: 'Premier League', li: '4328', ts: today },
            { ...base, id: '3', sp: 'Basketball', lg: 'NBA', li: '4387', ts: new Date(now + 3 * 86_400_000).toISOString() },
            { ...base, id: '4', sp: 'Soccer', lg: 'Sin id', ts: today },
        ];
        const fx = { '4350': { n: 'Liga MX', b: '', sp: 'Soccer', c: '', rg: '', w: 0 }, '4328': { n: 'dup', b: '', sp: 'Soccer', c: '', rg: '', w: 0 } };
        // sin deporte favorito no hay eventos que elegir
        expect(leagueChoices(agenda, fx, [], '', now)).toEqual([]);
        const cups = [{ id: '4480', n: 'UEFA Champions League', sp: 'Soccer' }, { id: '4328', n: 'dup', sp: 'Soccer' }];
        const out = leagueChoices(agenda, fx, [{ id: '9', n: 'Vieja', sp: 'Soccer' }], 'Soccer', now, cups);
        expect(out.map((x) => `${x.n}:${x.today}`)).toEqual(['Premier League:2', 'Liga MX:0', 'UEFA Champions League:0', 'Vieja:0']);
        expect(leagueChoices(agenda, fx, [], 'Basketball', now).map((x) => x.n)).toEqual(['NBA']);
    });

    it('live first, then the next ones by hour, at most 20 (then «Ir a Deportes»)', () => {
        const now = Date.now();
        const byEvent: SportsChannelsMap['byEvent'] = {};
        const events: PanelLiveEvent[] = [];
        for (let i = 0; i < 30; i++) {
            byEvent[String(i)] = { tv: [], epg: [], teams: null, best: ch(String(i)) };
            events.push({ ...ev(String(i), 'Soccer'), soon: i >= 2, s: Math.round(now / 1000) + (i >= 2 ? 3600 * (30 - i) : -600) });
        }
        // uno que «empezaba» hace 10 min y el livescore no trae: fuera
        byEvent['old'] = { tv: [], epg: [], teams: null, best: ch('99') };
        events.push({ ...ev('old', 'Soccer'), soon: true, s: Math.round(now / 1000) - 600 });
        const cards = liveCards(events, { byEvent, folder: null }, '', now);
        expect(cards).toHaveLength(LIVE_ROW_MAX);
        expect(cards.slice(0, 2).map((c) => c.e.id)).toEqual(['0', '1']);
        expect(cards[2].e.id).toBe('29');
        expect(cards.some((c) => c.e.id === 'old')).toBe(false);
    });

    it('writes the moment of the match', () => {
        expect(clockText({ st: '2H', pr: '67' }, 'Descanso')).toBe("67'");
        expect(clockText({ st: 'HT', pr: '' }, 'Descanso')).toBe('Descanso');
        expect(clockText({ st: 'Q3', pr: 'Q3 5:21' }, 'Descanso')).toBe('Q3 5:21');
        expect(clockText({ st: 'P2', pr: '' }, 'Descanso')).toBe('P2');
    });

    it('draws the field of each sport and colours the big competitions', () => {
        expect(fieldKind('Soccer')).toBe('soccer');
        expect(fieldKind('Ice Hockey')).toBe('hockey');
        expect(fieldKind('Golf')).toBe('');
        expect(competitionTheme('UEFA Champions League')).toContain('rgba(10,26,107');
        expect(competitionTheme('AFC Champions League')).toBe('');
        expect(competitionTheme('Liga MX')).toBe('');
        expect(score('')).toBe('0');
        expect(score(2)).toBe('2');
    });
});

describe('isSoloEvent / soloName', () => {
    it('peleas, boxeo, WWE y carreras van como evento (aunque traigan dos nombres), los partidos con equipos no', () => {
        expect(isSoloEvent({ h: 'Canelo', a: 'Crawford', sp: 'Boxing' })).toBe(true);
        expect(isSoloEvent({ h: '', a: '', sp: 'Fighting' })).toBe(true);
        expect(isSoloEvent({ h: 'Real Madrid', a: '', sp: 'Soccer' })).toBe(true);
        expect(isSoloEvent({ h: 'Real Madrid', a: 'Barcelona', sp: 'Soccer' })).toBe(false);
        expect(isSoloEvent({ h: 'Lakers', a: 'Celtics', sp: 'Basketball' })).toBe(false);
    });
    it('el nombre: el del evento, o los dos nombres, o la liga', () => {
        expect(soloName({ h: 'Canelo', a: 'Crawford', ev: 'Canelo vs Crawford', lg: 'WBC' })).toBe('Canelo vs Crawford');
        expect(soloName({ h: 'Canelo', a: 'Crawford', ev: '', lg: 'WBC' })).toBe('Canelo vs Crawford');
        expect(soloName({ h: '', a: '', ev: '', lg: 'UFC' })).toBe('UFC');
    });
});
