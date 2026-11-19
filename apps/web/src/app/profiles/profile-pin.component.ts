import { ChangeDetectionStrategy, Component, ElementRef, input, output, signal, viewChild, afterNextRender } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * PIN de 4 números de un perfil (como la web player): se comprueba solo al escribir el cuarto número en el panel
 * (pin_check). «¿Olvidaste el PIN?» pide la contraseña de la línea (pin_reset). El PIN nunca se guarda en el equipo.
 */
@Component({
    selector: 'app-profile-pin',
    standalone: true,
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="pf-modal" role="dialog" aria-modal="true" (click)="backdrop($event)" (keydown.escape)="closed.emit()">
            <div class="pf-card">
                @if (!forgot()) {
                    <h2>{{ title() }}</h2>
                    <div class="pf-pinbox">
                        @if (avatar()) {
                            <span class="pf-av"><img [src]="avatar()" alt="" /></span>
                        }
                        <input #pin class="pf-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" aria-label="PIN" [disabled]="busy()" (input)="typed(pin)" />
                    </div>
                    <p class="pf-err" role="alert">{{ busy() ? ('MPX.PROFILES.CHECKING' | translate) : error() }}</p>
                    <div class="pf-actions spread">
                        <button type="button" class="pf-link" (click)="forgot.set(true); error.set('')">{{ 'MPX.PROFILES.PIN_FORGOT' | translate }}</button>
                        <button type="button" class="pf-btn" (click)="closed.emit()">{{ 'MPX.PROFILES.CANCEL' | translate }}</button>
                    </div>
                } @else {
                    <h2>{{ 'MPX.PROFILES.PIN_FORGOT' | translate }}</h2>
                    <p>{{ 'MPX.PROFILES.PIN_RESET_TEXT' | translate: { n: name() } }}</p>
                    <label class="pf-field">
                        <span>{{ 'MPX.PROFILES.PASSWORD' | translate }}</span>
                        <input #pass class="pf-input" type="password" autocomplete="current-password" (keydown.enter)="reset(pass.value)" />
                    </label>
                    <p class="pf-err" role="alert">{{ error() }}</p>
                    <div class="pf-actions">
                        <button type="button" class="pf-btn pf-btn-main" [disabled]="busy()" (click)="reset(pass.value)">{{ 'MPX.PROFILES.PIN_REMOVE' | translate }}</button>
                        <button type="button" class="pf-btn" (click)="closed.emit()">{{ 'MPX.PROFILES.CANCEL' | translate }}</button>
                    </div>
                }
            </div>
        </div>
    `,
})
export class ProfilePinComponent {
    readonly title = input.required<string>();
    readonly name = input('');
    readonly avatar = input('');
    /** comprueba el PIN: devuelve el error para mostrar, o '' si está bien */
    readonly check = input.required<(pin: string) => Promise<string>>();
    /** quita el PIN con la contraseña de la línea: devuelve el error, o '' */
    readonly resetWith = input.required<(pass: string) => Promise<string>>();
    readonly closed = output<void>();

    protected readonly busy = signal(false);
    protected readonly error = signal('');
    protected readonly forgot = signal(false);
    private readonly pin = viewChild<ElementRef<HTMLInputElement>>('pin');

    constructor() {
        afterNextRender(() => this.pin()?.nativeElement.focus());
    }

    protected backdrop(e: MouseEvent): void {
        if (e.target === e.currentTarget) this.closed.emit();
    }

    protected async typed(el: HTMLInputElement): Promise<void> {
        el.value = el.value.replace(/\D+/g, '').slice(0, 4);
        if (el.value.length < 4 || this.busy()) return;
        this.busy.set(true);
        const err = await this.check()(el.value);
        this.busy.set(false);
        if (!err) return;
        this.error.set(err);
        el.value = '';
        setTimeout(() => el.focus());
    }

    protected async reset(pass: string): Promise<void> {
        if (!pass || this.busy()) return;
        this.busy.set(true);
        const err = await this.resetWith()(pass);
        this.busy.set(false);
        if (err) this.error.set(err);
    }
}
