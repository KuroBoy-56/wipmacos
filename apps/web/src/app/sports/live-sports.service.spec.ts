import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PanelBrandingService, PanelSyncService, ProfilesService } from '@iptvnator/services';
import { LiveSportsService } from './live-sports.service';
import { SportsDataService } from './sports-data.service';

describe('LiveSportsService (fila «En vivo ahora»)', () => {
    function setup(opts: { needed: boolean; kids?: boolean; sports?: boolean; enabled?: boolean; cloud?: unknown }) {
        const profile = signal<{ id: string } | null>({ id: 'p1' });
        const fetchSportsLive = jest.fn().mockResolvedValue({ enabled: opts.enabled ?? true, ttl: 30, events: [], chan: 'all' });
        const alertsRequest = jest.fn().mockResolvedValue(opts.cloud ?? null);
        TestBed.configureTestingModule({
            providers: [
                { provide: PanelSyncService, useValue: { fetchSportsLive, alertsRequest } },
                { provide: SportsDataService, useValue: { matchEvents: jest.fn().mockResolvedValue(null) } },
                {
                    provide: ProfilesService,
                    useValue: { needed: signal(opts.needed), profile, kids: computed(() => !!opts.kids) },
                },
                { provide: PanelBrandingService, useValue: { features: signal({ sports: opts.sports ?? true }), platforms: signal(true) } },
            ],
        });
        return { svc: TestBed.inject(LiveSportsService), fetchSportsLive, alertsRequest, profile };
    }

    beforeEach(() => localStorage.clear());

    it('without profiles it never asks the panel and the platforms stay', async () => {
        const { svc, fetchSportsLive } = setup({ needed: false });
        const detach = svc.attach();
        await Promise.resolve();
        expect(fetchSportsLive).not.toHaveBeenCalled();
        expect(svc.enabled()).toBe(false);
        detach();
    });

    it('a kids profile or Deportes off: no row either', async () => {
        expect(setup({ needed: true, kids: true }).svc.gated()).toBe(false);
        TestBed.resetTestingModule();
        expect(setup({ needed: true, sports: false }).svc.gated()).toBe(false);
    });

    it('with profiles and a paid key in the panel the row replaces the platforms; free key = no row', async () => {
        const { svc, fetchSportsLive } = setup({ needed: true });
        const detach = svc.attach();
        await new Promise((r) => setTimeout(r));
        expect(fetchSportsLive).toHaveBeenCalledTimes(1);
        expect(svc.enabled()).toBe(true);
        detach();
        TestBed.resetTestingModule();
        const free = setup({ needed: true, enabled: false });
        await free.svc.ensure();
        expect(free.svc.enabled()).toBe(false);
    });

    it('keeps the favourite sport per profile', () => {
        const { svc, profile } = setup({ needed: true });
        svc.setPref('Basketball');
        expect(svc.pref()).toBe('Basketball');
        profile.set({ id: 'p2' });
        expect(svc.pref()).toBe('');
        profile.set({ id: 'p1' });
        expect(svc.pref()).toBe('Basketball');
        svc.setPref('');
        expect(svc.pref()).toBe('');
    });

    it('takes the favourite sport and leagues chosen on the TV or the phone (cloud «prefs»)', async () => {
        const { svc } = setup({
            needed: true,
            cloud: { success: true, enabled: true, prefs: { sp: 'Soccer', spn: 'Fútbol', lg: [{ id: '4335', n: 'La Liga', sp: 'Soccer' }], at: 1700000000 } },
        });
        await svc.pullPrefs(true);
        expect(svc.pref()).toBe('Soccer');
        expect(svc.leagues().map((l) => l.id)).toEqual(['4335']);
    });

    it('uploads what this computer had when the cloud never saved it, and every change made here', async () => {
        jest.useFakeTimers();
        try {
            const { svc, alertsRequest } = setup({ needed: true, cloud: { success: true, enabled: true, prefs: { sp: '', lg: [], at: 0 } } });
            svc.setPref('Basketball', 'Baloncesto');
            jest.advanceTimersByTime(800);
            await Promise.resolve();
            await Promise.resolve();
            expect(alertsRequest).toHaveBeenCalledWith('set_prefs', { prefs: { sp: 'Basketball', spn: 'Baloncesto', lg: [] } });
            alertsRequest.mockClear();
            await svc.pullPrefs(true);
            jest.advanceTimersByTime(800);
            await Promise.resolve();
            await Promise.resolve();
            expect(alertsRequest).toHaveBeenCalledWith('set_prefs', { prefs: { sp: 'Basketball', spn: 'Baloncesto', lg: [] } });
            expect(svc.pref()).toBe('Basketball');
        } finally {
            jest.useRealTimers();
        }
    });

    it('platforms never flash in: hidden until the panel answers, back only without live matches or with the setting', async () => {
        const first = setup({ needed: true, enabled: false });
        expect(first.svc.hidesPlatforms()).toBe(true);
        const detach = first.svc.attach();
        await new Promise((r) => setTimeout(r));
        expect(first.svc.hidesPlatforms()).toBe(false);
        detach();
        TestBed.resetTestingModule();
        // next start, before the answer: what the panel said last time for this line
        const next = setup({ needed: true });
        expect(next.svc.hidesPlatforms()).toBe(false);
        await next.svc.ensure();
        expect(next.svc.hidesPlatforms()).toBe(true);
        next.svc.setPlatformCards(true);
        expect(next.svc.hidesPlatforms()).toBe(false);
    });
});
