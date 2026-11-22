import { of } from 'rxjs';
import { Settings, STORE_KEY, VideoPlayer } from '@iptvnator/shared/interfaces';
import {
    defaultVideoPlayer,
    migrateDefaultPlayer,
    PLAYER_MPV_MIGRATED_KEY,
} from './default-player';

type ElectronWindow = { electron?: Record<string, unknown> };

/** null = PWA; otherwise the desktop app on that platform (embedded = MPV integrado works there). */
function setDesktop(platform: string | null, embedded = true): void {
    if (platform === null) {
        delete (window as unknown as ElectronWindow).electron;
        return;
    }
    (window as unknown as ElectronWindow).electron = {
        platform,
        prepareEmbeddedMpv: jest.fn(async () => ({ supported: embedded })),
    };
}

/** SettingsStore built with the platform already set (DEFAULT_SETTINGS is read when the module loads). */
function desktopStore(stored: Partial<Settings> | null) {
    let store!: {
        loadSettings(): Promise<void>;
        player(): VideoPlayer;
        checkEmbeddedDefault(): Promise<void>;
    };
    const storage = {
        get: jest.fn(() => of(stored)),
        set: jest.fn(() => of(undefined)),
    };
    jest.isolateModules(() => {
        // the same Angular copy as the store loaded here
        const { Injector } = require('@angular/core');
        const { StorageMap } = require('@ngx-pwa/local-storage');
        const { SettingsStore } = require('./settings-store.service');
        const { RuntimeCapabilitiesService } = require('./runtime-capabilities.service');
        const injector = Injector.create({
            providers: [
                SettingsStore,
                RuntimeCapabilitiesService,
                { provide: StorageMap, useValue: storage },
            ],
        });
        store = injector.get(SettingsStore);
    });
    return { store, storage };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('MPV as the default player (desktop app)', () => {
    beforeEach(() => {
        localStorage.removeItem(PLAYER_MPV_MIGRATED_KEY);
        localStorage.setItem('mpx:language-auto-v1', '1');
    });
    afterEach(() => setDesktop(null));

    it('Windows and Linux: MPV; macOS: MPV integrado; PWA: Video.js', () => {
        setDesktop('win32');
        expect(defaultVideoPlayer()).toBe(VideoPlayer.MPV);
        setDesktop('linux');
        expect(defaultVideoPlayer()).toBe(VideoPlayer.MPV);
        setDesktop('darwin');
        expect(defaultVideoPlayer()).toBe(VideoPlayer.EmbeddedMpv);
        setDesktop(null);
        expect(defaultVideoPlayer()).toBe(VideoPlayer.VideoJs);
    });

    it('moves the old Video.js default to MPV only once', () => {
        setDesktop('win32');
        expect(migrateDefaultPlayer(VideoPlayer.VideoJs)).toBe(VideoPlayer.MPV);
        expect(migrateDefaultPlayer(VideoPlayer.VLC)).toBe(VideoPlayer.VLC);
        localStorage.setItem(PLAYER_MPV_MIGRATED_KEY, '1');
        expect(migrateDefaultPlayer(VideoPlayer.VideoJs)).toBe(VideoPlayer.VideoJs);
    });

    it('never changes the PWA player', () => {
        setDesktop(null);
        expect(migrateDefaultPlayer(VideoPlayer.VideoJs)).toBe(VideoPlayer.VideoJs);
    });

    it('first start on Windows: MPV', async () => {
        setDesktop('win32');
        const { store } = desktopStore(null);
        await store.loadSettings();
        expect(store.player()).toBe(VideoPlayer.MPV);
        expect(localStorage.getItem(PLAYER_MPV_MIGRATED_KEY)).toBe('1');
    });

    it('saved settings with the old Video.js default: MPV, saved once', async () => {
        setDesktop('linux');
        const { store, storage } = desktopStore({ player: VideoPlayer.VideoJs } as Partial<Settings>);
        await store.loadSettings();
        expect(store.player()).toBe(VideoPlayer.MPV);
        expect(storage.set).toHaveBeenCalledWith(
            STORE_KEY.Settings,
            expect.objectContaining({ player: VideoPlayer.MPV })
        );
    });

    it('a player chosen after the switch is kept (Video.js too)', async () => {
        setDesktop('win32');
        localStorage.setItem(PLAYER_MPV_MIGRATED_KEY, '1');
        const { store, storage } = desktopStore({ player: VideoPlayer.VideoJs } as Partial<Settings>);
        await store.loadSettings();
        expect(store.player()).toBe(VideoPlayer.VideoJs);
        expect(storage.set).not.toHaveBeenCalled();
    });

    it('keeps MPV integrado chosen before', async () => {
        setDesktop('win32');
        const { store } = desktopStore({ player: VideoPlayer.EmbeddedMpv } as Partial<Settings>);
        await store.loadSettings();
        expect(store.player()).toBe(VideoPlayer.EmbeddedMpv);
    });

    it('first start on a Mac: MPV integrado when it works there', async () => {
        setDesktop('darwin', true);
        const { store } = desktopStore(null);
        await store.loadSettings();
        await flush();
        expect(store.player()).toBe(VideoPlayer.EmbeddedMpv);
    });

    it('a Mac where MPV integrado does not work: the built-in player, saved', async () => {
        setDesktop('darwin', false);
        const { store, storage } = desktopStore({ player: VideoPlayer.VideoJs } as Partial<Settings>);
        await store.loadSettings();
        await flush();
        expect(store.player()).toBe(VideoPlayer.VideoJs);
        expect(storage.set).toHaveBeenLastCalledWith(
            STORE_KEY.Settings,
            expect.objectContaining({ player: VideoPlayer.VideoJs })
        );
    });

    it('MPV integrado chosen by hand on a Mac is never changed by the check', async () => {
        setDesktop('darwin', false);
        localStorage.setItem(PLAYER_MPV_MIGRATED_KEY, '1');
        const { store, storage } = desktopStore({ player: VideoPlayer.EmbeddedMpv } as Partial<Settings>);
        await store.loadSettings();
        await flush();
        expect(store.player()).toBe(VideoPlayer.EmbeddedMpv);
        expect(storage.set).not.toHaveBeenCalled();
    });
});
