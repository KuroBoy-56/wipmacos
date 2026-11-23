import { TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { PlaylistActions } from '@iptvnator/m3u-state';
import {
    PanelSyncService,
    ParentalControlService,
    PlaylistDeleteActionService,
} from '@iptvnator/services';
import { PlaylistMeta } from '@iptvnator/shared/interfaces';
import { PanelSessionService } from './panel-session.service';

describe('PanelSessionService (the panel line is the only source)', () => {
    const line = {
        _id: 'panel-line',
        title: 'MPX Player',
        username: 'user1',
        password: 'pass1',
        serverUrl: 'http://line.example.com:8080',
        importDate: '2026-11-01T00:00:00.000Z',
    } as unknown as PlaylistMeta;
    const otherXtream = {
        _id: 'other-xtream',
        title: 'Otro proveedor',
        username: 'x',
        password: 'y',
        serverUrl: 'http://other.example.com',
    } as unknown as PlaylistMeta;
    const m3u = { _id: 'm3u-file', title: 'lista.m3u', count: 120 } as unknown as PlaylistMeta;
    const stalker = {
        _id: 'stalker-portal',
        title: 'Portal',
        macAddress: '00:1A:79:00:00:01',
        portalUrl: 'http://portal.example.com/c/',
    } as unknown as PlaylistMeta;

    let dispatch: jest.Mock;
    let deletePlaylist: jest.Mock;

    function setup(playlists: PlaylistMeta[]): PanelSessionService {
        dispatch = jest.fn();
        deletePlaylist = jest.fn().mockResolvedValue(true);
        TestBed.configureTestingModule({
            providers: [
                PanelSessionService,
                { provide: Store, useValue: { select: () => of(playlists), dispatch } },
                { provide: PlaylistDeleteActionService, useValue: { deletePlaylist } },
                { provide: PanelSyncService, useValue: { refresh: jest.fn().mockResolvedValue(undefined) } },
                { provide: ParentalControlService, useValue: { reload: jest.fn(), reset: jest.fn() } },
            ],
        });
        return TestBed.inject(PanelSessionService);
    }

    beforeEach(() => localStorage.clear());

    it('keeps the panel line and removes every other source: Xtream, M3U and Stalker', async () => {
        const service = setup([line, otherXtream, m3u, stalker]);

        await service.start({
            server: line.serverUrl as string,
            username: 'user1',
            password: 'pass1',
            isDemo: false,
        });

        const deleted = deletePlaylist.mock.calls.map(([p]) => p._id).sort();
        expect(deleted).toEqual(['m3u-file', 'other-xtream', 'stalker-portal']);
        const removed = dispatch.mock.calls
            .map(([action]) => action)
            .filter((action) => action.type === PlaylistActions.removePlaylist.type)
            .map((action) => action.playlistId)
            .sort();
        expect(removed).toEqual(['m3u-file', 'other-xtream', 'stalker-portal']);
        expect(localStorage.getItem('session_token')).toBe('panel-panel-line');
    });

    it('a session that ends removes every source, the panel line included', async () => {
        const service = setup([line, m3u, stalker]);

        await service.clear();

        expect(deletePlaylist.mock.calls.map(([p]) => p._id).sort()).toEqual([
            'm3u-file',
            'panel-line',
            'stalker-portal',
        ]);
        expect(localStorage.getItem('session_token')).toBeNull();
    });
});
