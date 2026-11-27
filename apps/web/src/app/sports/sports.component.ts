import { HScrollComponent } from '@iptvnator/ui/components';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { DEFAULT_SPORTS_MATCH_RULES, PanelSportMeta, PanelSyncService, ProfilesService } from '@iptvnator/services';
import { buildXtreamNavigationTarget } from '@iptvnator/portal/shared/util';
import { SportsChannelsMap, SportsChannelTarget, SportsDataService } from './sports-data.service';
import { MatchAlertDirective } from './match-alert.directive';
import { ownedChannels, SportsMenuOpt, sportsMenu } from './sports-menu.util';
import { SportsTab } from './sports-extra.util';
import { SportsFixturesState } from './sports-fixtures.state';
import { SportsTablesComponent } from './sports-tables.component';
import {
    DEFAULT_SPORTS_META,
    eventsForDay,
    groupByLeague,
    hasScore,
    matchesSportsQuery,
    SportsCard,
    sportCounts,
    sportsDayKey,
    sportsEventStatus,
    SportsEventStatus,
    toSportsCards,
} from './sports-schedule.util';

type SportsMenu = { id: string; title?: string; opts: SportsMenuOpt[]; typing?: string };

/** auto: best channel; tv: one broadcast channel of the menu; teams: by teams / event name (Roku's menu). */
export type SportsWatchMode = { kind: 'auto' } | { kind: 'teams' } | { kind: 'tv'; index: number };

interface SportChip {
    key: string;
    label: string;
    icon: string;
    count: number;
}

