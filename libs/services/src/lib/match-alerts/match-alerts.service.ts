import { computed, inject, Injectable, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { lineKey } from '../panel-sync/panel-progress.client';
import { PanelSyncService, sessionCredentials } from '../panel-sync/panel-sync.service';
import { PanelSportsFixtures } from '../panel-sync/panel-sports.types';
import { ProfilesService } from '../profiles/profiles.service';

/** Equipo favorito (Ajustes): n = nombre del panel (para buscar sus partidos), l = nombre en el idioma de la app. */
export interface FavTeam {
    n: string;
    l: string;
    b: string;
    lg: string;
    sp: string;
}

/** Lo que guarda la campanita (24 h): hora, título del partido y el aviso. */
export interface BellItem {
    at: number;
    t: string;
    x: string;
}

/** Un partido que se puede marcar en Deportes (mantener presionada o clic derecho en la tarjeta). */
export interface AlertableEvent {
    id: string;
    h?: string;
    a?: string;
    ev?: string;
    lg?: string;
    ts?: string;
    s?: number;
}

const STAGES = [30, 10, 0];
const DAY = 86_400_000;
const GRACE = 5 * 60_000;
const FX_TTL = 6 * 3600_000;

function read<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function write(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* sin almacenamiento: queda para esta vez */
    }
}

/** inicio del partido en ms (s del panel en segundos, si no la fecha ts) */
export function eventStart(e: { s?: number; ts?: string }): number {
    return e.s ? e.s * 1000 : Date.parse(e.ts ?? '') || 0;
}

/** activar el aviso solo vale si faltan más de 5 minutos para que empiece (el panel responde 409 too_late si no) */
export const ALERT_MIN_AHEAD_MS = 5 * 60_000;

export function alertTooLate(e: { s?: number; ts?: string }, now = Date.now()): boolean {
    return eventStart(e) <= now + ALERT_MIN_AHEAD_MS;
}

export function eventTitle(e: { h?: string; a?: string; ev?: string; lg?: string }): string {
    return e.h && e.a ? `${e.h} vs ${e.a}` : e.ev || e.lg || '';
}

/**
 * Avisos de partidos, como Android: los equipos favoritos (Ajustes, por línea y perfil) y los partidos marcados en
 * Deportes avisan 30 min antes, 10 min antes y al empezar. Siempre quedan en la campanita de la barra (24 h); la
 * notificación del sistema solo sale con la ventana sin foco (la app abierta pero en segundo plano o minimizada). Los
 * partidos salen de los próximos 21 días del panel (api/sports_fixtures.php, cada 6 h); nunca de TheSportsDB. Con la app
 * cerrada no hay avisos (la computadora no tiene alarmas del sistema como el celular).
 */
@Injectable({ providedIn: 'root' })
export class MatchAlertsService {
    private readonly sync = inject(PanelSyncService);
    private readonly profiles = inject(ProfilesService);
    private readonly translate = inject(TranslateService);
    private readonly rev = signal(0);
    private fx: PanelSportsFixtures | null = null;
    private fxAt = 0;
    private timer: ReturnType<typeof setInterval> | null = null;

    private key(base: string): string {
        return `mpx:${base}|${lineKey(sessionCredentials())}|${this.profiles.profile()?.id ?? ''}`;
    }

    private bellKey(): string {
        return `mpx:bell|${lineKey(sessionCredentials())}`;
    }

    /** todo esto existe solo con perfiles: uno elegido que no sea el infantil */
    readonly on = computed(() => !!this.profiles.profile() && !this.profiles.kids());

    readonly teams = computed(() => {
        this.rev();
        return read<FavTeam[]>(this.key('fav_teams'), []);
    });

    readonly bell = computed(() => {
        this.rev();
        const cut = Date.now() - DAY;
        return read<BellItem[]>(this.bellKey(), []).filter((b) => b.at >= cut);
    });

    readonly unread = computed(() => {
        const seen = read<number>(this.bellKey() + '|seen', 0);
        return this.bell().filter((b) => b.at > seen).length;
    });

    setTeams(list: FavTeam[]): void {
        write(this.key('fav_teams'), list);
        this.fxAt = 0;
        this.changed();
        this.askPermission();
        // también en la nube: el celular de la misma línea y perfil avisa en su barra de notificaciones
        void this.cloud('set_teams', { teams: list });
    }

    private marked(): Record<string, { t: string; s: number }> {
        return read(this.key('alert_events'), {} as Record<string, { t: string; s: number }>);
    }

    isMarked(id: string): boolean {
        this.rev();
        return id in this.marked();
    }

    /** activa o quita los avisos de un partido; true = quedó activado */
    toggle(e: AlertableEvent): boolean {
        if (!this.on()) return false;
        const m = this.marked();
        const on = !(e.id in m);
        // uno que empieza en 5 minutos o menos (o ya empezó) no se puede marcar; quitarlo, siempre
        if (on && alertTooLate(e)) return false;
        if (on) m[e.id] = { t: eventTitle(e), s: eventStart(e) };
        else delete m[e.id];
        write(this.key('alert_events'), m);
        this.changed();
        if (on) this.askPermission();
        void this.cloud('event', { id: e.id, on, event: { t: eventTitle(e), s: eventStart(e), h: e.h ?? '', a: e.a ?? '' } });
        return on;
    }

