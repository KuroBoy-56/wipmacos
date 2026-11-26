import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { selectAllPlaylistsMeta } from '@iptvnator/m3u-state';
import {
    findChannelByName,
    findSportsChannel,
    normalizeSportsText,
    PanelSportsAgenda,
    ParentalControlService,
    PanelSportsEvent,
    PanelSyncService,
    providerApiGet,
    sessionCredentials,
    SportsChannelMatch,
    SportsLiveCategory,
    SportsLiveStream,
    sportsEpgChannels,
} from '@iptvnator/services';
import { XTREAM_DATA_SOURCE } from '@iptvnator/portal/xtream/data-access';

const LIVE_CACHE_MS = 30 * 60_000;
/** la guía del panel se pregunta como mucho cada 10 min */
const EPG_CACHE_MS = 10 * 60_000;
const SEARCH_NOISE = new Set(['club', 'united', 'city', 'real', 'deportivo', 'atletico', 'sporting', 'vs']);
const SEARCH_SPORT_CAT = /sport|deport|event|ppv|futbol/;
const DEFAULT_EVENT_CATEGORY = 'event|ppv|pay per view|deportes? en vivo|live sport|partidos? (de )?hoy';

export interface SportsChannelTarget extends SportsChannelMatch {
    playlistId: string;
    /** The broadcast channel asked for is not in the client's list: this is the team / event match. */
    missing?: string;
}

/** A broadcast channel of the match and the client's channel for it (null: the client does not have it). */
export interface SportsTvOption {
    n: string;
    c: string;
    ch: SportsChannelTarget | null;
}

/** What the card and its menu show (webOS / Vega / Roku): best = first broadcast channel, else the guide, else teams. */
export interface SportsEventChannels {
    tv: SportsTvOption[];
    /** channels that have the match in their guide at that time (panel api/sports_epg.php) */
    epg: SportsChannelTarget[];
    teams: SportsChannelTarget | null;
    best: SportsChannelTarget | null;
}

export interface SportsChannelsMap {
    byEvent: Record<string, SportsEventChannels>;
    /** First channel of the event folders: played when there is no exact channel (never the list). */
    folder: SportsChannelTarget | null;
}

/**
 * Sports agenda from the panel and the "TV en vivo" lookup: the panel's
 * matching rules applied to the session line's live channels.
 */
@Injectable({ providedIn: 'root' })
export class SportsDataService {
    private readonly panelSync = inject(PanelSyncService);
    private readonly store = inject(Store);
    private readonly parental = inject(ParentalControlService);
    private readonly dataSource = inject(XTREAM_DATA_SOURCE);
    private live: { at: number; streams: SportsLiveStream[]; categories: SportsLiveCategory[] } | null = null;
    /** visible part of `live` (same array while nothing changes, so the matcher's index is reused) */
    private visible: { key: string; streams: SportsLiveStream[]; categories: SportsLiveCategory[] } | null = null;
    private agenda: PanelSportsAgenda | null = null;
    private epg: { at: number; streams: SportsLiveStream[]; map: Record<string, string[]> } | null = null;

    async loadAgenda(): Promise<PanelSportsAgenda | null> {
        const agenda = await this.panelSync.fetchSportsAgenda();
        if (agenda) this.agenda = agenda;
        return agenda ?? this.agenda;
    }

    /**
     * Every match against the client's visible live channels, once per channel list (Roku, Vega and webOS do the
     * same): the card shows the channel before pressing and the menu knows which broadcast channels the client has.
     * null = no session line or no channels.
     */
    async matchEvents(events: readonly PanelSportsEvent[], rules = this.agenda?.match): Promise<SportsChannelsMap | null> {
        const playlistId = await this.sessionPlaylistId();
        if (!playlistId) return null;
        const { streams, categories } = await this.liveChannels(playlistId);
        if (!streams.length) return null;
        const target = (st: SportsLiveStream): SportsChannelTarget =>
            ({ streamId: String(st.stream_id), categoryId: String(st.category_id ?? ''), name: String(st.name ?? ''), partial: false, playlistId });
        const byEvent: Record<string, SportsEventChannels> = {};
        const byId = new Map(streams.map((x) => [String(x.stream_id), x]));
        const guide = await this.epgMap(streams, categories);
        for (const ev of events) {
            const tv = (ev.tv ?? []).map((t) => {
                const st = findChannelByName(t.n, streams);
                return { n: t.n, c: t.c ?? '', ch: st ? target(st) : null };
            });
            const byTeams = findSportsChannel(ev, streams, categories, rules);
            const teams = byTeams && !byTeams.partial ? { ...byTeams, playlistId } : null;
            const epg = (guide[String(ev.id)] ?? []).map((id) => byId.get(id)).filter((x): x is SportsLiveStream => !!x).map(target);
            byEvent[String(ev.id)] = { tv, epg, teams, best: tv.find((t) => t.ch)?.ch ?? epg[0] ?? teams };
        }
        const folder = findSportsChannel({ h: '', a: '', lg: '', ev: '' }, streams, categories, rules); // no team or name: only the folder
        return { byEvent, folder: folder ? { ...folder, playlistId } : null };
    }

