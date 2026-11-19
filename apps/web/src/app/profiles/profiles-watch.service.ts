import { effect, inject, Injectable, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ProfilesService } from '@iptvnator/services';
import { PanelCacheSyncService } from '../services/panel-cache-sync.service';

/**
 * Al cambiar de perfil, la copia local de Continuar viendo y Mi lista se arma otra vez con lo de ese perfil; si el
 * panel dice que el perfil ya no existe (410, eliminado en otro equipo), vuelve a «¿Quién está viendo?».
 */
@Injectable({ providedIn: 'root' })
export class ProfilesWatchService {
    private readonly profiles = inject(ProfilesService);
    private readonly cacheSync = inject(PanelCacheSyncService);
    private readonly router = inject(Router);
    /** perfil con el que se armó la copia local ('' = el principal, el de siempre al abrir la app) */
    private cachedFor = '';

    constructor() {
        effect(() => {
            const p = this.profiles.profile();
            const id = p && p.id !== 'main' ? p.id : '';
            untracked(() => {
                if (id === this.cachedFor) return;
                this.cachedFor = id;
                void this.cacheSync.syncAll();
            });
        });
        effect(() => {
            if (!this.profiles.gone()) return;
            untracked(() => void this.router.navigate(['/profiles']));
        });
    }
}
