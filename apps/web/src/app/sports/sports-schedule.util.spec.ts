import { PanelSportsEvent } from '@iptvnator/services';
import {
    DEFAULT_SPORTS_META,
    groupByLeague,
    hasScore,
    matchesSportsQuery,
    sportCounts,
    eventsForDay,
    sportsDayKey,
    sportsEventStatus,
    toSportsCards,
} from './sports-schedule.util';

const base: PanelSportsEvent = {
    id: '1',
    sp: 'Soccer',
    lg: 'La Liga',
    lb: '',
    ev: 'Real Madrid vs Getafe',
    h: 'Real Madrid',
    a: 'Getafe',
    hb: '',
    ab: '',
    hs: null,
    as: null,
    ts: '2026-10-04T18:00:00Z',
    v: '',
    st: '',
    th: '',
    pp: false,
};

describe('sports schedule utils', () => {
    const [card] = toSportsCards([base]);
    const start = Date.parse(base.ts);

    it('parses timestamps into cards with a local day key', () => {
        expect(card.start).toBe(start);
        expect(card.dayKey).toBe(sportsDayKey(new Date(start)));
        expect(toSportsCards([{ ...base, ts: 'nope' }])).toEqual([]);
    });

    it('ignores the panel time zone: the day key is always the computer one', () => {
        const late = { ...base, ts: '2026-10-05T02:00:00Z' };
        expect(toSportsCards([late])[0].dayKey).toBe(sportsDayKey(new Date(Date.parse(late.ts))));
    });

    it('derives soon, live, final and postponed states', () => {
        expect(sportsEventStatus(card, DEFAULT_SPORTS_META, start - 1)).toBe('soon');
        expect(sportsEventStatus(card, DEFAULT_SPORTS_META, start + 60_000)).toBe('live');
        expect(sportsEventStatus(card, DEFAULT_SPORTS_META, start + 121 * 60_000)).toBe('fin');
        expect(sportsEventStatus({ ...card, st: 'Match Finished' }, DEFAULT_SPORTS_META, start)).toBe('fin');
        // after penalties, cancelled or abandoned: never «live» while the sport's time window is still open
        for (const st of ['AP', 'After Penalties', 'FT_PEN', 'Final/OT', 'Ended', 'CANC', 'ABD']) {
            expect(sportsEventStatus({ ...card, st }, DEFAULT_SPORTS_META, start + 30 * 60_000)).toBe('fin');
        }
        expect(sportsEventStatus({ ...card, st: '2H' }, DEFAULT_SPORTS_META, start + 30 * 60_000)).toBe('live');
        expect(sportsEventStatus({ ...card, pp: true }, DEFAULT_SPORTS_META, start)).toBe('pp');
    });

    it('shows scores only after kick-off when both are set', () => {
        expect(hasScore({ ...card, hs: 1, as: 0 }, 'live')).toBe(true);
        expect(hasScore({ ...card, hs: 1, as: 0 }, 'soon')).toBe(false);
        expect(hasScore({ ...card, hs: '', as: 0 }, 'fin')).toBe(false);
    });

    it('filters by query and groups by league with counts per sport', () => {
        const other = { ...card, id: '2', sp: 'Tennis', lg: '' };
        expect(matchesSportsQuery(card, 'getafe')).toBe(true);
        expect(matchesSportsQuery(card, 'boca')).toBe(false);
        const onTv = { ...card, h: 'Club América', a: 'Chivas', tv: [{ n: 'ESPN 2', c: 'México' }] };
        expect(matchesSportsQuery(onTv, 'america espn')).toBe(true);
        expect(matchesSportsQuery(onTv, 'américa fox')).toBe(false);
        const groups = groupByLeague([card, other], DEFAULT_SPORTS_META);
        // built-in labels are translation keys (the page translates them)
        expect(groups.map((g) => g.name)).toEqual(['La Liga', 'MPX.SPORTS.SPORT_TENNIS']);
        expect(sportCounts([card, other], card.dayKey)).toEqual({ Soccer: 1, Tennis: 1 });
    });

    it('Finalizados (with profiles): today without the ended ones, and the ended ones of today, latest first', () => {
        const keys = ['2026-11-26', '2026-11-27'];
        const mk = (id: string, dayKey: string, start: number) => ({ ...card, id, dayKey, start });
        const list = [mk('a', keys[0], 1), mk('b', keys[0], 3), mk('c', keys[0], 2), mk('d', keys[1], 4), mk('y', '2026-11-25', 0)];
        const st = (e: { id: string }) => (e.id === 'a' || e.id === 'b' || e.id === 'y' ? 'fin' : 'soon') as 'fin' | 'soon';
        expect(eventsForDay(list, keys, 0, st, true).map((e) => e.id)).toEqual(['c']);
        expect(eventsForDay(list, keys, 0, st, false).map((e) => e.id)).toEqual(['a', 'b', 'c']);
        expect(eventsForDay(list, keys, 2, st, true).map((e) => e.id)).toEqual(['b', 'a']);
        expect(eventsForDay(list, keys, 1, st, true).map((e) => e.id)).toEqual(['d']);
    });
});
