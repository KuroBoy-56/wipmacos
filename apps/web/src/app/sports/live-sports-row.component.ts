import { NgTemplateOutlet } from '@angular/common';
import { HScrollComponent } from '@iptvnator/ui/components';
import { afterRenderEffect, ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { buildXtreamNavigationTarget } from '@iptvnator/portal/shared/util';
import { LiveFieldComponent } from './live-field.component';
import { MatchAlertDirective } from './match-alert.directive';
import { LiveSportsService } from './live-sports.service';
import { clockText, competitionTheme, LiveCard, score } from './live-sports.util';
import { SportsChannelTarget, SportsDataService } from './sports-data.service';
import { SportsMenuOpt, sportsMenu } from './sports-menu.util';

type LiveMenu = { card: LiveCard; title: string; sub: string; opts: SportsMenuOpt[]; typing?: string };

/**
 * «En vivo ahora» en Inicio (en el lugar de Plataformas), como Android: hasta 20 partidos (los que se juegan y los
 * próximos, con su hora) y al final «Ir a Deportes»; tarjetas con la cancha del deporte (y el color
 * del torneo si es uno grande), escudos, marcador, minuto y el canal exacto de la lista del cliente. Al pulsar, el menú
 * de canales de Deportes (solo los que tiene el cliente, y buscar); Atrás desde el reproductor vuelve aquí con el foco
 * en el mismo partido. Flechas a los lados con el mouse (app-hscroll).
 */
@Component({
    selector: 'app-live-sports-row',
    standalone: true,
    imports: [HScrollComponent, LiveFieldComponent, MatchAlertDirective, NgTemplateOutlet, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './live-sports-row.component.html',
    styleUrl: './live-sports-row.component.scss',
})
export class LiveSportsRowComponent {
    protected readonly live = inject(LiveSportsService);
    private readonly data = inject(SportsDataService);
    private readonly router = inject(Router);
    private readonly translate = inject(TranslateService);
    private readonly snackBar = inject(MatSnackBar);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    protected readonly menu = signal<LiveMenu | null>(null);
    protected readonly score = score;

    constructor() {
        // al volver del reproductor: el foco en el partido que se abrió
        afterRenderEffect(() => {
            const id = this.live.lastId;
            if (!id || !this.live.cards().length) return;
            const el = this.host.nativeElement.querySelector<HTMLElement>(`.lv-card[data-id="${CSS.escape(id)}"]`);
            if (!el) return;
            this.live.lastId = '';
            el.focus();
            el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
        // el menú abierto: su primera opción con el foco
        afterRenderEffect(() => {
            if (this.menu()) this.host.nativeElement.querySelector<HTMLElement>('.lv-menu input, .lv-menu button')?.focus();
        });
    }

    protected clock(c: LiveCard): string {
        if (c.e.soon) return `${this.translate.instant('MPX.LIVE.STARTS')} ${this.hour(c.e.s)}`;
        return clockText(c.e, this.translate.instant('MPX.LIVE.HT')) || this.translate.instant('MPX.LIVE.LIVE');
    }

    /** hora de inicio de un próximo (la del equipo, como las TV) */
    private hour(s?: number): string {
        if (!s) return '';
        return new Intl.DateTimeFormat(this.translate.currentLang || 'es', { hour: 'numeric', minute: '2-digit' }).format(new Date(s * 1000));
    }

    protected goSports(): void {
        void this.router.navigate(['/workspace/sports']);
    }

    protected theme(c: LiveCard): string {
        return competitionTheme(c.e.lg);
    }

    protected label(c: LiveCard): string {
        const what = c.e.h || c.e.a ? (c.e.soon ? `${c.e.h} vs ${c.e.a}` : `${c.e.h} ${score(c.e.hs)} - ${score(c.e.as)} ${c.e.a}`) : c.e.ev || c.e.lg;
        return `${what}, ${this.clock(c)}, ${c.ch.best?.name ?? ''}`;
    }

    protected initial(name: string): string {
        return (name || '?').trim().charAt(0).toUpperCase();
    }

    protected badgeError(img: HTMLImageElement): void {
        img.hidden = true;
        if (img.nextElementSibling instanceof HTMLElement) img.nextElementSibling.hidden = false;
    }

    /** el menú del partido: el canal automático y los demás que tiene el cliente (todos en verde), y buscar */
    protected open(card: LiveCard): void {
        const e = card.e;
        const tr = (key: string, params?: Record<string, string>) => this.translate.instant(key, params);
        const title = e.h && e.a ? (e.soon ? `${e.h} vs ${e.a}` : `${e.h} ${score(e.hs)} - ${score(e.as)} ${e.a}`) : e.ev || e.lg;
        this.menu.set({ card, title, sub: this.clock(card) + (e.lg ? `  ·  ${e.lg}` : ''), opts: sportsMenu(e, card.ch, true, tr) });
    }

    protected close(): void {
        const id = this.menu()?.card.e.id;
        this.menu.set(null);
        if (id) this.host.nativeElement.querySelector<HTMLElement>(`.lv-card[data-id="${CSS.escape(id)}"]`)?.focus();
    }

    protected run(o: SportsMenuOpt): void {
        const mn = this.menu();
        if (!mn) return;
        const a = o.act;
        const m = mn.card.ch;
        if (a.kind === 'auto') return void (m.best && this.play(mn.card, m.best));
        if (a.kind === 'tv') {
            const ch = m.tv[a.index]?.ch;
            return void (ch && this.play(mn.card, ch));
        }
        if (a.kind === 'play') return void this.play(mn.card, a.target);
        if (a.kind === 'search') return void this.find(a.q);
        this.menu.set({ ...mn, typing: a.q });
    }

    /** canales de la lista del cliente con ese nombre (equipo, evento o canal), todos en verde */
    protected async find(q: string): Promise<void> {
        q = q.trim();
        const mn = this.menu();
        if (!q || !mn) return;
        const list = await this.data.searchChannels(q);
        if (!list.length) return void this.toast('MPX.SPORTS.NO_SEARCH', { name: q });
        this.menu.set({
            card: mn.card,
            title: this.translate.instant('MPX.SPORTS.SEARCH_TITLE', { name: q }),
            sub: '',
            opts: list.map((c) => ({ title: c.name, green: true, act: { kind: 'play', target: c } })),
        });
    }

    /** TV en vivo en ese canal, reproduciéndose (también un canal más nuevo que la lista guardada) */
    private async play(card: LiveCard, target: SportsChannelTarget): Promise<void> {
        this.menu.set(null);
        this.live.lastId = card.e.id;
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
