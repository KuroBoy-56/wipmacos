import { inject, Injectable } from '@angular/core';
import { ProfilesService } from '@iptvnator/services';
import { AuthService } from '../auth.service';
import { PanelSessionGuardService } from './panel-session-guard.service';
import { PanelSessionService } from './panel-session.service';

/**
 * «Cerrar sesión» a mano (menú del perfil o el tema de prueba, /login?out=1): cierra la sesión y desde ahí el inicio de
 * sesión no le pregunta al panel (check_mac) ni entra solo mientras la app siga abierta. Solo en memoria: al volver a
 * abrir la app entra sola como siempre. La línea del equipo se pide con «Verificar activación».
 */
@Injectable({ providedIn: 'root' })
export class PanelSignOutService {
    private readonly session = inject(PanelSessionService);
    private readonly guard = inject(PanelSessionGuardService);
    private readonly auth = inject(AuthService);
    private readonly profiles = inject(ProfilesService);
    private byHand = false;

    /** se cerró sesión a mano y todavía no se volvió a entrar */
    get signedOut(): boolean {
        return this.byHand;
    }

    async signOut(): Promise<void> {
        this.byHand = true;
        this.guard.stop();
        this.profiles.forget();
        await this.session.clear();
        this.auth.logout();
    }

    /** se entró otra vez (o se cambió de distribuidor) */
    signedIn(): void {
        this.byHand = false;
    }
}
