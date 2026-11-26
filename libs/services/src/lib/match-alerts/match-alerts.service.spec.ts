import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { PanelSyncService } from '../panel-sync/panel-sync.service';
import { ProfilesService } from '../profiles/profiles.service';
import { MatchAlertsService } from './match-alerts.service';

describe('MatchAlertsService (avisos de partidos)', () => {
    const MIN = 60_000;
    let notes: { title: string; body?: string }[];
    function setup(focus: boolean, events: object[] = []) {
        localStorage.clear();
        localStorage.setItem('session_user', 'juan');
        localStorage.setItem('session_server', 'http://srv.example');
        notes = [];
        (globalThis as unknown as { Notification: unknown }).Notification = Object.assign(
            function (this: unknown, title: string, o?: { body?: string }) { notes.push({ title, body: o?.body }); },
            { permission: 'granted', requestPermission: jest.fn() }
        );
        jest.spyOn(document, 'hasFocus').mockReturnValue(focus);
        TestBed.configureTestingModule({
            providers: [
                { provide: PanelSyncService, useValue: { fetchSportsFixtures: jest.fn().mockResolvedValue({ on: true, partial: false, leagues: {}, events }) } },
                { provide: ProfilesService, useValue: { profile: signal({ id: 'p1' }), kids: signal(false) } },
                { provide: TranslateService, useValue: { instant: (k: string) => k } },
            ],
        });
        return TestBed.inject(MatchAlertsService);
    }
    afterEach(() => TestBed.resetTestingModule());

    it('a favourite team warns 30 min, 10 min and at kick-off, once each', async () => {
        const s0 = Date.now() + 60 * MIN;
        const svc = setup(false, [
            { id: '1', h: 'Real Madrid', a: 'Barcelona', ts: '', s: s0 / 1000 },
            { id: '2', h: 'Sevilla', a: 'Betis', ts: '', s: s0 / 1000 },
        ]);
        svc.setTeams([{ n: 'Real Madrid', l: '', b: '', lg: '4335', sp: 'Soccer' }]);
        await svc.tick(s0 - 31 * MIN);
        expect(notes).toHaveLength(0);
        await svc.tick(s0 - 30 * MIN);
        await svc.tick(s0 - 29 * MIN); // no se repite
        await svc.tick(s0 - 10 * MIN);
        await svc.tick(s0 + MIN);
        expect(notes.map((n) => n.body)).toEqual(['MPX.ALERTS.M30', 'MPX.ALERTS.M10', 'MPX.ALERTS.LIVE']);
        expect(notes[0].title).toBe('Real Madrid vs Barcelona');
        expect(svc.bell()).toHaveLength(3);
        expect(svc.unread()).toBe(3);
        svc.markRead();
        expect(svc.unread()).toBe(0);
    });

    it('with the app in front only the bell, and a late start (app was closed) is not warned', async () => {
        const s0 = Date.now() + 60 * MIN;
        const svc = setup(true);
        expect(svc.toggle({ id: '9', h: 'Boca', a: 'River', s: s0 / 1000 })).toBe(true);
        expect(svc.isMarked('9')).toBe(true);
        await svc.tick(s0 - 30 * MIN);
        expect(notes).toHaveLength(0);
        expect(svc.bell()[0].t).toBe('Boca vs River');
        await svc.tick(s0 + 20 * MIN); // la app estaba cerrada a la hora del partido
        expect(svc.bell()).toHaveLength(1);
        svc.toggle({ id: '9' });
        expect(svc.isMarked('9')).toBe(false);
    });
});
