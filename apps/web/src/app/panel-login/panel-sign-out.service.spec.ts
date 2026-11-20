import { TestBed } from '@angular/core/testing';
import { ProfilesService } from '@iptvnator/services';
import { AuthService } from '../auth.service';
import { PanelSessionGuardService } from './panel-session-guard.service';
import { PanelSessionService } from './panel-session.service';
import { PanelSignOutService } from './panel-sign-out.service';

describe('PanelSignOutService', () => {
    const clear = jest.fn().mockResolvedValue(undefined);
    const logout = jest.fn();
    const stop = jest.fn();
    const forget = jest.fn();
    let service: PanelSignOutService;

    beforeEach(() => {
        jest.clearAllMocks();
        TestBed.configureTestingModule({
            providers: [
                { provide: PanelSessionService, useValue: { clear } },
                { provide: AuthService, useValue: { logout } },
                { provide: PanelSessionGuardService, useValue: { stop } },
                { provide: ProfilesService, useValue: { forget } },
            ],
        });
        service = TestBed.inject(PanelSignOutService);
    });

    it('closes the session and remembers it was by hand until the next sign in', async () => {
        expect(service.signedOut).toBe(false);
        await service.signOut();
        expect(stop).toHaveBeenCalled();
        expect(forget).toHaveBeenCalled();
        expect(clear).toHaveBeenCalled();
        expect(logout).toHaveBeenCalled();
        expect(service.signedOut).toBe(true);
        service.signedIn();
        expect(service.signedOut).toBe(false);
    });
});