    /** manda un cambio a la nube; sin respuesta queda marcado y se manda todo en la próxima sincronización */
    private async cloud(action: string, fields: Record<string, unknown>): Promise<void> {
        const r = await this.sync.alertsRequest<{ success?: boolean }>(action, fields).catch(() => null);
        if (!r) write(this.key('alerts_dirty'), 1);
    }

    /**
     * Baja de la nube los equipos y partidos de este perfil (lo marcado en el celular o en la TV). Si un cambio de aquí
     * no llegó, primero se manda todo lo de aquí.
     */
    async pull(): Promise<void> {
        if (!this.on() || !sessionCredentials().username) return;
        if (read<number>(this.key('alerts_dirty'), 0)) {
            const ok = await this.sync.alertsRequest('set_teams', { teams: this.teams() }).catch(() => null);
            if (!ok) return;
            for (const [id, v] of Object.entries(this.marked())) {
                await this.sync.alertsRequest('event', { id, on: true, event: { t: v.t, s: v.s } }).catch(() => null);
            }
            localStorage.removeItem(this.key('alerts_dirty'));
        }
        type Cloud = { success?: boolean; enabled?: boolean; teams?: FavTeam[]; events?: Record<string, { t: string; s: number }> };
        const r = await this.sync.alertsRequest<Cloud>(null).catch(() => null);
        if (!r?.success || !r.enabled) return;
        const events: Record<string, { t: string; s: number }> = {};
        for (const [id, v] of Object.entries(r.events ?? {})) if (v && v.s) events[id] = { t: String(v.t ?? ''), s: Number(v.s) };
        write(this.key('fav_teams'), Array.isArray(r.teams) ? r.teams : []);
        write(this.key('alert_events'), events);
        this.fxAt = 0;
        this.changed();
    }

    markRead(): void {
        write(this.bellKey() + '|seen', Date.now());
        this.changed();
    }

    /** una vez al abrir la app: revisa cada 20 s (sigue bien tras suspender la computadora) */
    start(): void {
        if (this.timer) return;
        let n = 0;
        // cada 20 s se revisa; cada 10 min (y al empezar) se baja lo de la nube
        this.timer = setInterval(() => {
            if (++n % 30 === 0) void this.pull();
            void this.tick();
        }, 20_000);
        setTimeout(() => void this.pull().then(() => this.tick()), 5_000);
    }

    /** los próximos 21 días del panel (cada 6 h; null = el panel no los tiene) */
    async fixtures(force = false): Promise<PanelSportsFixtures | null> {
        if (force || !this.fx || Date.now() - this.fxAt > FX_TTL) {
            const r = await this.sync.fetchSportsFixtures().catch(() => null);
            if (r) this.fx = r;
            this.fxAt = Date.now();
        }
        return this.fx;
    }

    private changed(): void {
        this.rev.update((n) => n + 1);
    }

    private askPermission(): void {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission();
    }

    async tick(now = Date.now()): Promise<void> {
        if (!sessionCredentials().username || !this.on()) return;
        const names = new Set(this.teams().map((t) => t.n));
        const m = this.marked();
        // marcados que ya pasaron: se olvidan
        for (const id of Object.keys(m)) if (m[id].s < now - 3 * 3600_000) delete m[id];
        write(this.key('alert_events'), m);
        if (!names.size && !Object.keys(m).length) return;
        const list: { id: string; t: string; s: number }[] = Object.entries(m).map(([id, v]) => ({ id, ...v }));
        if (names.size) {
            const fx = await this.fixtures();
            for (const e of fx?.events ?? []) {
                if (e.pp || id(e) in m || !(names.has(e.h) || names.has(e.a))) continue;
                list.push({ id: id(e), t: eventTitle(e), s: eventStart(e) });
            }
        }
        const fired = read<Record<string, number>>('mpx:alert_fired', {});
        for (const k of Object.keys(fired)) if (fired[k] < now - 2 * DAY) delete fired[k];
        for (const e of list) {
            for (const stage of STAGES) {
                const due = e.s - stage * 60_000;
                const k = `${e.id}|${stage}`;
                // a su hora (con 5 min de margen); uno viejo (la app estaba cerrada) no se avisa tarde
                if (now < due || now - due > GRACE || fired[k]) continue;
                fired[k] = now;
                this.fire(e.t, stage);
            }
        }
        write('mpx:alert_fired', fired);
    }

    private fire(title: string, stage: number): void {
        const text = this.translate.instant(stage === 30 ? 'MPX.ALERTS.M30' : stage === 10 ? 'MPX.ALERTS.M10' : 'MPX.ALERTS.LIVE');
        const list = [{ at: Date.now(), t: title, x: text }, ...this.bell()].slice(0, 100);
        write(this.bellKey(), list);
        this.changed();
        // con la app a la vista no sale la notificación del sistema: solo la campanita
        if (typeof document !== 'undefined' && document.hasFocus()) return;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
                new Notification(title, { body: text });
            } catch {
                /* sin notificaciones del sistema: queda en la campanita */
            }
        }
    }
}

function id(e: { id: string }): string {
    return String(e.id);
}
