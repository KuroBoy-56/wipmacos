import { ChangeDetectionStrategy, Component, ElementRef, inject, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MatchAlertsService } from '@iptvnator/services';

/**
 * Campanita de la barra (como Android y la referencia de Netflix): los avisos de partidos de las últimas 24 h, con un
 * punto rojo si hay nuevos. Al abrirla quedan leídos.
 */
@Component({
    selector: 'app-nf-bell',
    standalone: true,
    imports: [MatIcon, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '(document:click)': 'outside($event)', '(document:keydown.escape)': 'open.set(false)' },
    template: `
        <button class="nf-icon-btn nf-bell-btn" type="button" [attr.aria-label]="'MPX.ALERTS.BELL' | translate" [attr.aria-expanded]="open()" (click)="toggle()">
            <mat-icon>notifications</mat-icon>
            @if (alerts.unread() > 0) {
                <span class="dot" aria-hidden="true"></span>
            }
        </button>
        @if (open()) {
            <div class="nf-bell-panel" role="dialog" [attr.aria-label]="'MPX.ALERTS.BELL' | translate">
                <h3>{{ 'MPX.ALERTS.BELL' | translate }}</h3>
                @for (b of alerts.bell(); track b.at + b.t) {
                    <div class="item">
                        <b>{{ b.t }}</b>
                        <span>{{ b.x }}</span>
                        <small>{{ ago(b.at) }}</small>
                    </div>
                } @empty {
                    <p class="empty">{{ 'MPX.ALERTS.BELL_EMPTY' | translate }}</p>
                }
            </div>
        }
    `,
    styles: `
        :host { position: relative; display: inline-flex; }
        .nf-bell-btn { position: relative; }
        .dot { position: absolute; top: 6px; right: 6px; width: 9px; height: 9px; border-radius: 50%; background: #e50914; }
        .nf-bell-panel { position: absolute; top: calc(100% + 8px); right: 0; z-index: 50; width: 340px; max-height: 420px; overflow-y: auto; padding: 14px 16px; border-radius: 8px; background: rgba(20, 20, 20, 0.97); border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6); }
        h3 { margin: 0 0 10px; font-size: 15px; }
        .item { display: flex; flex-direction: column; gap: 2px; padding: 8px 0; border-top: 1px solid rgba(255, 255, 255, 0.08); }
        .item b { font-size: 14px; }
        .item span { font-size: 13px; color: #ddd; }
        .item small { font-size: 12px; color: #999; }
        .empty { margin: 0; font-size: 13px; color: #aaa; }
    `,
})
export class NfBellComponent {
    protected readonly alerts = inject(MatchAlertsService);
    private readonly translate = inject(TranslateService);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    protected readonly open = signal(false);

    protected toggle(): void {
        this.open.update((v) => !v);
        if (this.open()) this.alerts.markRead();
    }

    protected outside(ev: Event): void {
        if (this.open() && !this.host.nativeElement.contains(ev.target as Node)) this.open.set(false);
    }

    protected ago(at: number): string {
        const min = Math.floor((Date.now() - at) / 60_000);
        if (min < 1) return this.translate.instant('MPX.ALERTS.NOW');
        if (min < 60) return this.translate.instant('MPX.ALERTS.MIN_AGO', { n: min });
        return this.translate.instant('MPX.ALERTS.H_AGO', { n: Math.floor(min / 60) });
    }
}
