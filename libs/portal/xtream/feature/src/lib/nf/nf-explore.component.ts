import {
    ChangeDetectionStrategy,
    Component,
    computed,
    DestroyRef,
    ElementRef,
    inject,
    linkedSignal,
    signal,
    viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { filter as rxFilter } from 'rxjs';
import { NfCardComponent } from './nf-card.component';
import { injectNfCatalog } from './nf-catalog';
import { PanelBrandingService } from '@iptvnator/services';
import { NF_GENRES, NF_PLATFORMS, NfTag, nfAvailable, nfNorm, nfTagItems, nfTitleNorm } from './nf-filters';
import { NfItem, nfLink, newestFirst, topRated } from './nf-item';
import { NfNearEndDirective } from './nf-near-end.directive';
import { NfTitleSearchComponent } from './nf-title-search.component';

type ExploreType = 'all' | 'movie' | 'series';
type ExploreSort = 'recent' | 'rating' | 'az';

const PAGE = 120;
/** Un solo Collator: localeCompare(…, 'es') crea uno por comparación y congela A–Z con catálogos grandes. */
const TITLE_COLLATOR = new Intl.Collator('es');
/** La lupa de la barra (y Ctrl+F) abre Explorar con esto en el estado de la navegación: el cursor va a «Filtrar por título». */
const NF_FOCUS_FILTER = 'nfFocusFilter';

/**
 * Explorar, igual al web player en horizontal (browse.php): título y subtítulo sobre el degradado del color, la cápsula
 * Todo / Películas / Series, el orden (Agregados recientemente / A - Z / Mejor valorados), «Filtrar por título…», el
 * total, los géneros, las plataformas, el divisor y la cuadrícula de pósters.
 */
@Component({
    selector: 'app-nf-explore',
    standalone: true,
    imports: [NfCardComponent, NfNearEndDirective, NfTitleSearchComponent, RouterLink, TranslatePipe],
    templateUrl: './nf-explore.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NfExploreComponent {
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly translate = inject(TranslateService);
    private readonly branding = inject(PanelBrandingService);
    private readonly filterInput = viewChild<ElementRef<HTMLInputElement>>('filterInput');
    protected readonly catalog = injectNfCatalog([]);
    protected readonly page = PAGE;
    protected readonly types: { key: ExploreType; label: string }[] = [
        { key: 'all', label: 'MPX.NF.ALL' },
        { key: 'movie', label: 'MPX.NAV.MOVIES' },
        { key: 'series', label: 'MPX.NAV.SERIES' },
    ];

    private readonly params = toSignal(this.route.queryParamMap, { requireSync: true });
    protected readonly type = computed<ExploreType>(() => {
        const t = this.params().get('type');
        return t === 'movie' || t === 'series' ? t : 'all';
    });
    protected readonly sort = computed<ExploreSort>(() => {
        const s = this.params().get('sort');
        return s === 'rating' || s === 'az' ? s : 'recent';
    });
    /** ?platform= solo cuenta si el distribuidor separa por plataformas. */
    protected readonly platformTag = computed<NfTag | null>(() => {
        const key = this.branding.platforms() ? this.params().get('platform') : null;
        return NF_PLATFORMS.find((p) => p.key === key) ?? null;
    });
    protected readonly genreTag = computed<NfTag | null>(
        () => NF_GENRES.find((g) => g.key === this.params().get('genre')) ?? null
    );
    /** Platform page (Netflix, Disney+…): the name filter is the top-right magnifier. */
    protected readonly platform = computed(() => !!this.platformTag() && !this.category());
    protected readonly category = computed(() => {
        const id = this.params().get('category');
        if (!id) return null;
        const list = this.type() === 'series' ? this.catalog.seriesCategories() : this.catalog.movieCategories();
        return list.find((c) => c.id === id) ?? { id, name: this.translate.instant('MPX.NF.CATEGORY') };
    });
    protected readonly filter = linkedSignal(() => this.params().get('q') ?? '');
    protected readonly limit = signal(PAGE);

    private readonly typeCategories = computed(() => {
        const type = this.type();
        return [
            ...(type !== 'series' ? this.catalog.movieCategories() : []),
            ...(type !== 'movie' ? this.catalog.seriesCategories() : []),
        ];
    });
    /** Los géneros que tienen alguna carpeta en el tipo elegido (y el elegido, aunque no tenga). */
    protected readonly genres = computed(() => {
        const list = nfAvailable(NF_GENRES, this.typeCategories());
        const g = this.genreTag();
        return g && !list.includes(g) ? [...list, g] : list;
    });
    protected readonly platforms = computed(() =>
        this.branding.platforms()
            ? nfAvailable(NF_PLATFORMS, [...this.catalog.movieCategories(), ...this.catalog.seriesCategories()])
            : []
    );

    private readonly lang = toSignal(this.translate.onLangChange, { initialValue: null });
    /** Category names are shown as the server sends them; the rest are translated (web: «Explorar» con cualquier tipo). */
    protected readonly headingText = computed(() => {
        this.lang();
        const category = this.category();
        if (category) return category.name;
        const tag = this.platformTag() ?? this.genreTag();
        if (tag) return this.translate.instant(tag.label);
        const q = this.params().get('q');
        return this.translate.instant(q ? 'MPX.NF.RESULTS_FOR' : 'MPX.NAV.EXPLORE', q ? { q } : undefined);
    });
    protected readonly subtitle = computed((): { key: string; params?: Record<string, string> } => {
        this.lang();
        const category = this.category();
        if (category)
            return { key: this.type() === 'series' ? 'MPX.NF.EX_SUB_CAT_SERIES' : 'MPX.NF.EX_SUB_CAT_MOVIES', params: { c: category.name } };
        const p = this.platformTag();
        if (p) return { key: 'MPX.NF.EX_SUB_PLATFORM', params: { p: this.translate.instant(p.label) } };
        const g = this.genreTag();
        if (g) return { key: 'MPX.NF.EX_SUB_GENRE', params: { g: String(this.translate.instant(g.label)).toLowerCase() } };
        if (this.params().get('q')) return { key: 'MPX.NF.EX_SUB_SEARCH' };
        return { key: 'MPX.NF.EX_SUB_ALL' };
    });
    /** El color de la plataforma (o el rojo de siempre) sobre el título, como el web player. */
    protected readonly accent = computed(() => (this.platformTag()?.color ?? '#e50914') + '55');

    /** Tipo, categoría / plataforma / género y orden; el filtro por título va aparte (no reordena al teclear). */
    private readonly sorted = computed<NfItem[]>(() => {
        const type = this.type();
        let items: NfItem[] = [
            ...(type !== 'series' ? this.catalog.movies() : []),
            ...(type !== 'movie' ? this.catalog.series() : []),
        ];
        const category = this.category();
        if (category) items = items.filter((i) => i.categoryId === category.id);
        else {
            for (const tag of [this.platformTag(), this.genreTag()]) {
                if (tag) items = nfTagItems(items, this.typeCategories(), tag);
            }
        }
        switch (this.sort()) {
            case 'rating':
                return topRated(items);
            case 'az':
                return [...items].sort((a, b) => TITLE_COLLATOR.compare(a.title, b.title));
            default:
                return newestFirst(items);
        }
    });
    protected readonly results = computed<NfItem[]>(() => {
        const q = nfNorm(this.filter().trim());
        const items = this.sorted();
        return q ? items.filter((i) => nfTitleNorm(i).includes(q)) : items;
    });
    protected readonly shown = computed(() => this.results().slice(0, this.limit()));
    /** «4.812 títulos»: el número con los separadores del idioma de la app. */
    protected readonly countText = computed(() => {
        this.lang();
        return this.results().length.toLocaleString(this.translate.currentLang || 'es');
    });

    constructor() {
        // la lupa de la barra o Ctrl+F: el cursor en «Filtrar por título» (también si Explorar ya estaba abierto)
        this.router.events
            .pipe(
                rxFilter((e) => e instanceof NavigationEnd),
                takeUntilDestroyed(inject(DestroyRef))
            )
            .subscribe(() => {
                if (!history.state?.[NF_FOCUS_FILTER]) return;
                setTimeout(() => this.filterInput()?.nativeElement.focus());
            });
    }

    protected link(item: NfItem): string[] {
        return nfLink(this.catalog.playlistId(), item);
    }

    protected set(change: Record<string, string | null>): void {
        this.limit.set(PAGE);
        void this.router.navigate([], { relativeTo: this.route, queryParams: change, queryParamsHandling: 'merge' });
    }

    /** Como los botones de plataforma del web player: la página de esa plataforma, desde cero. */
    protected openPlatform(key: string): void {
        this.limit.set(PAGE);
        void this.router.navigate([], { relativeTo: this.route, queryParams: { platform: key } });
    }
}
