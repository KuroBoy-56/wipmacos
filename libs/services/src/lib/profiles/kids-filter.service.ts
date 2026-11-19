import { computed, inject, Injectable, signal } from '@angular/core';
import { kidsBlockedName, kidsCatClass, KidsCatClass, kidsItemLevel, kidsRateKey, kidsRatePass, tenantStorageSuffix } from '@iptvnator/shared/interfaces';
import { PanelSyncService } from '../panel-sync/panel-sync.service';
import { ProfilesService } from './profiles.service';

/** Lo que el filtro necesita de una película o serie. */
export interface KidsTitle {
    id: string;
    name: string;
    categoryId: string;
    genre?: string;
    year?: string;
    tmdb?: string;
}

type Need = { t: 'm' | 's'; id?: string; n?: string; y?: string };
type Verdicts = Record<string, [string, number]>;

const TTL: Record<string, number> = { ok: 30 * 86400, no: 30 * 86400, '?': 7 * 86400, wait: 120 };
const EVERY_MS = 15_000;
const MAX_KEEP = 20_000;

/**
 * Perfil infantil (docs/PERFILES.md del panel, sección 5): solo contenido para niños y de Disney. El catálogo de la
 * tienda sigue siendo el completo (el principal nunca lo ve recortado); las páginas piden aquí lo que ve el infantil.
 * Lo dudoso se ve solo con el «ok» de TMDB (api/kids_rate.php), pedido en segundo plano y guardado por distribuidor.
 */
@Injectable({ providedIn: 'root' })
export class KidsFilterService {
    private readonly profiles = inject(ProfilesService);
    private readonly sync = inject(PanelSyncService);

    /** el perfil elegido es infantil */
    readonly active = this.profiles.kids;
    /** sube cuando llegan veredictos nuevos de TMDB: las listas se vuelven a armar */
    readonly rev = signal(0);
    /** categorías de TV en vivo para niños en la lista (null = todavía no se sabe) */
    private readonly liveCount = signal<number | null>(null);
    /** perfil infantil y la lista no tiene canales para niños: TV en vivo no se muestra */
    readonly noLive = computed(() => this.active() && this.liveCount() === 0);

    private verdicts: Verdicts | null = null;
    private verdictsKey = '';
    private pending: Record<string, Need> = {};
    private running = false;
    private lastRun = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private readonly allowedIds: Record<'vod' | 'series', Set<string> | null> = { vod: null, series: null };

    /** Películas o series que ve el perfil infantil (sin perfil infantil, todas). */
    titles<T>(kind: 'vod' | 'series', items: readonly T[], categories: readonly { id: string; name: string }[], read: (item: T) => KidsTitle): T[] {
        if (!this.active()) return [...items];
        this.rev();
        const cls = new Map<string, KidsCatClass>(categories.map((c) => [c.id, kidsCatClass(c.name)]));
        const out: T[] = [];
        const ids = new Set<string>();
        const need: Record<string, Need> = {};
        for (const item of items) {
            const t = read(item);
            const level = kidsItemLevel(t.name, t.genre, [cls.get(t.categoryId) ?? '']);
            if (!level) continue;
            const q = kidsRateKey(kind, t.name, t.year, t.tmdb);
            const v = this.verdict(q);
            if (!v && !need[q]) need[q] = { t: kind === 'series' ? 's' : 'm', ...(/^[1-9]\d{0,8}$/.test(t.tmdb ?? '') ? { id: t.tmdb } : { n: t.name, y: t.year ?? '' }) };
            if (!kidsRatePass(level, v)) continue;
            out.push(item);
            ids.add(t.id);
        }
        if (items.length) this.allowedIds[kind] = ids;
        this.ask(need);
        return out;
    }

    /** TV en vivo: solo las categorías de niños (sin ninguna, TV en vivo no se muestra). */
    liveCategories<T>(categories: readonly T[], nameOf: (c: T) => string): T[] {
        if (!this.active()) return [...categories];
        const out = categories.filter((c) => kidsCatClass(nameOf(c), true) === 'kids');
        // se llama dentro de computed(): la señal se actualiza después
        if (categories.length) queueMicrotask(() => this.liveCount.set(out.length));
        return out;
    }

    /** un canal de una categoría de niños que igual no se muestra (+18, XXX…) */
    liveChannelOk(name: string): boolean {
        return !this.active() || !kidsBlockedName(name);
    }

    /** ¿se puede abrir esta ficha? (lo que no pasa el filtro no se abre aunque llegue por otro camino) */
    allows(kind: 'vod' | 'series', id: string | number): boolean {
        if (!this.active()) return true;
        const set = this.allowedIds[kind];
        return !set || set.has(String(id));
    }

    private storeKey(): string {
        return 'kids_rate' + tenantStorageSuffix();
    }

    private load(): Verdicts {
        const key = this.storeKey();
        if (this.verdicts && this.verdictsKey === key) return this.verdicts;
        this.verdictsKey = key;
        try {
            this.verdicts = JSON.parse(localStorage.getItem(key) || '{}') as Verdicts;
        } catch {
            this.verdicts = {};
        }
        return this.verdicts;
    }

    /** 'ok' | 'no' | '?' | '' (no se sabe todavía o ya venció) */
    private verdict(q: string): string {
        const e = this.load()[q];
        if (!e) return '';
        const [v, at] = e;
        if (Date.now() / 1000 - at > (TTL[v] ?? 0)) return '';
        return v === 'wait' ? '' : v;
    }

    private ask(need: Record<string, Need>): void {
        for (const q of Object.keys(need)) if (!this.verdict(q)) this.pending[q] = need[q];
        this.schedule(0);
    }

    private schedule(ms: number): void {
        if (this.timer || this.running || !Object.keys(this.pending).length) return;
        const wait = Math.max(ms, this.lastRun + EVERY_MS - Date.now(), 0);
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.run();
        }, wait);
    }

    /** hasta 400 títulos por pedido y 3 pedidos por vez; lo que el panel deja en «wait» se vuelve a pedir */
    private async run(): Promise<void> {
        this.running = true;
        this.lastRun = Date.now();
        let changed = false;
        const asked = this.pending;
        this.pending = {};
        try {
            const all = Object.entries(asked);
            for (let i = 0; i < all.length && i < 1200; i += 400) {
                const items = all.slice(i, i + 400).map(([q, x]) => ({ q, ...x }));
                const j = await this.sync.kidsRate<{ success?: boolean; r?: Record<string, string> }>(items).catch(() => null);
                if (!j?.success || !j.r) {
                    for (const [q, x] of all.slice(i)) this.pending[q] = x;
                    break;
                }
                const map = this.load();
                const now = Math.floor(Date.now() / 1000);
                for (const [q, v] of Object.entries(j.r)) {
                    if (!(v in TTL)) continue;
                    if (v === 'wait') {
                        if (asked[q]) this.pending[q] = asked[q];
                    } else if (!map[q] || map[q][0] !== v) changed = true;
                    map[q] = [v, now];
                }
            }
            const map = this.load();
            const keys = Object.keys(map);
            if (keys.length > MAX_KEEP) for (const q of keys.slice(0, keys.length - MAX_KEEP)) delete map[q];
            try {
                localStorage.setItem(this.storeKey(), JSON.stringify(map));
            } catch {
                // sin almacenamiento: valen hasta cerrar la app
            }
        } finally {
            this.running = false;
        }
        if (changed) this.rev.update((n) => n + 1);
        this.schedule(EVERY_MS);
    }
}
