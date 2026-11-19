import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, OnInit, signal, untracked, viewChildren, ViewEncapsulation } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PanelBrandingService, Profile, ProfilesService } from '@iptvnator/services';
import { AppConfig } from '../../environments/environment';
import { ProfileEditComponent } from './profile-edit.component';
import { ProfilePinComponent } from './profile-pin.component';
import { ProfilesHighlight, weekHighlight } from './profiles-highlight';

type Ask = { p: Profile; then: 'select' | 'edit' };

/**
 * «¿Quién está viendo?» (docs/PERFILES.md del panel, sección 6), como la web player en horizontal: perfiles en columna
 * a la izquierda, «Salir» arriba a la izquierda, el logo arriba a la derecha, el título arriba al centro, «Administrar
 * perfiles» debajo de los perfiles, de fondo lo más destacado de la semana de TMDB con solo su nombre y su calificación
 * (abajo a la derecha) y la versión abajo a la izquierda. El mouse sobre un perfil solo lo agranda (sin recuadro).
 */
@Component({
    selector: 'app-profiles-page',
    standalone: true,
    imports: [MatIcon, TranslatePipe, ProfileEditComponent, ProfilePinComponent],
    // los diálogos (otros componentes) usan las mismas clases pf-*
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './profiles-page.component.html',
    styleUrl: './profiles-page.component.scss',
})
export class ProfilesPageComponent implements OnInit {
    protected readonly profiles = inject(ProfilesService);
    protected readonly branding = inject(PanelBrandingService);
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly translate = inject(TranslateService);

    protected readonly version = AppConfig.version;
    protected readonly data = this.profiles.data;
    protected readonly managing = signal(false);
    protected readonly edit = signal<{ p: Profile | null; pin: string } | null>(null);
    protected readonly ask = signal<Ask | null>(null);
    protected readonly highlight = signal<ProfilesHighlight | null>(null);
    protected readonly bgReady = signal(false);
    protected readonly logoFailed = signal(false);
    protected readonly list = computed(() => this.data()?.profiles ?? []);
    /** PIN ya comprobado en esta pantalla (para editar un perfil bloqueado); nunca se guarda */
    private readonly pins = new Map<string, string>();
    private readonly items = viewChildren<ElementRef<HTMLButtonElement>>('item');
    private focusId = '';

    constructor() {
        // el foco empieza en el último perfil usado en el equipo (con el teclado o el control)
        effect(() => {
            const els = this.items();
            if (!els.length) return;
            untracked(() => {
                const want = this.list().findIndex((p) => p.id === this.focusId);
                setTimeout(() => els[Math.max(0, want)]?.nativeElement.focus({ preventScroll: true }));
            });
        });
        // los perfiles se apagaron o la línea quedó con una conexión: al inicio como siempre
        effect(() => {
            if (this.data() && !this.profiles.needed()) untracked(() => this.go());
        });
    }

    ngOnInit(): void {
        this.managing.set(this.route.snapshot.queryParamMap.get('manage') === '1');
        this.focusId = this.profiles.profile()?.id || this.profiles.lastId();
        void this.profiles.refresh();
        void weekHighlight().then((h) => this.highlight.set(h));
    }

    private t(key: string, params?: Record<string, string>): string {
        return this.translate.instant('MPX.PROFILES.' + key, params);
    }

    /** A la pantalla que se pidió (o al inicio). */
    private go(): void {
        const next = this.route.snapshot.queryParamMap.get('next');
        void this.router.navigateByUrl(next && next.startsWith('/workspace') ? next : '/workspace');
    }

    protected enter(p: Profile): void {
        this.profiles.choose(p);
        this.go();
    }

    protected pick(p: Profile): void {
        this.focusId = p.id;
        if (this.managing()) {
            if (p.locked && !this.pins.has(p.id)) this.ask.set({ p, then: 'edit' });
            else this.edit.set({ p, pin: this.pins.get(p.id) ?? '' });
        } else if (p.locked) this.ask.set({ p, then: 'select' });
        else this.enter(p);
    }

    protected pinTitle(a: Ask): string {
        return this.t(a.then === 'select' ? 'PIN_ENTER' : 'PIN_OF', { n: a.p.name });
    }

    /** el PIN se comprueba en el panel (5 intentos equivocados = esperar 5 minutos) */
    protected readonly checkPin = async (pin: string): Promise<string> => {
        const a = this.ask();
        if (!a) return '';
        const r = await this.profiles.act('pin_check', { id: a.p.id, pin });
        if (!r.ok) return r.error || this.t('NET');
        this.pins.set(a.p.id, pin);
        this.next(a, r.data.profiles.find((x) => x.id === a.p.id) ?? a.p, pin);
        return '';
    };

    /** PIN olvidado: la contraseña de la línea lo quita */
    protected readonly resetPin = async (pass: string): Promise<string> => {
        const a = this.ask();
        if (!a) return '';
        const r = await this.profiles.act('pin_reset', { id: a.p.id, pass });
        if (!r.ok) return r.error || this.t('NET');
        this.pins.set(a.p.id, '');
        this.next(a, r.data.profiles.find((x) => x.id === a.p.id) ?? a.p, '');
        return '';
    };

    private next(a: Ask, p: Profile, pin: string): void {
        this.ask.set(null);
        if (a.then === 'select') this.enter(p);
        else this.edit.set({ p, pin });
    }

    protected saved(e: { id: string; pin: string }): void {
        if (e.id) this.pins.set(e.id, e.pin);
        this.focusId = e.id || this.focusId;
        this.edit.set(null);
    }

    protected deleted(id: string): void {
        this.pins.delete(id);
        this.focusId = this.list()[0]?.id ?? '';
        this.edit.set(null);
    }

    protected toggleManage(): void {
        this.managing.update((m) => !m);
    }

    /** Salir: cierra la app (en el navegador, al inicio de sesión) */
    protected exit(): void {
        if ((window as unknown as { electron?: unknown }).electron) window.close();
        else void this.router.navigateByUrl('/login');
    }

    /** flechas: arriba / abajo por la columna; Esc sale de «Administrar» */
    protected keys(e: KeyboardEvent): void {
        if (this.edit() || this.ask()) return;
        if (e.key === 'Escape' && this.managing()) {
            this.managing.set(false);
            return;
        }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        const els = this.items().map((x) => x.nativeElement);
        const i = els.indexOf(document.activeElement as HTMLButtonElement);
        if (i < 0) return;
        const j = Math.max(0, Math.min(els.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        els[j].focus();
        e.preventDefault();
    }
}
