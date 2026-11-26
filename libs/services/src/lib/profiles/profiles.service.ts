import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { isSessionDemo, loadKidsRules, rememberKidsRules, tenantStorageSuffix } from '@iptvnator/shared/interfaces';
import { lineKey } from '../panel-sync/panel-progress.client';
import { onPanelProfileGone, setPanelProfile } from '../panel-sync/panel-profile';
import { PanelSyncService, sessionCredentials } from '../panel-sync/panel-sync.service';
import type { SyncUserCredentials } from '../panel-sync/panel-sync.types';
import { parseProfiles, Profile, ProfileResult, ProfilesData } from './profiles.types';

/** Si el panel no contesta en este tiempo se entra con el principal (la app nunca se queda esperando). */
export const PROFILES_WAIT_MS = 6000;

function readLocal(key: string): string {
    try {
        return localStorage.getItem(key) || '';
    } catch {
        return '';
    }
}

function writeLocal(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // sin almacenamiento: vale para esta vez
    }
}

/** Conexiones de la línea (user_info.max_connections): el panel las usa si no llega al servidor IPTV. */
export function rememberLineMax(creds: SyncUserCredentials, max: number): void {
    const line = lineKey(creds);
    if (line && max > 0) writeLocal('pf_max|' + line, String(Math.min(5, Math.floor(max))));
}

/**
 * Perfiles de la línea (docs/PERFILES.md del panel). Todo lo nuevo (pantalla «¿Quién está viendo?», la barra con el
 * avatar, el perfil infantil) solo aparece con los perfiles encendidos por el dueño y una línea de 2 o más conexiones.
 * El perfil elegido vive en memoria: cada inicio de la app vuelve a preguntar (el último usado queda con el foco).
 */
@Injectable({ providedIn: 'root' })
export class ProfilesService {
    private readonly sync = inject(PanelSyncService);
    private line = '';
    private checked: Promise<void> | null = null;

    /** lo último que dijo el panel (null = no se sabe, o el panel no contestó) */
    readonly data = signal<ProfilesData | null>(null);
    /** el perfil elegido en esta sesión de la app */
    readonly profile = signal<Profile | null>(null);
    /** sube cuando el panel dice que el perfil elegido ya no existe (410): otra vez «¿Quién está viendo?» */
    readonly gone = signal(0);

    /** el dueño encendió los perfiles para esta línea */
    readonly enabled = computed(() => !!this.data()?.enabled);
    /** la línea elige perfil: encendidos, más de una conexión y no es una DEMO */
    readonly needed = computed(() => {
        const d = this.data();
        return !!d && d.enabled && d.max > 1 && d.profiles.length > 0 && !isSessionDemo();
    });
    /** el perfil elegido es infantil */
    readonly kids = computed(() => this.needed() && !!this.profile()?.kids);

    constructor() {
        // <html data-prof>: hay un perfil elegido que no es el infantil (la página Deportes pone el fondo de estadio)
        effect(() => document.documentElement.toggleAttribute('data-prof', !!this.profile() && !this.kids()));
        onPanelProfileGone(() => {
            this.forget();
            this.gone.update((n) => n + 1);
            void this.refresh();
        });
    }

    private lineId(): string {
        return lineKey(sessionCredentials()) + tenantStorageSuffix();
    }

    /** Otra línea (o otro distribuidor): se empieza de cero. */
    private syncLine(): void {
        const line = this.lineId();
        if (line === this.line) return;
        this.line = line;
        this.checked = null;
        this.data.set(null);
        this.forget();
    }

    /**
     * Antes de entrar al workspace: la primera vez de la sesión pregunta al panel. Si la última vez los perfiles estaban
     * apagados para esta línea, no espera (como siempre) y lo que conteste vale para el próximo inicio: si el dueño los
     * enciende, se ven la próxima vez que se abra la app, nunca con un salto en pleno uso.
     */
    ensure(): Promise<void> {
        this.syncLine();
        if (this.checked) return this.checked;
        const onKey = 'pf_on|' + this.line;
        let late = readLocal(onKey) === '0';
        const ask = this.fetch().then((d) => {
            if (d) writeLocal(onKey, d.enabled ? '1' : '0');
            // a tiempo: se usa ahora; tarde (o apagados la vez anterior): solo si siguen apagados, el resto al próximo inicio
            if (d && (!late || !d.enabled)) this.apply(d);
        });
        this.checked = late
            ? Promise.resolve()
            : Promise.race([ask, new Promise<void>((r) => setTimeout(r, PROFILES_WAIT_MS))]).then(() => {
                  late = true;
              });
        return this.checked;
    }

    private async fetch(): Promise<ProfilesData | null> {
        const max = readLocal('pf_max|' + lineKey(sessionCredentials()));
        return parseProfiles(await this.sync.profilesRequest(null, max ? { max } : {}).catch(() => null));
    }

    /** La lista otra vez del panel (al abrir la pantalla de perfiles o después de un 410). */
    async refresh(): Promise<ProfilesData | null> {
        const d = await this.fetch();
        if (d) this.apply(d);
        return d;
    }

    private apply(d: ProfilesData): void {
        if (d.kidsRules) rememberKidsRules(d.kidsRules);
        this.data.set(d);
        const cur = this.profile();
        if (cur) {
            const same = d.profiles.find((p) => p.id === cur.id) ?? null;
            if (same) this.profile.set(same);
            else this.forget();
        }
    }

    /** create, update, delete, pin_set, pin_clear, pin_check, pin_reset (sección 3 del contrato) */
    async act(action: string, fields: Record<string, unknown>): Promise<ProfileResult> {
        const j = await this.sync.profilesRequest<Record<string, unknown>>(action, fields).catch(() => null);
        const d = parseProfiles(j);
        if (d) {
            this.apply(d);
            return { ok: true, data: d };
        }
        if (j && j['success'] === false) return { ok: false, error: String(j['error'] ?? ''), code: String(j['code'] ?? '') };
        return { ok: false, error: '', code: 'net' };
    }

    /** El perfil elegido: sus Continuar viendo y Mi lista (progress.php con «profile»). */
    choose(p: Profile): void {
        writeLocal('pf_last|' + this.line, p.id);
        if (p.kids) loadKidsRules();
        setPanelProfile(p.id);
        this.profile.set(p);
    }

    forget(): void {
        setPanelProfile('');
        this.profile.set(null);
    }

    /** el último perfil usado en este equipo (el foco empieza ahí) */
    lastId(): string {
        return readLocal('pf_last|' + this.lineId());
    }
}
