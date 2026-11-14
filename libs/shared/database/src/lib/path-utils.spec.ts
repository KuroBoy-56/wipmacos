const homedirMock = jest.fn<string, []>();

jest.mock('os', () => ({
    ...jest.requireActual('os'),
    homedir: () => homedirMock(),
}));

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    IPTVNATOR_E2E_DATA_DIR_ENV,
    getElectronConfigDirectory,
    getElectronUserDataPath,
    getIptvnatorDataRoot,
    getIptvnatorDatabaseDirectory,
    getIptvnatorDatabasePath,
    resolveDefaultDataRoot,
} from './path-utils';

describe('path-utils', () => {
    let tempRoot: string;
    let originalEnvValue: string | undefined;

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'iptvnator-path-utils-'));
        homedirMock.mockReturnValue(join(tempRoot, 'home'));
        originalEnvValue = process.env[IPTVNATOR_E2E_DATA_DIR_ENV];
        delete process.env[IPTVNATOR_E2E_DATA_DIR_ENV];
    });

    afterEach(() => {
        if (originalEnvValue === undefined) {
            delete process.env[IPTVNATOR_E2E_DATA_DIR_ENV];
        } else {
            process.env[IPTVNATOR_E2E_DATA_DIR_ENV] = originalEnvValue;
        }
        rmSync(tempRoot, { force: true, recursive: true });
    });

    it('uses and creates the E2E data dir override when the env variable is set', () => {
        const e2eDataDir = join(tempRoot, 'e2e-data');
        process.env[IPTVNATOR_E2E_DATA_DIR_ENV] = e2eDataDir;

        expect(getIptvnatorDataRoot()).toBe(e2eDataDir);
        expect(existsSync(e2eDataDir)).toBe(true);
    });

    it('falls back to an existing ~/.iptvnator when the env override is blank', () => {
        process.env[IPTVNATOR_E2E_DATA_DIR_ENV] = '   ';

        const expectedRoot = join(tempRoot, 'home', '.iptvnator');
        // Linux only keeps ~/.iptvnator when it already exists (see resolveDefaultDataRoot)
        mkdirSync(expectedRoot, { recursive: true });

        expect(getIptvnatorDataRoot()).toBe(expectedRoot);
        expect(existsSync(expectedRoot)).toBe(true);
    });

    it('places the databases directory and database file under the data root', () => {
        const e2eDataDir = join(tempRoot, 'e2e-data');
        process.env[IPTVNATOR_E2E_DATA_DIR_ENV] = e2eDataDir;

        const databaseDirectory = getIptvnatorDatabaseDirectory();

        expect(databaseDirectory).toBe(join(e2eDataDir, 'databases'));
        expect(existsSync(databaseDirectory)).toBe(true);
        expect(getIptvnatorDatabasePath()).toBe(
            join(e2eDataDir, 'databases', 'iptvnator.db')
        );
    });

    it('returns null Electron user-data and config paths outside E2E runs', () => {
        expect(getElectronUserDataPath()).toBeNull();
        expect(getElectronConfigDirectory()).toBeNull();
    });

    it('creates Electron user-data and config directories under the E2E root', () => {
        const e2eDataDir = join(tempRoot, 'e2e-data');
        process.env[IPTVNATOR_E2E_DATA_DIR_ENV] = e2eDataDir;

        const userDataPath = getElectronUserDataPath();
        const configDirectory = getElectronConfigDirectory();

        expect(userDataPath).toBe(join(e2eDataDir, 'user-data'));
        expect(configDirectory).toBe(join(e2eDataDir, 'config'));
        expect(existsSync(userDataPath as string)).toBe(true);
        expect(existsSync(configDirectory as string)).toBe(true);
    });

    describe('resolveDefaultDataRoot', () => {
        const home = '/home/ana';
        const none = () => false;

        it('keeps ~/.iptvnator on Windows and macOS whatever the environment', () => {
            const env = { XDG_DATA_HOME: '/x', FLATPAK_ID: 'a.b.C' };
            expect(resolveDefaultDataRoot({ platform: 'win32', env, home, exists: none })).toBe(join(home, '.iptvnator'));
            expect(resolveDefaultDataRoot({ platform: 'darwin', env, home, exists: none })).toBe(join(home, '.iptvnator'));
        });

        it('uses the unversioned snap folder inside a Snap', () => {
            const env = { SNAP_USER_COMMON: '/home/ana/snap/mpx-player/common', XDG_DATA_HOME: '/ignored' };
            expect(resolveDefaultDataRoot({ platform: 'linux', env, home, exists: () => true })).toBe(
                join('/home/ana/snap/mpx-player/common', 'iptvnator')
            );
        });

        it('uses the sandbox data folder inside a Flatpak, never the real home', () => {
            const exists = () => true; // even with an old ~/.iptvnator, the sandbox cannot write there
            expect(
                resolveDefaultDataRoot({
                    platform: 'linux',
                    env: { FLATPAK_ID: 'com.latmpx.MPXPlayer', XDG_DATA_HOME: '/home/ana/.var/app/com.latmpx.MPXPlayer/data' },
                    home,
                    exists,
                })
            ).toBe(join('/home/ana/.var/app/com.latmpx.MPXPlayer/data', 'iptvnator'));
            expect(
                resolveDefaultDataRoot({ platform: 'linux', env: { FLATPAK_ID: 'com.latmpx.MPXPlayer' }, home, exists })
            ).toBe(join('/home/ana/.var/app/com.latmpx.MPXPlayer/data', 'iptvnator'));
        });

        it('keeps an existing ~/.iptvnator for native Linux packages, else follows XDG', () => {
            const legacy = join(home, '.iptvnator');
            expect(resolveDefaultDataRoot({ platform: 'linux', env: {}, home, exists: (p) => p === legacy })).toBe(legacy);
            expect(resolveDefaultDataRoot({ platform: 'linux', env: { XDG_DATA_HOME: '/data' }, home, exists: none })).toBe(
                join('/data', 'iptvnator')
            );
            expect(resolveDefaultDataRoot({ platform: 'linux', env: {}, home, exists: none })).toBe(
                join(home, '.local', 'share', 'iptvnator')
            );
        });

        it('ignores relative XDG_DATA_HOME and SNAP_USER_COMMON values', () => {
            const env = { XDG_DATA_HOME: 'relative/data', SNAP_USER_COMMON: 'relative' };
            expect(resolveDefaultDataRoot({ platform: 'linux', env, home, exists: none })).toBe(
                join(home, '.local', 'share', 'iptvnator')
            );
        });
    });
});
