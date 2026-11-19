import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateChildFn, Router, RouterStateSnapshot } from '@angular/router';
import { KidsFilterService, ProfilesService } from '@iptvnator/services';

/** Pantallas que el perfil infantil no abre (docs/PERFILES.md del panel, sección 5): vuelven al inicio. */
const KIDS_BLOCKED = [/^\/workspace\/sports/, /^\/workspace\/search/, /^\/workspace\/global-(favorites|recent)/, /^\/workspace\/downloads/, /^\/workspace\/xtreams\/[^/]+\/(search|recently-added|favorites|recent|downloads)(\/|$|\?)/,
    // Las rejillas viejas por categoría (vod/:categoryId) no pasan por el filtro infantil del catálogo.
    /^\/workspace\/xtreams\/[^/]+\/(vod|series)\/[^/?]+(\?|$)/];
const DETAIL = /^\/workspace\/xtreams\/[^/]+\/(vod|series)\/[^/]+\/([^/?]+)/;

/**
 * Antes de cada pantalla del workspace: si la línea elige perfil (perfiles encendidos por el dueño y más de una
 * conexión) y todavía no lo eligió, primero «¿Quién está viendo?». Con un perfil infantil, lo que no es para niños no
 * se abre aunque llegue por otro camino. Sin perfiles, nada cambia.
 */
export const profilesGateGuard: CanActivateChildFn = async (_route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
    const profiles = inject(ProfilesService);
    const router = inject(Router);
    // antes del await: después ya no hay contexto de inyección
    const kidsFilter = inject(KidsFilterService);
    await profiles.ensure();
    if (profiles.needed() && !profiles.profile()) {
        return router.createUrlTree(['/profiles'], { queryParams: { next: state.url } });
    }
    if (profiles.kids()) {
        const url = state.url;
        if (KIDS_BLOCKED.some((re) => re.test(url))) return router.parseUrl('/workspace');
        const detail = DETAIL.exec(url);
        if (detail && !kidsFilter.allows(detail[1] === 'series' ? 'series' : 'vod', detail[2])) {
            return router.parseUrl('/workspace');
        }
    }
    return true;
};
