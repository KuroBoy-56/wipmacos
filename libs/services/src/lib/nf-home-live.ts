import { InjectionToken, Signal, Type } from '@angular/core';

/**
 * Fila que la app pone en Inicio en el lugar de «Plataformas»: los partidos en vivo (apps/web/src/app/sports/live-sports*, la provee app.config).
 * Inicio la engancha mientras está abierto (attach devuelve cómo soltarla) y, con enabled, la muestra en lugar de las
 * plataformas. Sin la fila (otra app, o el token sin proveer) Inicio queda como siempre.
 */
export interface NfHomeLive {
    readonly enabled: Signal<boolean>;
    /** Ajustes › Habilitar tarjetas de plataformas: con la fila en vivo, las plataformas van debajo de ella */
    readonly platformCards?: Signal<boolean>;
    /** Inicio no muestra las plataformas (perfiles + partidos en vivo, sin el ajuste); antes de la respuesta, lo último */
    readonly hidesPlatforms?: Signal<boolean>;
    readonly component: Type<unknown>;
    attach(): () => void;
}

export const NF_HOME_LIVE = new InjectionToken<NfHomeLive>('NF_HOME_LIVE');
