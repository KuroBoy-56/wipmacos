import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { RuntimeCapabilitiesService } from '@iptvnator/services';
import { readTenantFeatures } from '@iptvnator/shared/interfaces';
import { WorkspaceStartupPreferencesService } from '@iptvnator/workspace/shell/util';
import { LoginComponent } from './login.component';
import { reviewThemeGuard, ReviewThemeService } from './panel-login/review/review-theme.service';
import { AuthGuard } from './auth.guard';
import { profilesGateGuard } from './profiles/profiles.guard';
import { panelSourceGuard } from './panel-login/panel-source.guard';

const workspaceEntryRedirect = async () =>
    inject(WorkspaceStartupPreferencesService).resolveInitialWorkspacePath();

const dashboardAccessGuard = async () => {
    const startupPreferences = inject(WorkspaceStartupPreferencesService);
    const router = inject(Router);
    const redirectPath = await startupPreferences.resolveDashboardPath();

    return redirectPath === '/workspace/dashboard'
        ? true
        : router.parseUrl(redirectPath);
};

export function resolveElectronOnlyGlobalSearchRoute(
    runtime: Pick<RuntimeCapabilitiesService, 'isElectron'>,
    router: Pick<Router, 'parseUrl'>
) {
    return runtime.isElectron ? true : router.parseUrl('/workspace/sources');
}

const electronOnlyGlobalSearchGuard = () => {
    return resolveElectronOnlyGlobalSearchRoute(
        inject(RuntimeCapabilitiesService),
        inject(Router)
    );
};

/** The distributor can turn the sports section off. */
const sportsEnabledGuard = () =>
    readTenantFeatures().sports ? true : inject(Router).parseUrl('/workspace');

export const routes: Routes = [
    {
        path: 'login',
        component: LoginComponent
    },
    {
        // tema de prueba del dueño (Pantalla Falsa, con Omitir): solo después de review_login
        path: 'review',
        canActivate: [() => reviewThemeGuard(inject(ReviewThemeService)) || inject(Router).parseUrl('/login')],
        loadComponent: () =>
            import('./panel-login/review/review-theme.component').then((c) => c.ReviewThemeComponent),
    },
    {
        path: '',
        pathMatch: 'full',
        redirectTo: 'login',
    },
    {
        // «¿Quién está viendo?» (perfiles del panel, solo con los perfiles encendidos por el dueño)
        path: 'profiles',
        canActivate: [AuthGuard],
        loadComponent: () =>
            import('./profiles/profiles-page.component').then((c) => c.ProfilesPageComponent),
    },
    {
        path: 'workspace',
        canActivate: [AuthGuard],
        // la línea elige perfil y todavía no lo eligió: primero «¿Quién está viendo?» (profiles.guard.ts);
        // solo se abre la línea que dio el panel (panel-source.guard.ts)
        canActivateChild: [profilesGateGuard, panelSourceGuard],
        data: {
            layout: 'workspace',
        },
        loadComponent: () =>
            import('@iptvnator/workspace/shell/feature').then(
                (c) => c.WorkspaceShellComponent
            ),
        children: [
            {
                path: '',
                pathMatch: 'full',
                redirectTo: workspaceEntryRedirect,
            },
            {
                path: 'dashboard',
                canActivate: [dashboardAccessGuard],
                loadComponent: () =>
                    import('@iptvnator/workspace/dashboard/feature').then(
                        (c) => c.WorkspaceDashboardRailsComponent
                    ),
            },
            {
                path: 'sources',
                loadComponent: () =>
                    import('@iptvnator/workspace/shell/feature').then(
                        (c) => c.WorkspaceSourcesComponent
                    ),
            },
            {
                path: 'playlists/:id',
                loadChildren: () =>
                    import('@iptvnator/playlist/m3u/feature-player').then((m) =>
                        m.createM3uWorkspaceRoutes()
                    ),
            },
            {
                path: 'global-favorites',
                data: {
                    mode: 'favorites',
                    defaultScope: 'all',
                },
                loadComponent: () =>
                    import('./global-collection-route.component').then(
                        (c) => c.GlobalCollectionRouteComponent
                    ),
            },
            {
                path: 'global-recent',
                data: {
                    mode: 'recent',
                    defaultScope: 'all',
                },
                loadComponent: () =>
                    import('./global-collection-route.component').then(
                        (c) => c.GlobalCollectionRouteComponent
                    ),
            },
            {
                path: 'search',
                canActivate: [electronOnlyGlobalSearchGuard],
                data: {
                    isGlobalSearch: true,
                },
                loadComponent: () =>
                    import('@iptvnator/portal/xtream/feature').then(
                        (c) => c.GlobalSearchResultsComponent
                    ),
            },
            {
                path: 'sports',
                canActivate: [sportsEnabledGuard],
                loadComponent: () =>
                    import('./sports/sports.component').then(
                        (c) => c.SportsComponent
                    ),
            },
            {
                path: 'downloads',
                loadComponent: () =>
                    import('@iptvnator/portal/downloads/feature').then(
                        (c) => c.DownloadsComponent
                    ),
            },
            {
                path: '',
                loadChildren: () =>
                    import('@iptvnator/portal/xtream/feature').then((m) =>
                        m.createXtreamRoutes()
                    ),
            },
            {
                path: '',
                loadChildren: () =>
                    import('@iptvnator/portal/stalker/feature').then((m) =>
                        m.createStalkerRoutes()
                    ),
            },
            {
                path: 'settings',
                loadComponent: () =>
                    import('./settings/settings.component').then(
                        (c) => c.SettingsComponent
                    ),
            },
        ],
    },
    {
        path: 'settings',
        redirectTo: '/workspace/settings',
        pathMatch: 'full',
    },
    {
        path: '**',
        redirectTo: '',
    },
];