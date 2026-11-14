import { pathWithBundledMpv } from './bundled-mpv-path';

describe('pathWithBundledMpv', () => {
    const resources = '/tmp/.mount_mpx/resources';
    const bundled = '/tmp/.mount_mpx/resources/bin/mpv';
    const has = (paths: string[]) => (p: string) => paths.includes(p);

    it('puts the bundled mpv folder first when the package ships it', () => {
        expect(pathWithBundledMpv('/usr/bin:/bin', resources, has([`${bundled}/mpv`]))).toBe(`${bundled}:/usr/bin:/bin`);
    });

    it('does not duplicate it when applied again (after fix-path)', () => {
        expect(pathWithBundledMpv(`/usr/bin:${bundled}:/bin`, resources, has([`${bundled}/mpv`]))).toBe(
            `${bundled}:/usr/bin:/bin`
        );
    });

    it('leaves PATH alone without a bundled mpv (Snap, Flatpak, development)', () => {
        expect(pathWithBundledMpv('/usr/bin:/bin', resources, has([]))).toBe('/usr/bin:/bin');
        expect(pathWithBundledMpv('/usr/bin:/bin', undefined, has([`${bundled}/mpv`]))).toBe('/usr/bin:/bin');
    });
});
