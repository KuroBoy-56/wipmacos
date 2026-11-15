import { ownedChannels, sportsMenu } from './sports-menu.util';

const ch = (id: string, name: string) => ({ streamId: id, categoryId: '1', name, partial: false, playlistId: 'pl' });
const ev = { id: '1', sp: 'Soccer', lg: '', lb: '', ev: 'Boca vs River', h: 'Boca', a: 'River', hb: '', ab: '', hs: null, as: null, ts: '', v: '', st: '', th: '', pp: false };
const t = (k: string, p?: Record<string, string>) => k + (p ? ':' + Object.values(p).join('|') : '');
const m = {
    tv: [
        { n: 'ESPN 2', c: 'México', ch: ch('2', 'MX: ESPN 2 HD') },
        { n: 'TUDN', c: '', ch: null },
        { n: 'ESPN2', c: '', ch: ch('2', 'MX: ESPN 2 HD') },
    ],
    epg: [ch('7', 'TyC Sports'), ch('2', 'MX: ESPN 2 HD')],
    teams: ch('9', 'EVENTO 01: Boca vs River'),
    best: ch('2', 'MX: ESPN 2 HD'),
};

describe('sports menu (webOS)', () => {
    it('lists the automatic channel, broadcast channels, guide and teams, then the searches', () => {
        const opts = sportsMenu(ev, m, false, t);
        expect(opts.map((o) => o.title)).toEqual([
            '▶ MPX.SPORTS.WATCH_EVENT',
            'ESPN 2 (México)',
            'TUDN',
            'TyC Sports · MPX.SPORTS.IN_GUIDE',
            'EVENTO 01: Boca vs River · MPX.SPORTS.BY_TEAMS_SHORT',
            'MPX.SPORTS.SEARCH_CHANNELS:Boca',
            'MPX.SPORTS.SEARCH_CHANNELS:River',
            'MPX.SPORTS.TYPE_SEARCH',
        ]);
        expect(opts[0]).toMatchObject({ sub: 'MX: ESPN 2 HD', green: true });
        expect(opts[2]).toMatchObject({ sub: 'MPX.SPORTS.NOT_IN_LIST', green: false, act: { kind: 'tv', index: 1 } });
    });

    it('iptv mode: only the client channels, with their own names', () => {
        const titles = sportsMenu(ev, m, true, t).map((o) => o.title);
        expect(titles).toContain('MX: ESPN 2 HD');
        expect(titles).not.toContain('TUDN');
        expect(ownedChannels(m).map((c) => c.streamId)).toEqual(['2', '7', '9']);
    });
});
