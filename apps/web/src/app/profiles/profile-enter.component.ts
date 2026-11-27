import { ChangeDetectionStrategy, Component, computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';

interface Entering {
    name: string;
    avatar: string;
    /** dónde estaba su avatar en «¿Quién está viendo?» (desde ahí va al centro) */
    from: DOMRect | null;
    at: number;
}

// al menos 5 s (como las TV): Inicio, «En vivo ahora» y Explorar se arman detrás; si el catálogo todavía carga, hasta
// que termine (como mucho 15 s)
const MIN_MS = 5_000;
const MAX_MS = 15_000;

/**
 * Al elegir un perfil (como Android y Netflix): su avatar va al centro con el circulito debajo mientras en segundo
 * plano se arma Inicio (catálogo y, en el perfil infantil, el filtro). Se quita cuando el catálogo está listo y pasaron
 * al menos 5 s (o a los 15 s).
 */
@Injectable({ providedIn: 'root' })
export class ProfileEnterService {
    private readonly store = inject(XtreamStore);
    readonly entering = signal<Entering | null>(null);
    private readonly ready = computed(() => this.store.isContentInitialized() && !this.store.isLoadingContent());

    constructor() {
        effect(() => {
            const e = this.entering();
            if (!e || !this.ready()) return;
            untracked(() => setTimeout(() => this.entering() === e && this.entering.set(null), Math.max(150, MIN_MS - (Date.now() - e.at))));
        });
    }

    begin(name: string, avatar: string, el: Element | null): void {
        const e: Entering = { name, avatar, from: el?.getBoundingClientRect() ?? null, at: Date.now() };
        this.entering.set(e);
        setTimeout(() => this.entering() === e && this.entering.set(null), MAX_MS);
    }
}

@Component({
    selector: 'app-profile-enter',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (svc.entering(); as e) {
            <div class="pe" role="status" [attr.aria-label]="e.name">
                <img class="pe-av" [src]="e.avatar" alt="" [style]="pos(e)" />
                <div class="pe-below" [class.on]="moved()">
                    <b>{{ e.name }}</b>
                    <span class="pe-spin" aria-hidden="true"></span>
                </div>
            </div>
        }
    `,
    styles: `
        .pe { position: fixed; inset: 0; z-index: 2000; background: var(--nf-bg, #141414); animation: peFade 0.25s ease-out; }
        @keyframes peFade { from { background: transparent; } }
        .pe-av { position: absolute; object-fit: cover; border-radius: 10px; background: #333; transition: all 0.48s cubic-bezier(0.4, 0, 0.2, 1); }
        .pe-below { position: absolute; left: 0; right: 0; top: calc(50% + 80px); display: flex; flex-direction: column; align-items: center; gap: 22px; color: #fff; opacity: 0; transition: opacity 0.25s 0.3s; }
        .pe-below.on { opacity: 1; }
        .pe-below b { font-size: 22px; }
        .pe-spin { width: 42px; height: 42px; border-radius: 50%; border: 3px solid rgba(255, 255, 255, 0.15); border-top-color: var(--nf-red, #e50914); animation: peSpin 0.9s linear infinite; }
        @keyframes peSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .pe-av { transition: none; } .pe-spin { animation-duration: 2s; } }
    `,
})
export class ProfileEnterComponent {
    protected readonly svc = inject(ProfileEnterService);
    /** el primer cuadro va en su lugar de antes; el siguiente, al centro (la transición CSS lo mueve) */
    protected readonly moved = signal(false);

    constructor() {
        effect(() => {
            if (!this.svc.entering()) return untracked(() => this.moved.set(false));
            untracked(() => requestAnimationFrame(() => requestAnimationFrame(() => this.moved.set(true))));
        });
    }

    protected pos(e: Entering): string {
        const size = 150;
        if (!this.moved() && e.from) return `left:${e.from.left}px;top:${e.from.top}px;width:${e.from.width}px;height:${e.from.height}px`;
        return `left:calc(50% - ${size / 2}px);top:calc(50% - ${size}px);width:${size}px;height:${size}px`;
    }
}
