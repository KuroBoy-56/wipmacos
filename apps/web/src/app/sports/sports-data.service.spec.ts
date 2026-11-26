import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { ParentalControlService, PanelSyncService } from '@iptvnator/services';
import { XTREAM_DATA_SOURCE } from '@iptvnator/portal/xtream/data-access';
import { SportsDataService } from './sports-data.service';

describe('SportsDataService.matchEvents (Roku flow)', () => {
    it('matches only visible channels, broadcast channel first, event folder channel as fallback', async () => {
        TestBed.configureTestingModule({
            providers: [
                { provide: Store, useValue: { select: () => of([{ _id: 'pl', serverUrl: 'http://p', username: 'u' }]) } },
                { provide: PanelSyncService, useValue: { fetchSportsEpg: jest.fn().mockResolvedValue({}) } },
                { provide: XTREAM_DATA_SOURCE, useValue: { getAllCategories: async () => [{ xtream_id: 5, hidden: true }] } },
                {
                    provide: ParentalControlService,
                    useValue: {
                        locked: () => true,
                        blocked: () => new Set(),
                        hiddenIds: (cats: { category_id: number; category_name: string }[]) =>
                            new Set(cats.filter((c) => /xxx/i.test(c.category_name)).map((c) => String(c.category_id))),
                    },
                },
            ],
        });
        const service = TestBed.inject(SportsDataService);
        jest.spyOn(service as unknown as { fetchProviderLive: () => Promise<unknown> }, 'fetchProviderLive').mockResolvedValue({
            streams: [
                { stream_id: 1, name: 'ADULT ESPN 2', category_id: 9 },
                { stream_id: 2, name: 'MX: ESPN 2 HD', category_id: 1 },
                { stream_id: 3, name: 'EVENTO 01', category_id: 2 },
                { stream_id: 4, name: 'HIDDEN TUDN', category_id: 5 },
            ],
            categories: [
                { category_id: 1, category_name: 'Deportes' },
                { category_id: 2, category_name: 'EVENTOS PPV' },
                { category_id: 5, category_name: 'Oculta' },
                { category_id: 9, category_name: 'XXX Adultos' },
            ],
        });
        const base = { sp: 'Soccer', lg: '', lb: '', ev: '', hb: '', ab: '', hs: null, as: null, ts: '', v: '', st: '', th: '', pp: false };
        const map = await service.matchEvents([
            { ...base, id: 'a', h: 'Boca', a: 'River', tv: [{ n: 'ESPN 2', c: 'México' }, { n: 'TUDN', c: '' }] },
            { ...base, id: 'b', h: 'Lyon', a: 'Lens', tv: [] },
            // without the agenda's channels: where its home team is usually broadcast (a guess, not for the Home row)
            { ...base, id: 'c', h: 'Toluca', a: 'León', tvh: [{ n: 'ESPN 2', c: 'Honduras' }] },
            { ...base, id: 'd', h: 'Boca', a: 'Racing', tv: [{ n: 'TUDN', c: '' }], tvh: [{ n: 'ESPN 2', c: '' }] },
        ]);
        expect(map?.byEvent['c'].best).toMatchObject({ streamId: '2' });
        expect(map?.byEvent['c'].guess).toBe(true);
        expect(map?.byEvent['c'].tv[0]).toMatchObject({ n: 'ESPN 2', usual: true });
        expect(map?.byEvent['a'].guess).toBeUndefined();
        // the agenda knows its channels: the usual ones are ignored
        expect(map?.byEvent['d'].best).toBeNull();
        expect(map?.byEvent['a'].best).toMatchObject({ streamId: '2', playlistId: 'pl' });
        // TUDN only exists in a category the client hid: "buscar evento"
        expect(map?.byEvent['a'].tv[1].ch).toBeNull();
        expect(map?.byEvent['b'].best).toBeNull();
        expect(map?.folder).toMatchObject({ streamId: '3', partial: true });
        // channel search (webOS): only visible channels
        expect((await service.searchChannels('espn')).map((c) => c.streamId)).toEqual(['2']);
    });
});
