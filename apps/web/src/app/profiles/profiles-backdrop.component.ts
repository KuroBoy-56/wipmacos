import { ChangeDetectionStrategy, Component, DestroyRef, effect, ElementRef, inject, input, signal, untracked, viewChild, ViewEncapsulation } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { highlightSources, ProfilesHighlight } from './profiles-highlight';

/** Cada destacado se ve 10 s; el fundido dura lo mismo que la transición de .pf-bg. */
export const SLIDE_MS = 10_000;
const FADE_MS = 850;
const CAPTION_MS = 220;

/**
 * Fondo de «¿Quién está viendo?» como la web player 2.7.4 (profiles.js, slides()): pasa por lo más destacado de la
 * semana, 10 s cada uno, y después del último vuelve al primero. Dos capas: la nueva se pide en la de abajo y, cuando ya
 * cargó, aparece con un fundido encima de la anterior (nunca un hueco negro); si una dirección falla, la siguiente, y si
 * no carga ninguna se salta ese título. El nombre y la calificación de abajo a la derecha cambian con la imagen.
 */
@Component({
    selector: 'app-profiles-backdrop',
    standalone: true,
    imports: [TranslatePipe],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    // las capas van en el mismo apilamiento que el resto de la pantalla (.pf-side, .pf-top…)
    host: { style: 'display: contents' },
    template: `
        <img #a class="pf-bg" alt="" aria-hidden="true" decoding="async" />
        <img #b class="pf-bg" alt="" aria-hidden="true" decoding="async" />
        <div class="pf-shade"></div>
        @if (shown(); as h) {
            <aside class="pf-hl" [class.pf-hl-off]="captionOff()">
                <b class="pf-hl-t">{{ h.title }}</b>
                <span class="pf-hl-m">
                    @if (h.rating > 0) {
                        <span class="pf-hl-r"><i aria-hidden="true">★</i> {{ h.rating.toFixed(1) }}</span>
                    }
                    @if (h.year) {
                        <span>{{ h.year }}</span>
                    }
                    <span>{{ (h.kind === 'tv' ? 'MPX.PROFILES.SERIES' : 'MPX.PROFILES.MOVIE') | translate }}</span>
                </span>
            </aside>
        }
    `,
})
export class ProfilesBackdropComponent {
    readonly items = input<ProfilesHighlight[]>([]);

    protected readonly shown = signal<ProfilesHighlight | null>(null);
    protected readonly captionOff = signal(false);
    private readonly a = viewChild.required<ElementRef<HTMLImageElement>>('a');
    private readonly b = viewChild.required<ElementRef<HTMLImageElement>>('b');

    /** la capa que se ve (1 = ninguna todavía: el primero va en la 0) */
    private top = 1;
    private idx = -1;
    private gen = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private started = false;
    private onVisible: (() => void) | null = null;

    constructor() {
        effect(() => {
            if (this.items().length && !this.started) {
                this.started = true;
                untracked(() => this.show(0, 1));
            }
        });
        inject(DestroyRef).onDestroy(() => {
            this.gen++;
            clearTimeout(this.timer);
            if (this.onVisible) document.removeEventListener('visibilitychange', this.onVisible);
        });
    }

    private layers(): HTMLImageElement[] {
        return [this.a().nativeElement, this.b().nativeElement];
    }

    /** pone el título i en la capa de abajo y, cuando cargó, la sube con el fundido; tries = cuántos se saltaron */
    private show(i: number, tries: number): void {
        const list = this.items();
        if (!list.length || tries > list.length) return; // ninguno carga (sin red): queda el último que se vio
        if (document.hidden) {
            // con la ventana minimizada no se cambia (ni se descarga) nada
            this.onVisible = () => {
                if (document.hidden) return;
                document.removeEventListener('visibilitychange', this.onVisible as () => void);
                this.onVisible = null;
                this.show(i, tries);
            };
            document.addEventListener('visibilitychange', this.onVisible);
            return;
        }
        const n = ((i % list.length) + list.length) % list.length;
        const it = list[n];
        const my = ++this.gen;
        const [la, lb] = this.layers();
        const under = this.top === 0 ? lb : la;
        const over = this.top === 0 ? la : lb;
        const src = highlightSources(it);
        const urls = [src.fhd, src.orig].filter((u, k, all) => u && all.indexOf(u) === k);
        under.onload = () => {
            if (my !== this.gen) return;
            under.onload = under.onerror = null;
            // un cuadro con la imagen en 0 antes del fundido (si ya estaba guardada, el fundido igual se ve)
            requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                    if (my !== this.gen) return;
                    under.classList.add('up', 'ok');
                    over.classList.remove('up');
                    this.top = this.top === 0 ? 1 : 0;
                    this.idx = n;
                    this.caption(it);
                    setTimeout(() => {
                        if (my === this.gen) over.classList.remove('ok');
                    }, FADE_MS + 50);
                    this.schedule();
                })
            );
        };
        under.onerror = () => {
            if (my !== this.gen) return;
            under.removeAttribute('srcset');
            urls.shift();
            if (urls.length) {
                under.src = urls[0];
                return;
            }
            under.onload = under.onerror = null;
            this.idx = n; // no carga: se salta
            this.show(n + 1, tries + 1);
        };
        under.classList.remove('ok', 'up');
        under.sizes = '100vw';
        if (src.orig !== src.fhd) under.srcset = `${src.fhd} ${src.w}w, ${src.orig} 3840w`;
        else under.removeAttribute('srcset');
        under.src = urls[0] ?? '';
    }

    private schedule(): void {
        const list = this.items();
        if (list.length < 2) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.show(this.idx + 1, 1), SLIDE_MS);
        // la próxima se pide antes, así aparece apenas toca
        const next = highlightSources(list[(this.idx + 1) % list.length]);
        const im = new Image();
        im.sizes = '100vw';
        if (next.orig !== next.fhd) im.srcset = `${next.fhd} ${next.w}w, ${next.orig} 3840w`;
        im.src = next.fhd;
    }

    /** título, nota, año y tipo abajo a la derecha: la primera vez enseguida, después con un fundido corto */
    private caption(it: ProfilesHighlight): void {
        if (!this.shown()) {
            this.shown.set(it);
            return;
        }
        this.captionOff.set(true);
        setTimeout(() => {
            this.shown.set(it);
            this.captionOff.set(false);
        }, CAPTION_MS);
    }
}
