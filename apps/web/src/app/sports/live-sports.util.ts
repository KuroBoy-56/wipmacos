import { PanelLiveEvent } from '@iptvnator/services';
import { SportsChannelsMap, SportsEventChannels } from './sports-data.service';

/** A live match of the Home row with its channels; ch.best always exists (only matches the client can watch). */
export interface LiveCard {
    e: PanelLiveEvent;
    ch: SportsEventChannels;
}

/** disciplinas sin equipos ni marcador (peleas, boxeo, WWE, carreras, golf…): la tarjeta va con el evento y su póster */
const SOLO_SPORTS = new Set(['fighting', 'boxing', 'wrestling', 'mma', 'motorsport', 'golf', 'cycling', 'athletics']);

/** sin dos equipos o de una disciplina sin marcador: la disciplina, el nombre del evento y su póster (como las TV) */
export function isSoloEvent(e: Pick<PanelLiveEvent, 'h' | 'a' | 'sp'>): boolean {
    return !e.h || !e.a || SOLO_SPORTS.has((e.sp || '').toLowerCase());
}

/** el nombre del evento sin equipos (el de la agenda, o los dos nombres, o la liga) */
export function soloName(e: Pick<PanelLiveEvent, 'h' | 'a' | 'ev' | 'lg'>): string {
    return e.ev || [e.h, e.a].filter(Boolean).join(' vs ') || e.lg;
}

/** Field drawn behind the card, by sport (same groups as Android). '' = a dark gradient. */
export function fieldKind(sport: string): string {
    switch ((sport || '').toLowerCase()) {
        case 'soccer':
        case 'futsal':
        case 'beach soccer':
            return 'soccer';
        case 'basketball':
            return 'basketball';
        case 'american football':
        case 'australian football':
        case 'rugby':
        case 'rugby league':
        case 'rugby union':
            return 'american';
        case 'baseball':
            return 'baseball';
        case 'ice hockey':
        case 'field hockey':
            return 'hockey';
        case 'tennis':
        case 'volleyball':
        case 'badminton':
        case 'table tennis':
            return 'court';
        default:
            return '';
    }
}

/** Big competitions get a light gradient in their colours over the field (Champions blue, Libertadores gold…). */
export function competitionTheme(league: string): string {
    const l = (league || '').toLowerCase();
    if (l.includes('champions league') && !l.includes('afc') && !l.includes('caf'))
        return 'linear-gradient(135deg, rgba(10,26,107,.7), rgba(27,63,176,.55), rgba(10,26,107,.4))';
    if (l.includes('europa league') || l.includes('conference league')) return 'linear-gradient(135deg, rgba(242,107,29,.6), rgba(0,0,0,.4))';
    if (l.includes('libertadores')) return 'linear-gradient(135deg, rgba(201,162,39,.6), rgba(59,42,0,.5))';
    if (l.includes('sudamericana')) return 'linear-gradient(135deg, rgba(0,82,159,.6), rgba(201,162,39,.4))';
    if (l.includes('world cup') || l.includes('mundial')) return 'linear-gradient(135deg, rgba(92,10,26,.6), rgba(201,162,39,.5))';
    if (l.includes('copa america') || l.includes('copa américa')) return 'linear-gradient(135deg, rgba(11,61,145,.6), rgba(200,16,46,.5))';
    if (l === 'nba' || l.startsWith('nba ')) return 'linear-gradient(135deg, rgba(23,64,139,.6), rgba(201,8,42,.5))';
    if (l === 'english premier league') return 'linear-gradient(135deg, rgba(61,25,91,.6), rgba(0,255,133,.4))';
    return '';
}

/** "67'", half time, "Q3 5:21"… what TheSportsDB says about the moment of the match. */
export function clockText(e: Pick<PanelLiveEvent, 'st' | 'pr'>, halfTime: string): string {
    const st = (e.st || '').trim();
    const pr = (e.pr || '').trim();
    if (st.toUpperCase() === 'HT' || pr.toUpperCase() === 'HT') return halfTime;
    if (pr && /^\d+$/.test(pr)) return `${pr}'`;
    return pr || st;
}

/** Score side: '' (not given yet) shows 0. */
export function score(v: string | number | null | undefined): string {
    const s = v === null || v === undefined ? '' : String(v).trim();
    return s === '' ? '0' : s;
}

/**
 * The row's cards: the preferred sport only (Ajustes; '' = all) and only matches with a real channel of the client's
 * IPTV server (the one that broadcasts it, the panel guide's or by teams): without one the match does not show.
 */
/** tarjetas de la fila de Inicio: en vivo y próximos */
export const LIVE_ROW_MAX = 20;

export function liveCards(events: readonly PanelLiveEvent[], map: SportsChannelsMap | null, pref: string, now = Date.now()): LiveCard[] {
    if (!map) return [];
    const out: LiveCard[] = [];
    for (const e of events) {
        if (pref && e.sp !== pref) continue;
        // un próximo que ya empezó hace más de 5 min y el livescore no trae: fuera hasta la próxima respuesta
        if (e.soon && e.s && e.s * 1000 < now - 5 * 60_000) continue;
        const ch = map.byEvent[String(e.id)];
        // solo un canal exacto: uno «habitual» (sin agenda, guía ni equipos) no cuenta
        if (ch?.best && !ch.guess) out.push({ e, ch });
    }
    // en vivo primero, después los próximos por hora; como mucho LIVE_ROW_MAX (al final va «Ir a Deportes»)
    return out
        .sort((x, y) => Number(!!x.e.soon) - Number(!!y.e.soon) || (x.e.s || 9e12) - (y.e.s || 9e12))
        .slice(0, LIVE_ROW_MAX);
}

/** Sports for Ajustes › Deporte preferido (TheSportsDB names; the label is MPX.LIVE.SP.<key>). */
export const LIVE_SPORT_CHOICES = [
    'Soccer', 'Basketball', 'American Football', 'Baseball', 'Ice Hockey', 'Tennis', 'Motorsport', 'Fighting', 'Boxing',
    'Rugby', 'Volleyball', 'Handball', 'Golf', 'Cricket', 'Esports',
];
