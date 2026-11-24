import { LiveStreamAutoOpenStateService } from './live-stream-auto-open-state.service';

describe('LiveStreamAutoOpenStateService', () => {
    let service: LiveStreamAutoOpenStateService;

    beforeEach(() => {
        service = new LiveStreamAutoOpenStateService();
        window.history.replaceState({}, document.title);
    });

    afterEach(() => {
        window.history.replaceState({}, document.title);
    });

    it('captures a positive live item id from history state', () => {
        window.history.replaceState(
            { openXtreamLiveItemId: 101 },
            document.title
        );

        service.captureFromHistoryState();

        expect(service.pendingItemId()).toBe(101);
    });

    it('keeps the pending channel when a later navigation has no live item id (Deportes)', () => {
        window.history.replaceState(
            { openXtreamLiveItemId: 101 },
            document.title
        );
        service.captureFromHistoryState();

        window.history.replaceState({}, document.title);
        service.captureFromHistoryState();

        expect(service.pendingItemId()).toBe(101);
    });

    it('starts without a pending channel and keeps the category for a channel the list does not have', () => {
        service.captureFromHistoryState();
        expect(service.pendingItemId()).toBeNull();

        window.history.replaceState(
            {
                openXtreamLiveItemId: 7,
                openXtreamLiveTitle: 'ESPN',
                openXtreamLiveCategoryId: '12',
            },
            document.title
        );
        service.captureFromHistoryState();

        expect(service.fallbackItem(7)).toEqual({
            xtream_id: 7,
            title: 'ESPN',
            poster_url: '',
            category_id: '12',
        });
    });
});
