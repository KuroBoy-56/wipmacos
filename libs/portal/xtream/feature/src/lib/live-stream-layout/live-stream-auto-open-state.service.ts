import { Injectable, signal } from '@angular/core';

@Injectable()
export class LiveStreamAutoOpenStateService {
    readonly pendingItemId = signal<number | null>(null);
    /** name and logo sent with the id (Deportes): enough to play a channel the saved list does not have yet */
    private pendingTitle = '';
    private pendingPoster = '';

    captureFromHistoryState(): void {
        const state = window.history.state as Record<string, unknown> | null;
        const requestedItemId = Number(state?.['openXtreamLiveItemId']);
        if (Number.isFinite(requestedItemId) && requestedItemId > 0) {
            this.pendingTitle = String(state?.['openXtreamLiveTitle'] ?? '');
            this.pendingPoster = String(state?.['openXtreamLivePoster'] ?? '');
            this.pendingItemId.set(requestedItemId);
            return;
        }

        this.pendingItemId.set(null);
    }

    /**
     * The channel asked for when it is not in the saved list (event channels change every day): the stream URL only
     * needs the id, so it plays like Roku does. Null without a name (nothing says the channel exists).
     */
    fallbackItem(id: number): { xtream_id: number; title: string; poster_url: string } | null {
        return this.pendingTitle ? { xtream_id: id, title: this.pendingTitle, poster_url: this.pendingPoster } : null;
    }

    clearPendingItem(): void {
        this.pendingItemId.set(null);
    }

    clearHistoryState(): void {
        try {
            const state = (window.history.state ?? {}) as Record<
                string,
                unknown
            >;
            if (!('openXtreamLiveItemId' in state)) {
                return;
            }

            const nextState = { ...state };
            delete nextState['openXtreamLiveItemId'];
            delete nextState['openXtreamLiveTitle'];
            delete nextState['openXtreamLivePoster'];
            window.history.replaceState(nextState, document.title);
        } catch {
            // Browser history state can be unavailable in restricted contexts.
        }
    }
}
