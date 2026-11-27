import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FavTeam, MatchAlertsService, PanelBrandingService, PanelSportsFixtures } from '@iptvnator/services';
import { LiveSportsService } from '../sports/live-sports.service';
import { SportsDataService } from '../sports/sports-data.service';
import { LIVE_SPORT_CHOICES } from '../sports/live-sports.util';
import { fixtureTeams } from './settings-live-sports.util';

/**
 * Ajustes › «Deporte preferido» (la fila «En vivo ahora» de Inicio muestra solo ese deporte; sin elegir, todos) y
 * «Equipos favoritos» (deporte → liga o selecciones → equipo, de los próximos partidos del panel): cada partido de esos
 * equipos avisa 30 y 10 min antes y al empezar (MatchAlertsService). Por línea y perfil, como Android. Solo aparece
 * cuando la fila existe (perfiles activos, no infantil, y una clave de pago de TheSportsDB).
 */
@Component({
    selector: 'app-settings-live-sports-section',
    standalone: true,
    imports: [MatButtonModule, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (live.enabled()) {
            <section class="settings-live" data-test-id="settings-live-sports">
                <h3><label for="live-pref">{{ 'MPX.LIVE.PREF' | translate }}</label></h3>
                <select id="live-pref" [value]="live.pref()" (change)="live.setPref($any($event.target).value)">
                    <option value="" [selected]="!live.pref()">{{ 'MPX.LIVE.ALL' | translate }}</option>
                    @for (s of sports(); track s) {
                        <option [value]="s" [selected]="live.pref() === s">{{ sportLabel(s) }}</option>
                    }
                </select>
                <p class="note">{{ 'MPX.LIVE.PREF_HINT' | translate }}</p>

                @if (platformsOn()) {
                    <label class="plat">
                        <input type="checkbox" [checked]="live.platformCards()" (change)="live.setPlatformCards($any($event.target).checked)" />
                        <span>{{ 'MPX.LIVE.PLAT_CARDS' | translate }}</span>
                    </label>
                    <p class="note">{{ 'MPX.LIVE.PLAT_CARDS_HINT' | translate }}</p>
                }

                <h3 class="teams-title">{{ 'MPX.ALERTS.TEAMS' | translate }}</h3>
                <p class="note">{{ 'MPX.ALERTS.TEAMS_HINT' | translate }}</p>
                @for (t of alerts.teams(); track t.n) {
                    <div class="team" data-test-id="fav-team">
                        @if (t.b) {
                            <img [src]="t.b + '/tiny'" alt="" loading="lazy" />
                        }
                        <span>{{ t.l || t.n }}</span>
                        <button mat-button type="button" (click)="remove(t)">{{ 'MPX.ALERTS.REMOVE' | translate }}</button>
                    </div>
                }
                @if (!adding()) {
                    <button mat-stroked-button type="button" (click)="startAdd()">{{ 'MPX.ALERTS.ADD' | translate }}</button>
                } @else if (fx() === undefined) {
                    <p class="note">{{ 'MPX.ALERTS.LOADING' | translate }}</p>
                } @else if (!fxSports().length) {
                    <p class="note">{{ 'MPX.ALERTS.NO_DATA' | translate }}</p>
                } @else {
                    <div class="pick">
                        <label>{{ 'MPX.ALERTS.SPORT' | translate }}
                            <select (change)="sport.set($any($event.target).value); league.set('')">
                                <option value="">{{ 'MPX.ALERTS.CHOOSE' | translate }}</option>
                                @for (s of fxSports(); track s) {
                                    <option [value]="s" [selected]="sport() === s">{{ sportLabel(s) }}</option>
                                }
                            </select>
                        </label>
                        @if (sport()) {
                            <label>{{ 'MPX.ALERTS.LEAGUE' | translate }}
                                <select (change)="league.set($any($event.target).value)">
                                    <option value="">{{ 'MPX.ALERTS.CHOOSE' | translate }}</option>
                                    @if (leagues().nat.length) {
                                        <optgroup [label]="'MPX.ALERTS.NATIONS' | translate">
                                            @for (l of leagues().nat; track l.id) {
                                                <option [value]="l.id">{{ l.n }}</option>
                                            }
                                        </optgroup>
                                    }
                                    @if (leagues().clubs.length) {
                                        <optgroup [label]="'MPX.ALERTS.CLUBS' | translate">
                                            @for (l of leagues().clubs; track l.id) {
                                                <option [value]="l.id">{{ l.n }}</option>
                                            }
                                        </optgroup>
                                    }
                                </select>
                            </label>
                        }
                        @if (league()) {
                            @if (teamList().length) {
                                <label>{{ 'MPX.ALERTS.TEAM' | translate }}
                                    <select (change)="add($any($event.target).value)">
                                        <option value="">{{ 'MPX.ALERTS.CHOOSE' | translate }}</option>
                                        @for (t of teamList(); track t.n) {
                                            <option [value]="t.n">{{ t.l || t.n }}</option>
                                        }
                                    </select>
                                </label>
                            } @else {
                                <p class="note">{{ 'MPX.ALERTS.NO_TEAMS' | translate }}</p>
                            }
                        }
                    </div>
                }
            </section>
        }
    `,
    styles: `
        .settings-live { max-width: 420px; margin: 0 0 20px; padding: 16px 20px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(0, 0, 0, 0.15); }
        h3 { margin: 0 0 12px; }
        .teams-title { margin-top: 22px; }
        select { min-width: 220px; max-width: 100%; padding: 8px 10px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.25); background: #1f1f1f; color: inherit; font: inherit; }
        .note { margin: 10px 0; font-size: 13px; opacity: 0.7; }
        .team { display: flex; align-items: center; gap: 10px; padding: 4px 0; }
        .team img { width: 26px; height: 26px; object-fit: contain; }
        .team span { flex: 1; }
        .pick { display: flex; flex-direction: column; gap: 12px; margin-top: 6px; }
        .pick label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; opacity: 0.9; }
        .plat { display: flex; align-items: center; gap: 10px; margin-top: 14px; cursor: pointer; }
        .plat input { width: 18px; height: 18px; accent-color: var(--nf-red, #e50914); }
    `,
})
export class SettingsLiveSportsSectionComponent {
    protected readonly live = inject(LiveSportsService);
    protected readonly alerts = inject(MatchAlertsService);
    private readonly translate = inject(TranslateService);
    /** todas las disciplinas que da el panel (api/sports.php: las de la agenda y todas las encendidas), por nombre */
    private readonly apiSports = signal<Record<string, { label: string }>>({});
    protected readonly sports = computed(() =>
        [...new Set([...Object.keys(this.apiSports()), ...LIVE_SPORT_CHOICES])].sort((a, b) => this.sportLabel(a).localeCompare(this.sportLabel(b)))
    );
    /** «Habilitar tarjetas de plataformas» solo si el distribuidor tiene las plataformas */
    protected readonly platformsOn = inject(PanelBrandingService).platforms;

    protected readonly adding = signal(false);
    /** undefined = cargando, null = el panel no tiene los próximos partidos */
    protected readonly fx = signal<PanelSportsFixtures | null | undefined>(undefined);
    protected readonly sport = signal('');
    protected readonly league = signal('');

    protected readonly fxSports = computed(() => {
        const l = this.fx()?.leagues ?? {};
        return [...new Set(Object.values(l).map((x) => x.sp).filter(Boolean))].sort((a, b) => this.sportLabel(a).localeCompare(this.sportLabel(b)));
    });

    protected readonly leagues = computed(() => {
        const all = Object.entries(this.fx()?.leagues ?? {})
            .filter(([, l]) => l.sp === this.sport())
            .map(([id, l]) => ({ id, n: l.n, nat: l.rg === 'nat' }))
            .sort((a, b) => a.n.localeCompare(b.n));
        return { nat: all.filter((l) => l.nat), clubs: all.filter((l) => !l.nat) };
    });

    protected readonly teamList = computed(() => {
        const fx = this.fx();
        return fx && this.league() ? fixtureTeams(fx, this.league()) : [];
    });

    constructor() {
        void this.live.ensure();
        void inject(SportsDataService)
            .loadAgenda()
            .then((a) => a?.sports && this.apiSports.set(a.sports))
            .catch(() => undefined);
    }

    protected sportLabel(sp: string): string {
        return LIVE_SPORT_CHOICES.includes(sp) ? this.translate.instant('MPX.LIVE.SP.' + sp) : this.apiSports()[sp]?.label || sp;
    }

    protected async startAdd(): Promise<void> {
        this.adding.set(true);
        this.fx.set(undefined);
        const fx = await this.alerts.fixtures(true);
        this.fx.set(fx?.on ? fx : null);
        // con un deporte preferido se empieza por ese
        const pref = this.live.pref();
        this.sport.set(pref && this.fxSports().includes(pref) ? pref : '');
        this.league.set('');
    }

    protected add(name: string): void {
        const t = this.teamList().find((x) => x.n === name);
        if (!t) return;
        if (!this.alerts.teams().some((x) => x.n === t.n)) this.alerts.setTeams([...this.alerts.teams(), t]);
        this.adding.set(false);
    }

    protected remove(t: FavTeam): void {
        this.alerts.setTeams(this.alerts.teams().filter((x) => x.n !== t.n));
    }
}
