import type { PortalStatus } from '@iptvnator/services';
import { lastLineServer, pickLineServer, rememberLineServer } from './line-server.util';

const SERVERS = ['http://a.test', 'http://b.test', 'http://c.test'];

function checker(statuses: Record<string, PortalStatus | Error>) {
    return jest.fn((server: string) => {
        const value = statuses[server] ?? 'unavailable';
        return value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
    });
}

describe('pickLineServer (one DNS at a time, docs/LOGIN-SERVIDORES.md of the panel)', () => {
    it('uses the only server without probing', async () => {
        const check = jest.fn();
        await expect(pickLineServer(['http://a.test'], check)).resolves.toBe('http://a.test');
        await expect(pickLineServer([], check)).resolves.toBeNull();
        expect(check).not.toHaveBeenCalled();
    });

    it('probes one at a time and stops at the first server that accepts the line', async () => {
        let running = 0;
        let most = 0;
        const statuses: Record<string, PortalStatus> = { 'http://a.test': 'inactive', 'http://b.test': 'active', 'http://c.test': 'active' };
        const check = jest.fn(async (server: string) => {
            most = Math.max(most, ++running);
            await Promise.resolve();
            running--;
            return statuses[server] ?? 'unavailable';
        });
        await expect(pickLineServer(SERVERS, check)).resolves.toBe('http://b.test');
        expect(check.mock.calls.map((c) => c[0])).toEqual(['http://a.test', 'http://b.test']);
        expect(most).toBe(1);
    });

    it('starts with the last good DNS of this user, alone', async () => {
        const check = checker({ 'http://c.test': 'active' });
        await expect(pickLineServer(SERVERS, check, { first: 'https://C.test/' })).resolves.toBe('http://c.test');
        expect(check).toHaveBeenCalledTimes(1);
    });

    it('tries https only when http did not answer, once per real server', async () => {
        const check = checker({ 'http://a.test': new Error('ECONNREFUSED'), 'https://a.test': 'inactive', 'https://b.test:8443': 'expired' });
        const servers = ['https://a.test', 'http://a.test', 'https://b.test:8443'];
        await expect(pickLineServer(servers, check)).resolves.toBe('https://b.test:8443');
        expect(check.mock.calls.map((c) => c[0])).toEqual(['http://a.test', 'https://a.test', 'http://b.test:8443', 'https://b.test:8443']);
    });

    it('returns a server that said no (the panel gives the message), and reports when none answered', async () => {
        const denied = checker({ 'http://b.test': 'inactive' });
        await expect(pickLineServer(SERVERS, denied)).resolves.toBe('http://b.test');

        const onUnreachable = jest.fn();
        await expect(pickLineServer(SERVERS, checker({}), { onUnreachable })).resolves.toBe('http://a.test');
        expect(onUnreachable).toHaveBeenCalledWith(['a.test: no contestó (http ni https)', 'b.test: no contestó (http ni https)', 'c.test: no contestó (http ni https)']);
    });

    it('a hanging server counts as «no contestó» and after 20 s the rest go at the same time', async () => {
        jest.useFakeTimers();
        try {
            const check = jest.fn((server: string) =>
                server === 'http://c.test' ? Promise.resolve<PortalStatus>('active') : new Promise<PortalStatus>(() => undefined)
            );
            const picked = pickLineServer(['http://a.test', 'http://b.test', 'http://c.test', 'http://d.test'], check, { probeTimeoutMs: 6000, parallelAfterMs: 20000 });
            // a: http 6 s + https 6 s; b: http 6 s + https 6 s → 24 s, then c and d at once
            for (let i = 0; i < 4; i++) await jest.advanceTimersByTimeAsync(6000);
            await expect(picked).resolves.toBe('http://c.test');
            expect(check.mock.calls.map((c) => c[0])).toEqual(['http://a.test', 'https://a.test', 'http://b.test', 'https://b.test', 'http://c.test', 'http://d.test']);
        } finally {
            jest.useRealTimers();
        }
    });

    it('remembers the last good DNS per user', () => {
        rememberLineServer(' Ana ', 'http://b.test');
        expect(lastLineServer('ana')).toBe('http://b.test');
        expect(lastLineServer('otro')).toBe('');
    });
});
