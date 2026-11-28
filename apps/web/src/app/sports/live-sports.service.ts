import { computed, inject, Injectable, signal } from '@angular/core';
import {
    lineKey,
    PanelBrandingService,
    PanelSportsLive,
    PanelSyncService,
    ProfilesService,
    sessionCredentials,
} from '@iptvnator/services';
import { SportsChannelsMap, SportsDataService } from './sports-data.service';
import { FavLeague, liveCards } from './live-sports.util';

/**
 * «En vivo ahora» de Inicio (en el lugar de Plataformas), como Android: partidos que se están jugando con su marcador
 * (api/sports_live.php), solo con perfiles activos (no el infantil) y Deportes encendido para el distribuidor; el panel
 * dice enabled false sin una clave de pago de TheSportsDB propia (la del dueño o la del distribuidor, nunca la de otro).
 * Se pregunta cada ttl (30 s) solo mientras Inicio está abierto (attach) y cada partido va con el canal exacto de la
 * lista del cliente: sin canal, no sale.
 */
@Injectable({ providedIn: 'root' })
export class LiveSportsService {
    private readonly sync = inject(PanelSyncService);
    private readonly data = inject(SportsDataService);
    private readonly profiles = inject(ProfilesService);
    private readonly branding = inject(PanelBrandingService);

    private users = 0;
    private gen = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private readonly prefTick = signal(0);

    readonly live = signal<PanelSportsLive | null>(null);
    readonly map = signal<SportsChannelsMap | null>(null);
    /** el último partido que se abrió: al volver a Inicio recupera el foco */
    lastId = '';

    /** perfiles activos con un perfil elegido que no es infantil, y Deportes encendido (features.sports) */
    readonly gated = computed(
        () => this.profiles.needed() && !!this.profiles.profile() && !this.profiles.kids() && this.branding.features().sports !== false
    );
    /** la fila existe (y Plataformas no): el panel tiene una clave de pago para este cliente */
    readonly enabled = computed(() => this.gated() && !!this.live()?.enabled);

    private readonly prefKey = computed(() => `mpx:live_sport|${lineKey(sessionCredentials())}|${this.profiles.profile()?.id ?? ''}`);
    /** Ajustes › Deporte preferido, por línea y perfil ('' = todos) */
    readonly pref = computed(() => {
        this.prefTick();
        try {
            return localStorage.getItem(this.prefKey()) ?? '';
        } catch {
            return '';
        }
    });

    private readonly leaguesKey = computed(() => `mpx:live_lg|${lineKey(sessionCredentials())}|${this.profiles.profile()?.id ?? ''}`);
    /** Ajustes › Ligas favoritas, por línea y perfil ([] = todas) */
    readonly leagues = computed<FavLeague[]>(() => {
        this.prefTick();
        try {
            const j = JSON.parse(localStorage.getItem(this.leaguesKey()) || '[]');
            return Array.isArray(j) ? j.filter((x) => x && typeof x.id === 'string' && x.id) : [];
        } catch {
            return [];
        }
    });

    readonly cards = computed(() =>
        this.enabled() ? liveCards(this.live()?.events ?? [], this.map(), this.pref(), Date.now(), new Set(this.leagues().map((l) => l.id))) : []
    );

    private readonly platKey = computed(() => `mpx:plat_cards|${lineKey(sessionCredentials())}|${this.profiles.profile()?.id ?? ''}`);
    /** Ajustes › Habilitar tarjetas de plataformas: con la fila en vivo, las plataformas vuelven debajo (por línea y perfil) */
    readonly platformCards = computed(() => {
        this.prefTick();
        try {
            return this.branding.platforms() && localStorage.getItem(this.platKey()) === '1';
        } catch {
            return false;
        }
    });

    private readonly availKey = computed(() => `mpx:live_avail|${lineKey(sessionCredentials())}`);
    /**
     * con perfiles y partidos en vivo del panel, Inicio no muestra las plataformas (salvo «Habilitar tarjetas de
     * plataformas»). Mientras el panel no contesta vale lo de la última vez para esta línea: no aparecen y se van.
     */
    readonly hidesPlatforms = computed(() => {
        if (!this.gated() || this.platformCards()) return false;
        const l = this.live();
        if (l) return l.enabled;
        try {
            return localStorage.getItem(this.availKey()) !== '0';
        } catch {
            return true;
        }
    });

    setPlatformCards(on: boolean): void {
        try {
            if (on) localStorage.setItem(this.platKey(), '1');
            else localStorage.removeItem(this.platKey());
        } catch {
            /* sin almacenamiento: queda para esta vez */
        }
        this.prefTick.update((n) => n + 1);
    }

    setLeagues(list: FavLeague[]): void {
        this.writeLeagues(list);
        this.prefTick.update((n) => n + 1);
        this.savePrefs();
    }

    /** name = how the sport is shown on the TVs (the label in the app language when it was picked) */
    setPref(sport: string, name = ''): void {
        // las ligas favoritas de otra disciplina ya no tienen sentido
        if (sport) this.writeLeagues(this.leagues().filter((l) => l.sp === sport));
        this.writePref(sport, sport ? name : '');
        this.prefTick.update((n) => n + 1);
        this.savePrefs();
    }

