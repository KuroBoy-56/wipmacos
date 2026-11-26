import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LiveSportsService } from '../sports/live-sports.service';
import { LIVE_SPORT_CHOICES } from '../sports/live-sports.util';

/**
 * Ajustes › «Deporte preferido» (como Android): la fila «En vivo ahora» de Inicio muestra solo ese deporte. Por línea y
 * perfil. Solo aparece cuando la fila existe (perfiles activos, no infantil, y una clave de pago de TheSportsDB).
 */
@Component({
    selector: 'app-settings-live-sports-section',
    standalone: true,
    imports: [TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (live.enabled()) {
            <section class="settings-live" data-test-id="settings-live-sports">
                <h3><label for="live-pref">{{ 'MPX.LIVE.PREF' | translate }}</label></h3>
                <select id="live-pref" [value]="live.pref()" (change)="live.setPref($any($event.target).value)">
                    <option value="" [selected]="!live.pref()">{{ 'MPX.LIVE.ALL' | translate }}</option>
                    @for (s of sports; track s) {
                        <option [value]="s" [selected]="live.pref() === s">{{ 'MPX.LIVE.SP.' + s | translate }}</option>
                    }
                </select>
                <p class="note">{{ 'MPX.LIVE.PREF_HINT' | translate }}</p>
            </section>
        }
    `,
    styles: `
        .settings-live { max-width: 420px; margin: 0 0 20px; padding: 16px 20px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.15); }
        h3 { margin: 0 0 12px; }
        select { min-width: 220px; padding: 8px 10px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.25); background: #1f1f1f; color: inherit; font: inherit; }
        .note { margin: 10px 0 0; font-size: 13px; opacity: 0.7; }
    `,
})
export class SettingsLiveSportsSectionComponent {
    protected readonly live = inject(LiveSportsService);
    protected readonly sports = LIVE_SPORT_CHOICES;

    constructor() {
        void this.live.ensure();
    }
}
