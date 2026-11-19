import type { PortalStatus } from '@iptvnator/services';

export type LineServerCheck = (server: string) => Promise<PortalStatus>;

/** Longest wait for one server (http or https) before it counts as «no contestó». */
export const LINE_SERVER_PROBE_TIMEOUT_MS = 12_000;
/** After this, the servers still to probe go at the same time so the login does not wait too long. */
export const LINE_SERVER_PARALLEL_AFTER_MS = 20_000;

export interface LineServerOptions {
    /** the DNS this user logged in with last time on this computer: probed first, alone */
    first?: string;
    probeTimeoutMs?: number;
    parallelAfterMs?: number;
    /** no server answered at all: one note per server for the panel («Errores de las apps») */
    onUnreachable?: (notes: string[]) => void;
}

type Probe = { server: string; status: PortalStatus };

const hostKey = (url: string): string =>
    url
        .trim()
        .replace(/^[a-z]+:\/\//i, '')
        .replace(/\/.*$/, '')
        .toLowerCase();
const withScheme = (url: string, scheme: 'http' | 'https'): string =>
    /^[a-z]+:\/\//i.test(url.trim()) ? url.trim().replace(/^[a-z]+:\/\//i, `${scheme}://`) : `${scheme}://${url.trim()}`;
const accepted = (r: Probe): boolean => r.status === 'active' || r.status === 'expired';

/**
 * Picks the panel DNS (fetch_dns) that serves the typed user and password, so the login screen needs no server
 * selector. Rule of docs/LOGIN-SERVIDORES.md in the panel (so XUI does not block the client's IP, often shared):
 * the last good DNS of this user first, then one at a time and stop at the first that accepts the line, once per
 * real server (host + port), https only when http did not answer, and the rest at the same time after 20 s.
 * When some server said no, that one (the panel's activation gives the message); when none answered, the first
 * server and `onUnreachable`.
 */
export async function pickLineServer(
    servers: readonly string[],
    check: LineServerCheck,
    opts: LineServerOptions = {}
): Promise<string | null> {
    if (servers.length <= 1) return servers[0] ?? null;
    const { first = '', probeTimeoutMs = LINE_SERVER_PROBE_TIMEOUT_MS, parallelAfterMs = LINE_SERVER_PARALLEL_AFTER_MS } = opts;

    const seen = new Set<string>();
    const list: string[] = [];
    for (const s of servers) {
        const k = hostKey(s);
        if (k && !seen.has(k)) {
            seen.add(k);
            list.push(s);
        }
    }
    const firstKey = hostKey(first);
    list.sort((a, b) => Number(hostKey(b) === firstKey) - Number(hostKey(a) === firstKey));

    const probe = (url: string): Promise<PortalStatus> =>
        new Promise((resolve) => {
            const timer = setTimeout(() => resolve('unavailable'), probeTimeoutMs);
            check(url)
                .catch((): PortalStatus => 'unavailable')
                .then((status) => {
                    clearTimeout(timer);
                    resolve(status);
                });
        });
    // http first; https only when http did not answer (never both at once: two attempts for XUI)
    const tryServer = async (s: string): Promise<Probe> => {
        const plain = withScheme(s, 'http');
        const a = await probe(plain);
        if (a !== 'unavailable') return { server: plain, status: a };
        const secure = withScheme(s, 'https');
        return { server: secure, status: await probe(secure) };
    };

    const notes: string[] = [];
    let denied: string | null = null;
    const keep = (r: Probe): void => {
        if (r.status === 'unavailable') notes.push(`${hostKey(r.server)}: no contestó (http ni https)`);
        else denied ??= r.server;
    };

    const started = Date.now();
    for (let i = 0; i < list.length; i++) {
        if (Date.now() - started >= parallelAfterMs && list.length - i > 1) {
            const rest = list.slice(i);
            const hit = await new Promise<Probe | null>((resolve) => {
                let left = rest.length;
                rest.forEach((s) =>
                    void tryServer(s).then((r) => {
                        if (accepted(r)) return resolve(r);
                        keep(r);
                        if (--left === 0) resolve(null);
                    })
                );
            });
            if (hit) return hit.server;
            break;
        }
        const r = await tryServer(list[i]);
        if (accepted(r)) return r.server;
        keep(r);
    }
    if (denied) return denied;
    opts.onUnreachable?.(notes);
    return servers[0];
}

const lastKey = (user: string): string => 'login_dns|' + user.trim().toLowerCase();

/** The DNS this user logged in with last time on this computer ('' = none). */
export function lastLineServer(user: string): string {
    try {
        return localStorage.getItem(lastKey(user)) ?? '';
    } catch {
        return '';
    }
}

export function rememberLineServer(user: string, server: string): void {
    try {
        localStorage.setItem(lastKey(user), server);
    } catch {
        // storage blocked: probed in the usual order next time
    }
}
