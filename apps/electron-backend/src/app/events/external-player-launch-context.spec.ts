import {
    getDefaultMpvPath,
    getDefaultVlcPath,
    resolveExternalPlayerLaunchContext,
} from './external-player-launch-context';

function createPathExists(existingPaths: string[]) {
    return (candidatePath: string) => existingPaths.includes(candidatePath);
}

describe('external player launch context in the Linux store packages', () => {
    it('runs the mpv bundled in the Flatpak inside the sandbox, without flatpak-spawn', () => {
        const options = {
            platform: 'linux' as const,
            isFlatpak: true,
            pathExists: createPathExists(['/app/bin/mpv']),
        };

        expect(getDefaultMpvPath(options)).toBe('/app/bin/mpv');
        expect(resolveExternalPlayerLaunchContext('mpv', undefined, options)).toEqual({
            mode: 'direct',
            playerPath: '/app/bin/mpv',
            command: '/app/bin/mpv',
            argsPrefix: [],
        });
        // mpv-session.service passes the resolved default path as the player path
        expect(resolveExternalPlayerLaunchContext('mpv', '/app/bin/mpv', options).mode).toBe('direct');
        // VLC is not bundled in the Flatpak: it still goes to the host
        expect(resolveExternalPlayerLaunchContext('vlc', undefined, options).mode).toBe('flatpak-host');
        // a Flatpak without the bundled mpv keeps the old host launch
        expect(
            resolveExternalPlayerLaunchContext('mpv', undefined, { ...options, pathExists: createPathExists([]) }).mode
        ).toBe('flatpak-host');
    });

    it('uses only the players bundled in a strict Snap (other snaps cannot be executed)', () => {
        const options = {
            platform: 'linux' as const,
            isFlatpak: false,
            env: { SNAP: '/snap/mpx-player/12' },
            pathExists: createPathExists(['/snap/mpx-player/12/usr/bin/mpv', '/snap/bin/mpv', '/snap/bin/vlc']),
        };

        expect(getDefaultMpvPath(options)).toBe('/snap/mpx-player/12/usr/bin/mpv');
        expect(resolveExternalPlayerLaunchContext('mpv', undefined, options).playerPath).toBe(
            '/snap/mpx-player/12/usr/bin/mpv'
        );
        // VLC is not bundled: the bare name fails with a clear "not found" instead of an AppArmor denial
        expect(getDefaultVlcPath(options)).toBe('vlc');
        // outside a Snap the usual system paths stay
        expect(getDefaultMpvPath({ ...options, env: {} })).toBe('/snap/bin/mpv');
    });
});
