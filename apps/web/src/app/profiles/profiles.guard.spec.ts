import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { KidsFilterService, ProfilesService } from '@iptvnator/services';
import { profilesGateGuard } from './profiles.guard';

describe('profilesGateGuard', () => {
    const needed = signal(false);
    const profile = signal<{ id: string } | null>(null);
    const kids = signal(false);
    const allows = jest.fn(() => true);

    beforeEach(() => {
        needed.set(false);
        profile.set(null);
        kids.set(false);
        allows.mockReturnValue(true);
        TestBed.configureTestingModule({
            providers: [
                provideRouter([]),
                { provide: ProfilesService, useValue: { ensure: async () => undefined, needed, profile, kids } },
                { provide: KidsFilterService, useValue: { allows } },
            ],
        });
    });

    function run(url: string): Promise<boolean | UrlTree> {
        return TestBed.runInInjectionContext(
            () => profilesGateGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot) as Promise<boolean | UrlTree>
        );
    }

    const path = (r: boolean | UrlTree) => (r === true ? true : TestBed.inject(Router).serializeUrl(r as UrlTree));

    it('changes nothing when the line does not choose a profile', async () => {
        expect(await run('/workspace/sports')).toBe(true);
    });

    it('asks who is watching first, then comes back', async () => {
        needed.set(true);
        expect(path(await run('/workspace/xtreams/1/home'))).toBe('/profiles?next=%2Fworkspace%2Fxtreams%2F1%2Fhome');
        profile.set({ id: 'main' });
        expect(await run('/workspace/xtreams/1/home')).toBe(true);
    });

    it('keeps the kids profile out of sports, search, downloads, old category grids and titles it does not allow', async () => {
        needed.set(true);
        profile.set({ id: 'p2' });
        kids.set(true);
        for (const url of ['/workspace/sports', '/workspace/search?q=x', '/workspace/xtreams/1/search', '/workspace/xtreams/1/vod/12', '/workspace/downloads']) {
            expect(path(await run(url))).toBe('/workspace');
        }
        expect(await run('/workspace/xtreams/1/home')).toBe(true);
        expect(await run('/workspace/xtreams/1/vod')).toBe(true);
        expect(await run('/workspace/xtreams/1/series/4/77')).toBe(true);
        expect(allows).toHaveBeenLastCalledWith('series', '77');
        allows.mockReturnValue(false);
        expect(path(await run('/workspace/xtreams/1/vod/4/88'))).toBe('/workspace');
    });
});
