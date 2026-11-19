import { PROF_HERE } from './prof-here';

describe('PROF_HERE (avatar on the left of the bar with profiles)', () => {
    it('is on Inicio, Películas, Series and their category lists', () => {
        for (const url of ['/workspace/xtreams/pl1/home', '/workspace/xtreams/pl1/vod', '/workspace/xtreams/pl1/series?x=1', '/workspace/xtreams/pl1/vod/12']) {
            expect(PROF_HERE.test(url)).toBe(true);
        }
    });

    it('is not on a detail page, live TV, sports or explore', () => {
        for (const url of ['/workspace/xtreams/pl1/series/4/77', '/workspace/xtreams/pl1/live', '/workspace/sports', '/workspace/xtreams/pl1/explore?platform=x']) {
            expect(PROF_HERE.test(url)).toBe(false);
        }
    });
});
