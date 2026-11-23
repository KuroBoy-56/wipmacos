import { panelLineId, panelSourceRedirect } from './panel-source.guard';

describe('panel source guard (the panel line is the only source)', () => {
    const line = 'b7c1-line';

    it('opens every page of the line the panel gave this device', () => {
        expect(
            panelSourceRedirect(`/workspace/xtreams/${line}`, line)
        ).toBeNull();
        expect(
            panelSourceRedirect(`/workspace/xtreams/${line}/home`, line)
        ).toBeNull();
        expect(
            panelSourceRedirect(`/workspace/xtreams/${line}/vod/12?x=1`, line)
        ).toBeNull();
        expect(
            panelSourceRedirect(`/workspace/xtreams/${line}/live#top`, line)
        ).toBeNull();
    });

    it('sends an Xtream line from another provider back to the panel line', () => {
        expect(
            panelSourceRedirect('/workspace/xtreams/other-line/home', line)
        ).toBe(`/workspace/xtreams/${line}/home`);
    });

    it('never opens an M3U playlist or a Stalker portal', () => {
        expect(panelSourceRedirect('/workspace/playlists/m3u-1', line)).toBe(
            `/workspace/xtreams/${line}/home`
        );
        expect(
            panelSourceRedirect('/workspace/playlists/m3u-1/favorites', line)
        ).toBe(`/workspace/xtreams/${line}/home`);
        expect(
            panelSourceRedirect('/workspace/stalker/portal-1/itv', line)
        ).toBe(`/workspace/xtreams/${line}/home`);
        // not even with the panel line's id
        expect(panelSourceRedirect(`/workspace/playlists/${line}`, line)).toBe(
            `/workspace/xtreams/${line}/home`
        );
    });

    it('without a panel line no source opens: back to the login', () => {
        expect(panelSourceRedirect('/workspace/xtreams/any/home', '')).toBe(
            '/login'
        );
        expect(panelSourceRedirect('/workspace/playlists/m3u-1', '')).toBe(
            '/login'
        );
    });

    it('leaves the pages that are not a source alone', () => {
        for (const url of [
            '/workspace',
            '/workspace/sports',
            '/workspace/settings',
            '/workspace/sources',
            '/workspace/global-favorites',
            '/workspace/search?q=x',
            '/workspace/downloads',
        ]) {
            expect(panelSourceRedirect(url, line)).toBeNull();
        }
    });

    it('reads the line id from the panel session token only', () => {
        localStorage.setItem('session_token', `panel-${line}`);
        expect(panelLineId()).toBe(line);
        localStorage.setItem('session_token', 'something-else');
        expect(panelLineId()).toBe('');
        localStorage.removeItem('session_token');
        expect(panelLineId()).toBe('');
    });
});
