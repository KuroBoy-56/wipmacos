import { computed, Injectable, signal } from '@angular/core';
import { isAdultName, readBlockedCats, readHideAdult, readParentalPin, saveBlockedCats, saveHideAdult, saveParentalPin } from '@iptvnator/shared/interfaces';

/**
 * Estado del control parental de la app abierta (como Roku): «Ocultar canales y categorías para adultos» (encendido de
 * fábrica), «Bloquear categorías» (las elegidas, "tipo:id") y «Contenido protegido en esta sesión»: con el PIN del panel
 * se ve todo hasta cerrar la app. Mientras está bloqueado, esas categorías (y sus títulos) no aparecen en Inicio,
 * Películas, Series, Explorar ni TV en vivo.
 */
@Injectable({ providedIn: 'root' })
export class ParentalControlService {
    private readonly hide = signal(readHideAdult());
    private readonly unlockedNow = signal(false);

    /** «Ocultar contenido para adultos» encendido */
    readonly hideAdult = this.hide.asReadonly();
    /** desbloqueado con el PIN en esta sesión */
    readonly unlocked = this.unlockedNow.asReadonly();
    /** las categorías para adultos se ocultan */
    readonly locked = computed(() => this.hide() && !this.unlockedNow());

    /** ¿esta categoría se oculta ahora? */
    hides(categoryName: string | null | undefined): boolean {
        return this.locked() && isAdultName(categoryName);
    }

    private readonly blockedKeys = signal<ReadonlySet<string>>(new Set(readBlockedCats()));
    /** categorías bloqueadas ("tipo:id") */
    readonly blocked = this.blockedKeys.asReadonly();

    /** ¿se oculta ahora? adultos (si están ocultos) o bloqueada (key "tipo:id"), salvo desbloqueado en esta sesión */
    private isHidden(name: string, key?: string): boolean {
        if (this.unlockedNow()) return false;
        return (this.hide() && isAdultName(name)) || (!!key && this.blockedKeys().has(key));
    }

    /** las categorías visibles; keyOf ("tipo:id") para las bloqueadas */
    visible<T>(categories: readonly T[], nameOf: (c: T) => string, keyOf?: (c: T) => string): T[] {
        if (this.unlockedNow() || (!this.hide() && (!keyOf || !this.blockedKeys().size))) return [...categories];
        return categories.filter((c) => !this.isHidden(nameOf(c), keyOf?.(c)));
    }

    /** ids de las categorías ocultas de una lista; kind ("vod", "series", "live") para las bloqueadas */
    hiddenIds<T>(categories: readonly T[], nameOf: (c: T) => string, idOf: (c: T) => string, kind?: string): Set<string> {
        const out = new Set<string>();
        if (this.unlockedNow()) return out;
        for (const c of categories) if (this.isHidden(nameOf(c), kind ? kind + ':' + idOf(c) : undefined)) out.add(idOf(c));
        return out;
    }

    /** «Bloquear categorías»: bloquea o desbloquea una ("tipo:id") */
    toggleBlocked(key: string): void {
        const next = new Set(this.blockedKeys());
        if (next.has(key)) next.delete(key);
        else next.add(key);
        saveBlockedCats([...next]);
        this.blockedKeys.set(next);
    }

    /** ¿es el PIN del panel? (sin desbloquear nada) */
    checkPin(pin: string): boolean {
        return pin.trim() === readParentalPin();
    }

    /** true = PIN correcto: todo lo protegido (adultos y bloqueadas) se ve hasta cerrar la app */
    unlock(pin: string): boolean {
        if (pin.trim() !== readParentalPin()) return false;
        this.unlockedNow.set(true);
        return true;
    }

    lock(): void {
        this.unlockedNow.set(false);
    }

    /** apagar «Ocultar…» pide el PIN; encenderlo no */
    setHideAdult(hide: boolean, pin = ''): boolean {
        if (!hide && pin.trim() !== readParentalPin()) return false;
        saveHideAdult(hide);
        this.hide.set(hide);
        if (hide) this.unlockedNow.set(false);
        return true;
    }

    /** el PIN que guardó el panel (check_mac / set_pin) */
    rememberPin(pin: unknown): void {
        saveParentalPin(pin);
    }

    /** cerrar sesión: se vuelve a bloquear */
    reset(): void {
        this.unlockedNow.set(false);
    }
}