    private writeLeagues(list: FavLeague[]): void {
        try {
            if (list.length) localStorage.setItem(this.leaguesKey(), JSON.stringify(list.map(({ id, n, b, sp }) => ({ id, n, b, sp }))));
            else localStorage.removeItem(this.leaguesKey());
        } catch {
            /* sin almacenamiento: queda para esta vez */
        }
    }

    private writePref(sport: string, name: string): void {
        try {
            if (sport) localStorage.setItem(this.prefKey(), sport);
            else localStorage.removeItem(this.prefKey());
            if (name) localStorage.setItem(this.prefKey() + '|n', name);
            else localStorage.removeItem(this.prefKey() + '|n');
        } catch {
            /* sin almacenamiento: queda para esta vez */
        }
    }

    // ---------- Deporte preferido y Ligas favoritas en la nube («prefs» de api/alerts.php) ----------
    // Lo que se elige aquí lo ven las TV y el celular de la misma línea y perfil, y al revés. La nube manda; si nunca se
    // guardó (at = 0) se sube lo que esta computadora tenía guardado de antes.
    private prefsPush: ReturnType<typeof setTimeout> | null = null;
    private prefsAt = 0;
    private prefsWho = '';

    /** sube lo elegido aquí (varios cambios seguidos = un pedido) */
    private savePrefs(): void {
        if (!this.gated()) return;
        if (this.prefsPush) clearTimeout(this.prefsPush);
        this.prefsPush = setTimeout(() => {
            this.prefsPush = null;
            const sp = this.pref();
            let spn = '';
            try {
                spn = sp ? (localStorage.getItem(this.prefKey() + '|n') ?? '') : '';
            } catch {
                /* sin almacenamiento */
            }
            const lg = this.leagues().map(({ id, n, sp: s }) => ({ id, n, sp: s }));
            void Promise.resolve()
                .then(() => this.sync.alertsRequest('set_prefs', { prefs: { sp, spn, lg } }))
                .catch(() => null);
        }, 700);
    }

    /** baja lo de la nube: cada 5 min con Inicio abierto, enseguida con otro perfil y al abrir Ajustes (force) */
    async pullPrefs(force = false): Promise<void> {
        if (!this.gated()) return;
        const who = this.prefKey();
        if (!force && who === this.prefsWho && Date.now() - this.prefsAt < 300_000) return;
        this.prefsWho = who;
        this.prefsAt = Date.now();
        type Prefs = { sp?: string; spn?: string; lg?: { id?: string; n?: string; sp?: string }[]; at?: number };
        const r = await this.sync.alertsRequest<{ success?: boolean; enabled?: boolean; prefs?: Prefs }>(null);
        const p = r?.success && r.enabled ? r.prefs : null;
        // un cambio de aquí todavía sin subir gana (si no, la respuesta vieja lo borraría)
        if (!p || this.prefsPush || who !== this.prefKey()) return;
        if (!(Number(p.at) > 0)) {
            if (this.pref() || this.leagues().length) this.savePrefs();
            return;
        }
        const sp = String(p.sp ?? '');
        const mine = new Map(this.leagues().map((l) => [l.id, l]));
        const lg: FavLeague[] = (Array.isArray(p.lg) ? p.lg : [])
            .filter((x) => x && x.id)
            .map((x) => ({ id: String(x.id), n: String(x.n ?? ''), b: mine.get(String(x.id))?.b, sp: String(x.sp ?? '') }));
        if (sp === this.pref() && lg.map((l) => l.id).join(',') === this.leagues().map((l) => l.id).join(',')) return;
        this.writeLeagues(lg);
        this.writePref(sp, sp ? String(p.spn ?? '') : '');
        this.prefTick.update((n) => n + 1);
    }

    /** Inicio abierto: se pregunta ya y cada ttl; lo devuelto suelta la fila */
    attach(): () => void {
        if (this.users++ === 0) void this.tick(++this.gen);
        let done = false;
        return () => {
            if (done) return;
            done = true;
            if (--this.users === 0) {
                this.gen++;
                if (this.timer) clearTimeout(this.timer);
                this.timer = null;
            }
        };
    }

    /** Ajustes sin haber pasado por Inicio: una sola pregunta para saber si se muestra «Deporte preferido» */
    async ensure(): Promise<void> {
        if (this.gated() && !this.live()) this.live.set(await this.sync.fetchSportsLive().catch(() => null));
    }

    private async tick(gen: number): Promise<void> {
        let ttl = 30;
        if (this.gated()) {
            // el deporte y las ligas elegidos en la TV o el celular (cada 5 min)
            void this.pullPrefs().catch(() => undefined);
            const res = await this.sync.fetchSportsLive().catch(() => null);
            if (gen !== this.gen) return;
            // sin respuesta del panel: lo último que se tenía
            if (res) {
                this.live.set(res);
                try {
                    localStorage.setItem(this.availKey(), res.enabled ? '1' : '0');
                } catch {
                    /* sin almacenamiento */
                }
                ttl = res.ttl;
                if (res.enabled && res.events.length) {
                    const map = await this.data.matchEvents(res.events, res.match).catch(() => null);
                    if (gen !== this.gen) return;
                    this.map.set(map);
                }
            }
        }
        if (gen === this.gen) this.timer = setTimeout(() => void this.tick(gen), ttl * 1000);
    }
}
