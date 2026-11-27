import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FavTeam, MatchAlertsService, PanelBrandingService, PanelSportsFixtures } from '@iptvnator/services';
import { LiveSportsService } from '../sports/live-sports.service';
import { SportsDataService } from '../sports/sports-data.service';
import { FavLeague, LIVE_SPORT_CHOICES } from '../sports/live-sports.util';
import { fixtureTeams, LeagueChoice, leagueChoices } from './settings-live-sports.util';

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
                <select id="live-pref" [value]="live.pref()" (change)="live.setPref($any($event.target).value); lgOpen.set(false)">
                    <option value="" [selected]="!live.pref()">{{ 'MPX.LIVE.ALL' | translate }}</option>
                    @for (s of sports(); track s) {
                        <option [value]="s" [selected]="live.pref() === s">{{ sportLabel(s) }}</option>
                    }
                </select>
                <p class="note">{{ 'MPX.LIVE.PREF_HINT' | translate }}</p>

                <h3 class="teams-title">{{ 'MPX.LIVE.LEAGUES' | translate }}</h3>
                <p class="note">
                    <strong>{{ leaguesText() }}</strong> · {{ 'MPX.LIVE.LEAGUES_HINT' | translate }}
                </p>
                @if (!lgOpen()) {
                    <button mat-stroked-button type="button" data-test-id="pick-leagues" (click)="openLeagues()">{{ 'MPX.LIVE.LEAGUES_PICK' | translate }}</button>
                } @else if (lgList() === undefined) {
                    <p class="note">{{ 'MPX.ALERTS.LOADING' | translate }}</p>
                } @else {
                    <div class="lg-list">
                        <label class="plat">
                            <input type="checkbox" [checked]="!live.leagues().length" (change)="live.setLeagues([])" />
                            <span>{{ 'MPX.LIVE.LEAGUES_ALL' | translate }}</span>
                        </label>
                        @for (l of lgList(); track l.id) {
                            <label class="plat" data-test-id="league">
                                <input type="checkbox" [checked]="chosen().has(l.id)" (change)="toggle(l)" />
                                @if (l.b) {
                                    <img [src]="l.b + '/tiny'" alt="" loading="lazy" />
                                }
                                <span>
                                    {{ l.n }}
                                    @if (!live.pref()) {
                                        <small>· {{ sportLabel(l.sp) }}</small>
                                    }
                                    @if (l.today) {
                                        <small class="today">· {{ 'MPX.LIVE.LEAGUES_TODAY' | translate: { n: l.today } }}</small>
                                    }
                                </span>
                            </label>
                        } @empty {
                            <p class="note">{{ 'MPX.LIVE.LEAGUES_NONE' | translate }}</p>
                        }
                    </div>
                    <button mat-button type="button" (click)="lgOpen.set(false)">{{ 'MPX.LIVE.CLOSE' | translate }}</button>
                }

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
        .lg-list { max-height: 320px; overflow-y: auto; margin: 6px 0; padding-right: 6px; }
        .lg-list .plat { margin-top: 8px; }
        .lg-list img { width: 22px; height: 22px; object-fit: contain; }
        .lg-list small { opacity: 0.65; }
        .lg-list .today { color: var(--nf-red, #e50914); opacity: 1; }
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

    /** Ligas favoritas: lista abierta; undefined = cargando */
    protected readonly lgOpen = signal(false);
    protected readonly lgList = signal<LeagueChoice[] | undefined>(undefined);
    protected readonly chosen = computed(() => new Set(this.live.leagues().map((l) => l.id)));
    protected readonly leaguesText = computed(() => {
        const l = this.live.leagues();
        if (!l.length) return this.translate.instant('MPX.LIVE.LEAGUES_ALL');
        return l.length === 1 ? l[0].n : this.translate.instant('MPX.LIVE.LEAGUES_N', { n: l.length });
    });
    private readonly data = inject(SportsDataService);

    constructor() {
        void this.live.ensure();
        void this.data
            .loadAgenda()
            .then((a) => a?.sports && this.apiSports.set(a.sports))
            .catch(() => undefined);
    }

    protected sportLabel(sp: string): string {
        return LIVE_SPORT_CHOICES.includes(sp) ? this.translate.instant('MPX.LIVE.SP.' + sp) : this.apiSports()[sp]?.label || sp;
    }

    protected async openLeagues(): Promise<void> {
        this.lgOpen.set(true);
        this.lgList.set(undefined);
        const [ag, fx] = await Promise.all([this.data.loadAgenda().catch(() => null), this.alerts.fixtures(true).catch(() => null)]);
        this.lgList.set(leagueChoices(ag?.events ?? [], fx?.on ? fx.leagues : undefined, this.live.leagues(), this.live.pref()));
    }

    protected toggle(l: FavLeague): void {
        const cur = this.live.leagues();
        this.live.setLeagues(cur.some((x) => x.id === l.id) ? cur.filter((x) => x.id !== l.id) : [...cur, { id: l.id, n: l.n, b: l.b, sp: l.sp }]);
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