    /**
     * The client's live channels by a name (channel, team or event), accents ignored (webOS searchChannels): all
     * the words first, else an important word (4+ letters: «Tigres UANL» finds «LIGA MX: Tigres vs Monterrey");
     * sports / event categories first in each group. Up to 12.
     */
    async searchChannels(q: string): Promise<SportsChannelTarget[]> {
        const playlistId = await this.sessionPlaylistId();
        if (!playlistId) return [];
        const words = normalizeSportsText(q).split(' ').filter((w) => w.length >= 2);
        if (!words.length) return [];
        const { streams, categories } = await this.liveChannels(playlistId);
        const catName = new Map(categories.map((c) => [String(c.category_id), normalizeSportsText(c.category_name)]));
        const groups: SportsChannelTarget[][] = [[], [], [], []];
        for (const st of streams) {
            const n = normalizeSportsText(st.name);
            const all = words.every((w) => n.includes(w));
            const some = words.some((w) => w.length >= 4 && !SEARCH_NOISE.has(w) && n.includes(w));
            if (!all && !some) continue;
            const sport = SEARCH_SPORT_CAT.test(catName.get(String(st.category_id ?? '')) ?? '');
            const g = all ? (sport ? 0 : 1) : sport ? 2 : 3;
            if (groups[g].length < 12) groups[g].push({ streamId: String(st.stream_id), categoryId: String(st.category_id ?? ''), name: String(st.name ?? ''), partial: false, playlistId });
        }
        // with a full match the partial ones are not shown
        const last = groups[0].length + groups[1].length > 0 ? 1 : 3;
        return ([] as SportsChannelTarget[]).concat(...groups.slice(0, last + 1)).slice(0, 12);
    }

    /** api/sports_epg.php: partido -> canales del cliente que lo tienen en su programación a esa hora. */
    private async epgMap(streams: SportsLiveStream[], categories: SportsLiveCategory[]): Promise<Record<string, string[]>> {
        if (this.epg && this.epg.streams === streams && Date.now() - this.epg.at < EPG_CACHE_MS) return this.epg.map;
        let eventRe: RegExp | null = null;
        try {
            eventRe = new RegExp(this.agenda?.match?.eventCategory || DEFAULT_EVENT_CATEGORY, 'i');
        } catch {
            eventRe = null;
        }
        const map = await this.panelSync.fetchSportsEpg(sportsEpgChannels(streams, categories, eventRe)).catch(() => ({}));
        this.epg = { at: Date.now(), streams, map };
        return map;
    }

    /**
     * Live channels of the session line the client can see (Roku: visible categories): no adult or blocked
     * categories (parental control) and none the client hid in the saved list.
     */
    private async liveChannels(playlistId: string): Promise<{ streams: SportsLiveStream[]; categories: SportsLiveCategory[] }> {
        if (!this.live || Date.now() - this.live.at >= LIVE_CACHE_MS) {
            const result = { at: Date.now(), ...(await this.fetchProviderLive()) };
            if (!result.streams.length) return result;
            this.live = result;
            this.visible = null;
        }
        // shortcut: a category hidden in the saved list while the app runs counts after the 30-min refresh
        const hiddenKey = `${this.parental.locked()}|${[...this.parental.blocked()].join(',')}|${playlistId}`;
        if (!this.visible || this.visible.key !== hiddenKey) {
            const hidden = this.parental.hiddenIds(this.live.categories, (c) => c.category_name, (c) => String(c.category_id), 'live');
            const saved = await this.dataSource.getAllCategories(playlistId, 'live').catch(() => []);
            for (const c of saved) if (c.hidden) hidden.add(String(c.xtream_id));
            const categories = this.live.categories.filter((c) => !hidden.has(String(c.category_id)));
            this.visible = { key: hiddenKey, categories, streams: this.live.streams.filter((st) => !hidden.has(String(st.category_id ?? ''))) };
        }
        return this.visible;
    }

    /** The session line's live channels and categories straight from the IPTV server. */
    protected async fetchProviderLive(): Promise<{ streams: SportsLiveStream[]; categories: SportsLiveCategory[] }> {
        const creds = sessionCredentials();
        const [streams, categories] = await Promise.all([
            providerApiGet(creds, { action: 'get_live_streams' }),
            providerApiGet(creds, { action: 'get_live_categories' }),
        ]);
        return {
            streams: Array.isArray(streams) ? (streams as SportsLiveStream[]) : [],
            categories: Array.isArray(categories) ? (categories as SportsLiveCategory[]) : [],
        };
    }

    /** The Xtream playlist that belongs to the panel session. */
    private async sessionPlaylistId(): Promise<string | null> {
        const creds = sessionCredentials();
        const playlists = await firstValueFrom(this.store.select(selectAllPlaylistsMeta));
        const xtream = playlists.filter((p) => !!p.serverUrl);
        const own = xtream.find((p) => p.username === creds.username) ?? xtream[0];
        return own?._id ?? null;
    }
}
