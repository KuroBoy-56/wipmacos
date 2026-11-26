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
import { liveCards } from './live-sports.util';

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

    readonly cards = computed(() => (this.enabled() ? liveCards(this.live()?.events ?? [], this.map(), this.pref()) : []));

    setPref(sport: string): void {
        try {
            if (sport) localStorage.setItem(this.prefKey(), sport);
            else localStorage.removeItem(this.prefKey());
        } catch {
            /* sin almacenamiento: queda para esta vez */
        }
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
            const res = await this.sync.fetchSportsLive().catch(() => null);
            if (gen !== this.gen) return;
            // sin respuesta del panel: lo último que se tenía
            if (res) {
                this.live.set(res);
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
