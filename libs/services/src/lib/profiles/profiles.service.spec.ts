import { TestBed } from '@angular/core/testing';
import { setSessionDemo } from '@iptvnator/shared/interfaces';
import { panelProfile, reportPanelProfileGone } from '../panel-sync/panel-profile';
import { PanelSyncService } from '../panel-sync/panel-sync.service';
import { PROFILES_WAIT_MS, ProfilesService, rememberLineMax } from './profiles.service';
import { parseProfiles } from './profiles.types';

const ON = {
    success: true,
    enabled: true,
    max: 3,
    canCreate: true,
    avatars: ['a.png'],
    profiles: [
        { id: 'main', name: 'Ana', avatar: 'a.png', locked: false },
        { id: 'p2', name: 'Niños', avatar: 'b.png', locked: false, kids: true },
    ],
};

describe('parseProfiles', () => {
    it('reads the panel answer and marks the main profile', () => {
        const d = parseProfiles(ON);
        expect(d?.enabled).toBe(true);
        expect(d?.max).toBe(3);
        expect(d?.profiles.map((p) => [p.id, p.main, p.kids])).toEqual([
            ['main', true, false],
            ['p2', false, true],
        ]);
    });

    it('turns profiles off when the owner did not enable them, and rejects errors', () => {
        expect(parseProfiles({ success: true, enabled: false })).toEqual(expect.objectContaining({ enabled: false, max: 1, profiles: [] }));
        expect(parseProfiles({ success: false, code: 'x' })).toBeNull();
        expect(parseProfiles(null)).toBeNull();
    });
});

describe('ProfilesService', () => {
    let answer: unknown;
    let requests: { action: string | null; fields: Record<string, unknown> }[];

    function service(): ProfilesService {
        TestBed.configureTestingModule({
            providers: [
                {
                    provide: PanelSyncService,
                    useValue: {
                        profilesRequest: async (action: string | null, fields: Record<string, unknown>) => {
                            requests.push({ action, fields });
                            return answer;
                        },
                    },
                },
            ],
        });
        return TestBed.inject(ProfilesService);
    }

    beforeEach(() => {
        TestBed.resetTestingModule();
        localStorage.clear();
        localStorage.setItem('session_user', 'line1');
        localStorage.setItem('session_server', 'http://dns.test:8080');
        answer = ON;
        requests = [];
    });

    afterEach(() => {
        setSessionDemo(false);
        jest.useRealTimers();
    });

    it('asks for a profile only with profiles on and more than one connection', async () => {
        const s = service();
        await s.ensure();
        expect(s.needed()).toBe(true);
        expect(localStorage.getItem('pf_on|line1@dns.test:8080')).toBe('1');
    });

    it('changes nothing with profiles off, a single connection or a demo line', async () => {
        answer = { ...ON, max: 1 };
        const one = service();
        await one.ensure();
        expect(one.needed()).toBe(false);

        TestBed.resetTestingModule();
        answer = { success: true, enabled: false };
        const off = service();
        await off.ensure();
        expect(off.needed()).toBe(false);
        expect(localStorage.getItem('pf_on|line1@dns.test:8080')).toBe('0');

        TestBed.resetTestingModule();
        answer = ON;
        setSessionDemo(true);
        const demo = service();
        await demo.ensure();
        expect(demo.needed()).toBe(false);
    });

    it('does not wait, nor switch mid-session, when profiles were off last time', async () => {
        localStorage.setItem('pf_on|line1@dns.test:8080', '0');
        const s = service();
        await s.ensure();
        expect(s.needed()).toBe(false);
        await Promise.resolve();
        await Promise.resolve();
        // the owner turned them on: they show up on the next start, not now
        expect(s.needed()).toBe(false);
        expect(localStorage.getItem('pf_on|line1@dns.test:8080')).toBe('1');
    });

    it('enters with the main profile when the panel does not answer in time', async () => {
        jest.useFakeTimers();
        const s = service();
        TestBed.inject(PanelSyncService).profilesRequest = () => new Promise(() => undefined);
        const done = s.ensure();
        jest.advanceTimersByTime(PROFILES_WAIT_MS);
        await done;
        expect(s.needed()).toBe(false);
    });

    it('sends the chosen profile to progress.php and forgets it on 410 profile_gone', async () => {
        const s = service();
        await s.ensure();
        const kids = s.data()?.profiles[1];
        if (!kids) throw new Error('no profile');
        s.choose(kids);
        expect(panelProfile()).toBe('p2');
        expect(s.kids()).toBe(true);
        expect(localStorage.getItem('pf_last|line1@dns.test:8080')).toBe('p2');

        reportPanelProfileGone('p2');
        expect(s.profile()).toBeNull();
        expect(panelProfile()).toBe('');
        expect(s.gone()).toBe(1);
    });

    it('sends the line connections the app knows as the fallback max', async () => {
        rememberLineMax({ username: 'line1', server: 'https://dns.test:8080/' }, 8);
        const s = service();
        await s.ensure();
        expect(requests[0]).toEqual({ action: null, fields: { max: '5' } });
    });
});
