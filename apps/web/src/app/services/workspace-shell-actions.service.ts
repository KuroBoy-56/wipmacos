import { inject, Injectable, Provider } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { PORTAL_SHELL_ACTIONS } from '@iptvnator/portal/shared/util';
import {
    WORKSPACE_SHELL_ACTIONS,
    WorkspaceAccountInfoData,
    WorkspacePlaylistType,
    WorkspaceShellActions,
} from '@iptvnator/workspace/shell/util';

@Injectable({ providedIn: 'root' })
export class AppWorkspaceShellActionsService implements WorkspaceShellActions {
    private readonly dialog = inject(MatDialog);
    private readonly router = inject(Router);

    /**
     * MPX Player only plays the line the panel gives the device (panel-login/): there is no
     * dialog to add an M3U, Xtream or Stalker source by hand. Every old "add" entry point
     * (sources, dashboard, empty states) lands here and just goes back to the panel line.
     */
    openAddPlaylistDialog(_type?: WorkspacePlaylistType): void {
        void this.router.navigate(['/workspace']);
    }

    openGlobalSearch(initialQuery = ''): void {
        const query = initialQuery.trim();
        void this.router.navigate(['/workspace/search'], {
            queryParams: query ? { q: query } : {},
        });
    }

    openGlobalRecent(): void {
        void this.router.navigate(['/workspace/global-recent']);
    }

    openAccountInfo(data: WorkspaceAccountInfoData): void {
        void import('@iptvnator/portal/xtream/feature').then(
            ({ AccountInfoComponent }) => {
                this.dialog.open(AccountInfoComponent, {
                    width: '80%',
                    maxWidth: '1200px',
                    maxHeight: '90vh',
                    data,
                });
            }
        );
    }
}

export function provideWorkspaceShellActions(): Provider[] {
    return [
        AppWorkspaceShellActionsService,
        {
            provide: WORKSPACE_SHELL_ACTIONS,
            useExisting: AppWorkspaceShellActionsService,
        },
        {
            provide: PORTAL_SHELL_ACTIONS,
            useExisting: AppWorkspaceShellActionsService,
        },
    ];
}
