import { Injectable, signal } from '@angular/core';

@Injectable()
export class LiveStreamAutoOpenStateService {
    readonly pendingItemId = signal<number | null>(null);
    /** name and logo sent with the id (Deportes): enough to play a channel the saved list does not have yet */
    private pendingTitle = '';
    private pendingPoster = '';
    private pendingCategoryId = '';

    captureFromHistoryState(): void {
        const state = window.history.state as Record<string, unknown> | null;
        const requestedItemId = Number(state?.['openXtreamLiveItemId']);
        if (Number.isFinite(requestedItemId) && requestedItemId > 0) {
            this.pendingTitle = String(state?.['openXtreamLiveTitle'] ?? '');
            this.pendingPoster = String(state?.['openXtreamLivePoster'] ?? '');
            this.pendingCategoryId = String(state?.['openXtreamLiveCategoryId'] ?? '');
            this.pendingItemId.set(requestedItemId);
        }
        // A later navigation without the request (query params, search sync, page) never drops a channel that is
        // still waiting for the channel list: before, Deportes opened TV en vivo without the channel.
    }

    /**
     * The channel asked for when it is not in the saved list (event channels change every day): the stream URL only
     * needs the id, so it plays like Roku does. Null without a name (nothing says the channel exists).
     */
    fallbackItem(
        id: number
    ): { xtream_id: number; title: string; poster_url: string; category_id?: string } | null {
        if (!this.pendingTitle) return null;
        const item = { xtream_id: id, title: this.pendingTitle, poster_url: this.pendingPoster };
        return this.pendingCategoryId ? { ...item, category_id: this.pendingCategoryId } : item;
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
            delete nextState['openXtreamLiveCategoryId'];
            window.history.replaceState(nextState, document.title);
        } catch {
            // Browser history state can be unavailable in restricted contexts.
        }
    }
}