@Component({
    selector: 'app-sports',
    templateUrl: './sports.component.html',
    styleUrl: './sports.component.scss',
    imports: [HScrollComponent, MatchAlertDirective, NgTemplateOutlet, TranslatePipe, SportsTablesComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsComponent implements OnInit {
    private readonly data = inject(SportsDataService);
    private readonly router = inject(Router);
    private readonly snackBar = inject(MatSnackBar);
    private readonly translate = inject(TranslateService);
    private readonly lang = toSignal(this.translate.onLangChange.pipe(map((e) => e.lang)), {
        initialValue: this.translate.currentLang || this.translate.defaultLang,
    });
    readonly loading = signal(true);
    readonly events = signal<SportsCard[]>([]);
    /** Sports of the panel agenda (its labels come in the app language). */
    private readonly panelMeta = signal<Record<string, PanelSportMeta>>({});
    /** Built-in sport labels in the app language, overridden by the panel's. */
    readonly meta = computed<Record<string, PanelSportMeta>>(() => {
        this.lang();
        const local: Record<string, PanelSportMeta> = {};
        for (const [key, m] of Object.entries(DEFAULT_SPORTS_META)) {
            local[key] = { ...m, label: this.translate.instant(m.label) };
        }
        return { ...local, ...this.panelMeta() };
    });
    /** Hoy / Mañana / Finalizados (este último solo con perfiles) */
    readonly day = signal<0 | 1 | 2>(0);
    private readonly profiles = inject(ProfilesService);
    readonly finTab = computed(() => this.profiles.needed() && !!this.profiles.profile());
    readonly sport = signal('');
    readonly query = signal('');
    readonly now = signal(Date.now());
    /** Channel of every match (Roku): undefined while searching, null = the channel list could not load. */
    readonly channels = signal<SportsChannelsMap | null | undefined>(undefined);
    /** Match pressed while the channels were still being searched: opens when they arrive. */
    private pending: SportsCard | null = null;
    /**
     * "¿Dónde quieres verlo?" (webOS) by match id: its rows, or the channels a search found; typing = search box.
     * «Ver canales» opens it on every playable match of the same row / league at once, each with its own channels,
     * so the row grows evenly instead of leaving the other cards as empty boxes.
     */
    readonly menus = signal<Record<string, SportsMenu>>({});
    /** Panel Deportes "solo IPTV": each match shows only the client's channels. */
    private readonly iptv = signal(false);
    private readonly timeFormat = computed(
        () =>
            new Intl.DateTimeFormat(this.lang() || 'es', {
                hour: 'numeric',
                minute: '2-digit',
            })
    );
    private queryTimer: ReturnType<typeof setTimeout> | undefined;
    private alive = true;

    /** Agenda / Tablas / Selecciones / Equipos (the last three when the panel offers them, as Roku, Vega and Android). */
    readonly tab = signal<SportsTab>('agenda');
    private readonly extra = signal<{ tables: boolean; nations: boolean; teams: boolean }>({ tables: false, nations: false, teams: false });
    private readonly alias = signal<Record<string, string>>({});
    readonly tabs = computed<{ key: SportsTab; label: string }[]>(() => {
        const x = this.extra();
        const list: { key: SportsTab; label: string }[] = [{ key: 'agenda', label: 'MPX.SPORTS.TAB_SCHEDULE' }];
        if (x.tables) list.push({ key: 'tables', label: 'MPX.SPORTS.TAB_TABLES' });
        if (x.nations) list.push({ key: 'nations', label: 'MPX.SPORTS.TAB_NATIONS' });
        if (x.teams) list.push({ key: 'teams', label: 'MPX.SPORTS.TAB_TEAMS' });
        return list.length > 1 ? list : [];
    });
    readonly fixtures = new SportsFixturesState(inject(PanelSyncService), {
        alias: () => this.alias(),
        minutes: (sp) => this.meta()[sp]?.minutes || 120,
        now: () => this.now(),
    });
    private readonly dateFormat = computed(
        () => new Intl.DateTimeFormat(this.lang() || 'es', { weekday: 'short', day: 'numeric', month: 'short' })
    );

    readonly dayKeys = computed(() => {
        const now = this.now();
        return [sportsDayKey(new Date(now)), sportsDayKey(new Date(now + 86_400_000))];
    });

    readonly chips = computed<SportChip[]>(() => {
        const counts = sportCounts(this.dayEvents(), this.dayKeys()[this.day() === 1 ? 1 : 0]);
        const meta = this.meta();
        return Object.keys(meta)
            .filter((k) => counts[k])
            .map((k) => ({ key: k, label: meta[k].label, icon: meta[k].icon, count: counts[k] }));
    });

    readonly totalForDay = computed(() => this.chips().reduce((sum, c) => sum + c.count, 0));

    readonly liveEvents = computed(() =>
        this.events().filter(
            (e) => this.status(e) === 'live' && (!this.sport() || e.sp === this.sport())
        )
    );

    readonly showLiveRow = computed(
        () => this.liveEvents().length > 0 && this.day() === 0 && !this.query().trim()
    );

    readonly dayEvents = computed(() => eventsForDay(this.events(), this.dayKeys(), this.day(), (e) => this.status(e), this.finTab()));

    readonly groups = computed(() => {
        const hideLive = this.showLiveRow();
        const list = this.dayEvents().filter(
            (e) =>
                (!this.sport() || e.sp === this.sport()) &&
                matchesSportsQuery(e, this.query()) &&
                !(hideLive && this.status(e) === 'live')
        );
        return groupByLeague(list, this.meta());
    });

    constructor() {
        const tick = setInterval(() => this.now.set(Date.now()), 60_000);
        inject(DestroyRef).onDestroy(() => {
            this.alive = false;
            clearInterval(tick);
            clearTimeout(this.queryTimer);
        });
    }

    async ngOnInit(): Promise<void> {
        const agenda = await this.data.loadAgenda();
        if (agenda) {
            this.panelMeta.set(agenda.sports ?? {});
            this.events.set(toSportsCards(agenda.events));
            this.alias.set(agenda.match?.alias ?? DEFAULT_SPORTS_MATCH_RULES.alias);
            this.iptv.set(agenda.chan === 'iptv');
            this.extra.set({
                tables: agenda.tables?.on === true,
                nations: agenda.fixtures?.on === true && agenda.fixtures?.nat === true,
                teams: agenda.fixtures?.on === true,
            });
        }
        // Nothing left today: open tomorrow, like the web player.
        if (this.events().length && !eventsForDay(this.events(), this.dayKeys(), 0, (e) => this.status(e), this.finTab()).length) {
            this.day.set(1);
        }
        this.loading.set(false);
        void this.matchChannels();
    }

    private async matchChannels(): Promise<void> {
        const map = await this.data.matchEvents(this.events()).catch(() => null);
        if (!this.alive) return;
        this.channels.set(map);
        const e = this.pending;
        this.pending = null;
        if (e) void this.open(e);
    }

    /** Card line: the channel that plays (Roku: "Buscando…" / "Sin canal" / channel name). */
    chanText(e: SportsCard): string {
        const map = this.channels();
        if (map === undefined) return this.translate.instant('MPX.SPORTS.FINDING');
        if (map === null) return this.translate.instant('MPX.SPORTS.NO_CHANNEL_LIST');
        return map.byEvent[e.id]?.best?.name ?? this.translate.instant('MPX.SPORTS.NO_CHANNEL_SHORT');
    }

    hasChannel(e: SportsCard): boolean {
        return !!this.channels()?.byEvent[e.id]?.best;
    }


    selectTab(tab: SportsTab): void {
        this.tab.set(tab);
        this.menus.set({});
        if (tab === 'nations' || tab === 'teams') void this.fixtures.load(() => this.alive);
    }

    /** Teams / National teams: the match day too (the next 21 days); today only the hour. */
    when(e: SportsCard): string {
        return e.dayKey === this.dayKeys()[0] ? this.time(e) : `${this.dateFormat().format(new Date(e.start))} · ${this.time(e)}`;
    }

    /** Equipos: filters while typing; Enter keeps it in the last searched. */
    onTeamQuery(value: string): void {
        clearTimeout(this.queryTimer);
        this.queryTimer = setTimeout(() => this.fixtures.query.set(value.trim()), 250);
    }

    selectDay(day: 0 | 1 | 2): void {
        this.day.set(day);
        this.sport.set('');
    }

    onQuery(value: string): void {
        clearTimeout(this.queryTimer);
        this.queryTimer = setTimeout(() => this.query.set(value.trim()), 150);
    }

    status(e: SportsCard): SportsEventStatus {
        return sportsEventStatus(e, this.meta(), this.now());
    }

    showScore(e: SportsCard): boolean {
        return hasScore(e, this.status(e));
    }

    time(e: SportsCard): string {
        return this.timeFormat().format(new Date(e.start));
    }

    leagueLabel(e: SportsCard): string {
        const m = this.meta()[e.sp];
        return `${m?.icon ?? ''} ${e.lg || m?.label || e.sp}`.trim();
    }

    initial(name: string): string {
        return (name || '?').charAt(0).toUpperCase();
    }

    /** TheSportsDB serves a /small variant; fall back to the original, then a letter. */
    onBadgeError(img: HTMLImageElement): void {
        if (!img.dataset['retry']) {
            img.dataset['retry'] = '1';
            img.src = img.src.replace(/\/small$/, '');
            return;
        }
        img.hidden = true;
        img.nextElementSibling?.removeAttribute('hidden');
    }

    /** "En TV: ESPN 2 · TUDN +3": the agenda's channels or, in "iptv" mode, only the client's (webOS). */
    tvLine(e: SportsCard): string {
        const tv = this.iptv() ? ownedChannels(this.channels()?.byEvent[e.id]).map((c) => c.name) : (e.tv ?? []).map((t) => t.n);
        if (!tv.length) return '';
        const names = tv.slice(0, 4).join(' · ') + (tv.length > 4 ? `  +${tv.length - 4}` : '');
        return this.translate.instant('MPX.SPORTS.ON_TV', { channels: names });
    }

    /** With broadcast channels: the menu (watch, each channel, by teams); without: straight to the channel. */
    async open(e: SportsCard, list: SportsCard[] = [e]): Promise<void> {
        if (!this.playable(e)) return;
        if (this.menus()[e.id]) return this.menus.set({});
        const cards = [e, ...list.filter((c) => c.id !== e.id && this.watchable(c))];
        let map = this.channels();
        // Equipos / Selecciones: matches outside the agenda are searched when pressed
        const missing = map ? cards.filter((c) => !map?.byEvent[c.id]) : [];
        if (map && missing.length) {
            const more = await this.data.matchEvents(missing).catch(() => null);
            if (more) this.channels.set((map = { ...map, byEvent: { ...map.byEvent, ...more.byEvent } }));
        }
        if (map === undefined) {
            this.pending = e;
            this.toast('MPX.SPORTS.WAIT_CHANNELS');
            return;
        }
        if (map === null) {
            this.toast('MPX.SPORTS.NO_CHANNEL_LIST');
            return;
        }
        const tr = (key: string, params?: Record<string, string>) => this.translate.instant(key, params);
        const next: Record<string, SportsMenu> = {};
        for (const c of cards) next[c.id] = { id: c.id, opts: sportsMenu(c, map.byEvent[c.id], this.iptv(), tr) };
        this.menus.set(next);
    }

    run(e: SportsCard, o: SportsMenuOpt): void {
        const a = o.act;
        if (a.kind === 'auto') void this.watch(e);
        else if (a.kind === 'tv') void this.watch(e, { kind: 'tv', index: a.index });
        else if (a.kind === 'play') void this.play(a.target);
        else if (a.kind === 'search') void this.findChans(e, a.q);
        else this.menus.update((m) => (m[e.id] ? { ...m, [e.id]: { ...m[e.id], typing: a.q } } : m));
    }

    /** Channels of the client's list with that name (channel, team or event), all green: they are the server's. */
    async findChans(e: SportsCard, q: string): Promise<void> {
        q = q.trim();
        if (!q) return;
        const list = await this.data.searchChannels(q);
        if (!list.length) return this.toast('MPX.SPORTS.NO_SEARCH', { name: q });
        this.menus.update((m) => ({
            ...m,
            [e.id]: {
                id: e.id,
            title: this.translate.instant('MPX.SPORTS.SEARCH_TITLE', { name: q }),
                opts: list.map((c) => ({ title: c.name, green: true, act: { kind: 'play', target: c } })),
            },
        }));
    }

    /** Today, not ended nor postponed (no message: used for the other cards of the row). */
    private watchable(e: SportsCard): boolean {
        const st = this.status(e);
        return e.dayKey === this.dayKeys()[0] && st !== 'fin' && st !== 'pp';
    }

    /** Ended, postponed or another day: nothing to watch yet. */
    private playable(e: SportsCard): boolean {
        const st = this.status(e);
        const isToday = e.dayKey === this.dayKeys()[0];
        if (!isToday || st === 'fin' || st === 'pp') {
            this.toast(st === 'fin' && isToday ? 'MPX.SPORTS.ENDED' : 'MPX.SPORTS.NOT_LIVE');
            return false;
        }
        return true;
    }

    /** Plays the chosen channel; without an exact one the first event channel (never the category list). */
    async watch(e: SportsCard, mode: SportsWatchMode = { kind: 'auto' }): Promise<void> {
        this.menus.set({});
        const map = this.channels();
        if (!map || !this.playable(e)) return;
        const res = map.byEvent[e.id];
        const folder = map.folder;
        if (mode.kind === 'auto') {
            if (res?.best) return this.play(res.best);
            if (folder) return this.play(folder, 'MPX.SPORTS.PARTIAL_CHANNEL', { name: folder.name });
            return this.toast('MPX.SPORTS.NO_CHANNEL');
        }
        if (mode.kind === 'tv') {
            const t = res?.tv[mode.index];
            if (!t) return;
            if (t.ch) return this.play(t.ch);
            const alt = res?.teams ?? folder;
            if (alt) return this.play(alt, 'MPX.SPORTS.MISSING_CHANNEL', { missing: t.n, name: alt.name });
            return this.toast('MPX.SPORTS.NO_TV_CHANNEL', { name: t.n });
        }
        if (res?.teams) return this.play(res.teams);
        if (folder) return this.play(folder, 'MPX.SPORTS.PARTIAL_CHANNEL', { name: folder.name });
        this.toast('MPX.SPORTS.NO_CHANNEL');
    }

    /** Opens TV en vivo on that channel and plays it (also a channel newer than the saved list). */
    private async play(target: SportsChannelTarget, note?: string, params?: Record<string, string>): Promise<void> {
        this.menus.set({});
        if (note) this.toast(note, params);
        const nav = buildXtreamNavigationTarget({
            playlistId: target.playlistId,
            type: 'live',
            categoryId: target.categoryId,
            itemId: target.streamId,
            title: target.name,
        });
        await this.router.navigate(nav.link, { state: nav.state });
    }

    private toast(key: string, params?: Record<string, string>): void {
        this.snackBar.open(this.translate.instant(key, params), undefined, { duration: 3000 });
    }
}
