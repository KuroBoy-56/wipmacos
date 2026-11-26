import { PanelLiveEvent } from '@iptvnator/services';
import { clockText, competitionTheme, fieldKind, liveCards, score } from './live-sports.util';
import { SportsChannelsMap } from './sports-data.service';

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
