import { ChangeDetectionStrategy, Component, computed, Directive, ElementRef, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AlertableEvent, eventTitle, MatchAlertsService } from '@iptvnator/services';

const HOLD_MS = 600;

/** «Activar / quitar las notificaciones de este evento» (como mantener presionada la tarjeta en Android) */
@Component({
    selector: 'app-match-alert-dialog',
    standalone: true,
    imports: [MatButtonModule, MatDialogModule, MatIcon, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h2 mat-dialog-title>{{ title }}</h2>
        <mat-dialog-content>
            <button mat-flat-button type="button" class="toggle" (click)="toggle()" cdkFocusInitial>
                <mat-icon>{{ on ? 'notifications_off' : 'notifications_active' }}</mat-icon>
                {{ (on ? 'MPX.ALERTS.NOTIFY_OFF' : 'MPX.ALERTS.NOTIFY_ON') | translate }}
            </button>
        </mat-dialog-content>
        <mat-dialog-actions align="end">
            <button mat-button type="button" mat-dialog-close>{{ 'MPX.ALERTS.CLOSE' | translate }}</button>
        </mat-dialog-actions>
    `,
    styles: `.toggle { width: 100%; justify-content: flex-start; }`,
})
export class MatchAlertDialogComponent {
    private readonly e = inject<AlertableEvent>(MAT_DIALOG_DATA);
    private readonly alerts = inject(MatchAlertsService);
    private readonly ref = inject(MatDialogRef<MatchAlertDialogComponent>);
    private readonly snack = inject(MatSnackBar);
    private readonly translate = inject(TranslateService);
    protected readonly title = eventTitle(this.e);
    protected readonly on = this.alerts.isMarked(String(this.e.id));

    protected toggle(): void {
        const now = this.alerts.toggle(this.e);
        this.snack.open(this.translate.instant(now ? 'MPX.ALERTS.ON_TOAST' : 'MPX.ALERTS.OFF_TOAST'), undefined, { duration: 3000 });
        this.ref.close();
    }
}

/**
 * En la tarjeta de un partido (Deportes): clic sostenido o clic derecho abre «Activar notificaciones para este evento».
 * El clic normal sigue igual (soltar después de sostener no abre los canales). Con el aviso activado la tarjeta lleva
 * la campanita (clase has-alert).
 */
@Directive({
    selector: '[appMatchAlert]',
    standalone: true,
    host: {
        '[class.has-alert]': 'marked()',
        '(pointerdown)': 'down($event)',
        '(pointermove)': 'move($event)',
        '(pointerup)': 'cancel()',
        '(pointerleave)': 'cancel()',
        '(pointercancel)': 'cancel()',
        '(contextmenu)': 'context($event)',
    },
})
export class MatchAlertDirective {
    readonly appMatchAlert = input.required<AlertableEvent>();
    private readonly alerts = inject(MatchAlertsService);
    private readonly dialog = inject(MatDialog);
    private timer: ReturnType<typeof setTimeout> | null = null;
    private start = { x: 0, y: 0 };
    private held = false;
    protected readonly marked = computed(() => this.alerts.isMarked(String(this.appMatchAlert().id)));

    constructor() {
        // después de sostener, el clic de soltar no abre los canales
        inject<ElementRef<HTMLElement>>(ElementRef).nativeElement.addEventListener(
            'click',
            (ev) => {
                if (!this.held) return;
                this.held = false;
                ev.stopPropagation();
                ev.preventDefault();
            },
            true
        );
    }

    protected down(ev: PointerEvent): void {
        // sin perfiles no hay avisos (todo lo nuevo de Deportes va con los perfiles)
        if (ev.button !== 0 || !this.alerts.on()) return;
        this.held = false;
        this.start = { x: ev.clientX, y: ev.clientY };
        this.cancel();
        this.timer = setTimeout(() => {
            this.held = true;
            this.open();
        }, HOLD_MS);
    }

    /** arrastrar (desplazar la fila con el dedo) no es sostener */
    protected move(ev: PointerEvent): void {
        if (this.timer && Math.hypot(ev.clientX - this.start.x, ev.clientY - this.start.y) > 10) this.cancel();
    }

    protected cancel(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }

    protected context(ev: MouseEvent): void {
        if (!this.alerts.on()) return;
        ev.preventDefault();
        this.cancel();
        this.open();
    }

    private open(): void {
        this.dialog.open(MatchAlertDialogComponent, { data: this.appMatchAlert(), width: '420px', maxWidth: '92vw' });
    }
}
