import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { PanelAccount, PanelLoginService } from './panel-login.service';
import { PanelSessionService } from './panel-session.service';

/** How often the running app asks the panel whether this device still has its line. */
const RECHECK_MS = 10 * 60_000;

/**
 * Keeps an open session tied to the panel while the app runs: a demo ends at
 * its exact time and a line the panel no longer gives this device (deleted,
 * expired demo) or a device put on the panel's blacklist closes the session
 * and goes back to /login. A panel that does not answer changes nothing.
 *
 * «No longer gives» = it gave it before (`lineSeen`). When the panel never
 * gave this device its line (the user typed user and password and the panel
 * accepted them), a «no line» answer does not throw the client out after 10
 * minutes: that happened to clients their distributor had removed from its list.
 */
@Injectable({ providedIn: 'root' })
export class PanelSessionGuardService {
    private readonly panel = inject(PanelLoginService);
    private readonly session = inject(PanelSessionService);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);
    private timer: ReturnType<typeof setInterval> | null = null;
    private lastCheck = 0;
    private lineSeen = true;

    /** lineSeen: the panel gave this device the line (check_mac or a new demo), not only typed credentials. */
    watch(account: PanelAccount, lineSeen = true): void {
        this.stop();
        this.lineSeen = lineSeen;
        this.lastCheck = Date.now();
        this.timer = setInterval(() => void this.tick(account), 30_000);
    }

    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async tick(account: PanelAccount, now = Date.now()): Promise<void> {
        const demoOver = !!account.isDemo && (account.demoExpires ?? 0) > 0 && now / 1000 >= (account.demoExpires ?? 0);
        if (!demoOver) {
            if (now - this.lastCheck < RECHECK_MS) return;
            this.lastCheck = now;
            // no line any more, or the device was put on the panel's blacklist: back to /login (which shows why)
            const status = (await this.panel.checkDevice(true)).status;
            if (status === 'active') this.lineSeen = true;
            if (status !== 'blocked' && !(status === 'inactive' && this.lineSeen)) return;
        }
        this.stop();
        await this.session.clear();
        this.auth.logout();
        await this.router.navigate(['/login']);
    }
}
