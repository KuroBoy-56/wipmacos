/**
 * Control parental (como Roku, Vega, Android, iOS y las TV): las categorías para adultos se ocultan siempre y se
 * desbloquean con el PIN del equipo que guarda el panel (check_mac → "pin", 0000 de fábrica). El PIN se cambia en el
 * panel con login.php acción set_pin (pide el actual). Funciones puras: el estado vive en ParentalControlService.
 */

/** Mismas palabras que las demás apps. */
export const ADULT_CATEGORY_RE = /adult|xxx|\+18|18\+|porn|erot|playboy|hot ?club|venus/i;

export function isAdultName(name: string | null | undefined): boolean {
    return ADULT_CATEGORY_RE.test(String(name ?? ''));
}

export const DEFAULT_PARENTAL_PIN = '0000';
const PIN_KEY = 'parental_pin';
const HIDE_KEY = 'parental_hide_adult';

export function isParentalPin(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}$/.test(value);
}

export function readParentalPin(): string {
    try {
        const v = localStorage.getItem(PIN_KEY);
        return isParentalPin(v) ? v : DEFAULT_PARENTAL_PIN;
    } catch {
        return DEFAULT_PARENTAL_PIN;
    }
}

/** Al cerrar la sesión: el próximo usuario usa el PIN que le dé el panel (0000 hasta entonces), nunca el del anterior. */
export function clearParentalPin(): void {
    try {
        localStorage.removeItem(PIN_KEY);
    } catch {
        /* storage blocked */
    }
}

/**
 * «Ocultar…» y las categorías bloqueadas son de cada línea (usuario@servidor): otro usuario en el equipo empieza de
 * cero y el anterior encuentra lo suyo al volver. Lo guardado antes para todo el equipo pasa a la primera línea que
 * entra. Sin línea (sin sesión) se usa la clave de siempre.
 */
function lineScoped(key: string, line: string): string {
    if (!line) return key;
    const own = key + '|' + line;
    try {
        const old = localStorage.getItem(key);
        if (old !== null) {
            if (localStorage.getItem(own) === null) localStorage.setItem(own, old);
            localStorage.removeItem(key);
        }
    } catch {
        /* storage blocked */
    }
    return own;
}

/** El PIN que dice el panel (check_mac / set_pin); otro valor no se guarda. */
export function saveParentalPin(pin: unknown): void {
    if (!isParentalPin(pin)) return;
    try {
        localStorage.setItem(PIN_KEY, pin);
    } catch {
        /* storage blocked */
    }
}

/** «Ocultar contenido para adultos»: encendido de fábrica. line = lineKey de la sesión */
export function readHideAdult(line = ''): boolean {
    try {
        return localStorage.getItem(lineScoped(HIDE_KEY, line)) !== '0';
    } catch {
        return true;
    }
}

/** «Bloquear categorías» (como Roku): claves "tipo:id" (vod, series, live) de las categorías bloqueadas. */
const BLOCKED_KEY = 'parental_blocked_cats';

export function readBlockedCats(line = ''): string[] {
    try {
        const v = JSON.parse(localStorage.getItem(lineScoped(BLOCKED_KEY, line)) || '[]');
        return Array.isArray(v) ? v.map(String) : [];
    } catch {
        return [];
    }
}

export function saveBlockedCats(keys: readonly string[], line = ''): void {
    try {
        localStorage.setItem(lineScoped(BLOCKED_KEY, line), JSON.stringify([...keys]));
    } catch {
        /* storage blocked */
    }
}

export function saveHideAdult(hide: boolean, line = ''): void {
    try {
        localStorage.setItem(lineScoped(HIDE_KEY, line), hide ? '1' : '0');
    } catch {
        /* storage blocked */
    }
}
