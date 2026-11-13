import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslatePipe } from '@ngx-translate/core';
import { XtreamStore } from '@iptvnator/portal/xtream/data-access';
import { ParentalControlService } from '@iptvnator/services';
import { UiText } from '@iptvnator/shared/interfaces';
import { PanelLoginService } from '../panel-login/panel-login.service';

/**
 * «Control parental» en Ajustes (como Roku): ocultar los canales y categorías para adultos (apagarlo pide el PIN),
 * «Contenido protegido en esta sesión» (con el PIN se ve todo hasta cerrar la app), «Bloquear categorías» (con el PIN:
 * Películas, Series y TV en vivo, cada una se bloquea o desbloquea) y cambiar el PIN en el panel (set_pin, pide el
 * actual). El PIN es el del equipo en el panel (0000 de fábrica).
 */
@Component({
    selector: 'app-settings-parental-section',
    standalone: true,
    imports: [FormsModule, MatButtonModule, MatSlideToggleModule, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="settings-parental" data-test-id="settings-parental">
            <h3>{{ 'MPX.PARENTAL.SECTION' | translate }}</h3>
            <mat-slide-toggle [checked]="parental.hideAdult()" (change)="toggle($event)">
                {{ 'MPX.PARENTAL.HIDE_ADULT' | translate }}
            </mat-slide-toggle>

            <div class="row">
                <input type="password" inputmode="numeric" maxlength="4" name="pin" autocomplete="off" [placeholder]="'MPX.PARENTAL.PIN' | translate" [(ngModel)]="pin" />
                <button mat-stroked-button type="button" (click)="openBlocked()">{{ 'MPX.PARENTAL.BLOCK_CATS' | translate }}</button>
            </div>
            <div class="row">
                <span class="state">{{ 'MPX.PARENTAL.SESSION' | translate }}: <b>{{ (parental.unlocked() ? 'MPX.PARENTAL.SESSION_UNLOCKED' : 'MPX.PARENTAL.SESSION_LOCKED') | translate }}</b></span>
                @if (parental.unlocked()) {
                    <button mat-stroked-button type="button" (click)="lockAgain()">{{ 'MPX.PARENTAL.LOCK' | translate }}</button>
                } @else {
                    <button mat-stroked-button type="button" (click)="unlock()">{{ 'MPX.PARENTAL.UNLOCK' | translate }}</button>
                }
            </div>

            @if (editing()) {
                <div class="cats" data-test-id="parental-blocked">
                    <h4>{{ 'MPX.PARENTAL.BLOCK_CATS' | translate }}</h4>
                    <p class="note">{{ 'MPX.PARENTAL.BLOCK_NOTE' | translate }}</p>
                    <div class="row">
                        @for (k of kinds; track k.id) {
                            <button mat-stroked-button type="button" [class.on]="kind() === k.id" (click)="kind.set(k.id)">{{ k.label | translate }}</button>
                        }
                        <button mat-button type="button" (click)="editing.set(false)">{{ 'MPX.PARENTAL.CLOSE' | translate }}</button>
                    </div>
                    <div class="list">
                        @for (c of cats(); track c.id) {
                            <label class="cat"><input type="checkbox" [checked]="parental.blocked().has(kind() + ':' + c.id)" (change)="parental.toggleBlocked(kind() + ':' + c.id)" /> {{ c.name }}</label>
                        } @empty {
                            <p class="note">{{ 'MPX.PARENTAL.NO_CATS' | translate }}</p>
                        }
                    </div>
                </div>
            }

            <h4>{{ 'MPX.PARENTAL.CHANGE' | translate }}</h4>
            <div class="row">
                <input type="password" inputmode="numeric" maxlength="4" name="oldPin" autocomplete="off" [placeholder]="'MPX.PARENTAL.CURRENT' | translate" [(ngModel)]="oldPin" />
                <input type="password" inputmode="numeric" maxlength="4" name="newPin" autocomplete="off" [placeholder]="'MPX.PARENTAL.NEW' | translate" [(ngModel)]="newPin" />
                <button mat-stroked-button type="button" [disabled]="busy()" (click)="changePin()">{{ 'MPX.PARENTAL.SAVE' | translate }}</button>
            </div>
            @if (message(); as m) {
                <p class="msg" [class.error]="!m.ok">{{ m.text.key | translate: m.text.params }}</p>
            }
            <p class="note">{{ 'MPX.PARENTAL.NOTE' | translate }}</p>
        </section>
    `,
    styles: `
        .settings-parental { max-width: 420px; margin: 0 0 20px; padding: 16px 20px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.15); }
        h3 { margin: 0 0 12px; }
        h4 { margin: 16px 0 8px; font-size: 14px; }
        .row { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
        input { width: 110px; padding: 8px 10px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(0, 0, 0, 0.3); color: inherit; }
        .msg { margin: 10px 0 0; }
        .msg.error { color: #ff6b6b; }
        .note { margin: 10px 0 0; font-size: 13px; opacity: 0.7; }
        .state b { font-weight: 600; }
        .cats { margin-top: 14px; }
        .cats button.on { border-color: var(--nf-accent, #e50914); }
        .list { max-height: 320px; overflow-y: auto; margin-top: 10px; padding-right: 6px; }
        .cat { display: flex; align-items: center; gap: 8px; padding: 4px 0; cursor: pointer; }
    `,
})
export class SettingsParentalSectionComponent {
    protected readonly parental = inject(ParentalControlService);
    private readonly panel = inject(PanelLoginService);
    private readonly xtream = inject(XtreamStore);
    /** «Bloquear categorías» abierto (con el PIN) y el tipo que se ve */
    protected readonly editing = signal(false);
    protected readonly kind = signal<'vod' | 'series' | 'live'>('vod');
    protected readonly kinds = [
        { id: 'vod' as const, label: 'MPX.PARENTAL.MOVIES' },
        { id: 'series' as const, label: 'MPX.PARENTAL.SERIES' },
        { id: 'live' as const, label: 'MPX.PARENTAL.LIVE' },
    ];
    /** todas las categorías del tipo (también las ocultas) */
    protected readonly cats = computed(() => {
        const k = this.kind();
        const list = (k === 'live' ? this.xtream.liveCategories() : k === 'vod' ? this.xtream.vodCategories() : this.xtream.serialCategories()) as unknown[];
        return (list || [])
            .map((c) => {
                const o = (c ?? {}) as { category_id?: unknown; id?: unknown; category_name?: unknown; name?: unknown };
                return { id: String(o.category_id ?? o.id ?? ''), name: String(o.category_name ?? o.name ?? '').trim() };
            })
            .filter((c) => c.id && c.name);
    });
    protected readonly busy = signal(false);
    protected readonly message = signal<{ ok: boolean; text: UiText } | null>(null);
    pin = '';
    oldPin = '';
    newPin = '';

    private say(ok: boolean, key: string | UiText): void {
        this.message.set({ ok, text: typeof key === 'string' ? { key } : key });
    }

    toggle(event: MatSlideToggleChange): void {
        const hide = event.checked;
        if (this.parental.setHideAdult(hide, this.pin)) {
            this.pin = '';
            this.say(true, hide ? 'MPX.PARENTAL.HIDDEN' : 'MPX.PARENTAL.SHOWN');
            return;
        }
        // apagarlo pide el PIN: el interruptor vuelve a encendido
        event.source.checked = true;
        this.say(false, 'MPX.PARENTAL.WRONG_PIN');
    }

    unlock(): void {
        const ok = this.parental.unlock(this.pin);
        this.pin = '';
        this.say(ok, ok ? 'MPX.PARENTAL.UNLOCKED' : 'MPX.PARENTAL.WRONG_PIN');
    }

    /** «Bloquear categorías» pide el PIN */
    openBlocked(): void {
        if (this.pin.trim() !== '' && this.parental.checkPin(this.pin)) {
            this.pin = '';
            this.message.set(null);
            this.editing.set(true);
            return;
        }
        this.say(false, 'MPX.PARENTAL.WRONG_PIN');
    }

    lockAgain(): void {
        this.parental.lock();
        this.say(true, 'MPX.PARENTAL.HIDDEN');
    }

    async changePin(): Promise<void> {
        if (!/^\d{4}$/.test(this.newPin) || !/^\d{4}$/.test(this.oldPin)) {
            this.say(false, 'MPX.PARENTAL.FOUR_DIGITS');
            return;
        }
        this.busy.set(true);
        try {
            const r = await this.panel.setPin(this.oldPin, this.newPin);
            if (r.ok) {
                this.oldPin = '';
                this.newPin = '';
                this.say(true, 'MPX.PARENTAL.SAVED');
            } else {
                this.say(false, r.message ?? 'MPX.PARENTAL.ERR_SAVE');
            }
        } finally {
            this.busy.set(false);
        }
    }
}
