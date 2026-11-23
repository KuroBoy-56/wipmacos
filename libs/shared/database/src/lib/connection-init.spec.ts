type PragmaHandler = (statement: string) => unknown;

interface FakeConnection {
    pragmas: string[];
    exec: jest.Mock;
    close: jest.Mock;
}

const connections: FakeConnection[] = [];
let pragmaHandler: PragmaHandler = () => undefined;
let execHandler: (sql: string) => void = () => undefined;

jest.mock('better-sqlite3', () =>
    jest.fn().mockImplementation(() => {
        const connection = {
            pragmas: [] as string[],
            pragma: jest.fn((statement: string) => {
                connection.pragmas.push(statement);
                return pragmaHandler(statement);
            }),
            exec: jest.fn((sql: string) => execHandler(sql)),
            prepare: jest.fn(() => ({
                all: jest.fn(() => []),
                get: jest.fn(),
                run: jest.fn(() => ({ changes: 0 })),
            })),
            transaction: jest.fn(
                (fn: (...args: unknown[]) => unknown) =>
                    (...args: unknown[]) =>
                        fn(...args)
            ),
            close: jest.fn(),
        };
        connections.push(connection);
        return connection;
    })
);
jest.mock('drizzle-orm/better-sqlite3', () => ({
    drizzle: jest.fn(() => ({ fake: 'drizzle' })),
}));
jest.mock('./path-utils', () => ({
    getIptvnatorDatabasePath: () => '/tmp/fake-iptvnator.db',
}));

import { closeDatabase, initDatabase } from './connection';

function busyError(): Error {
    return Object.assign(new Error('database is locked'), {
        code: 'SQLITE_BUSY',
    });
}

function createdPlaylists(connection: FakeConnection): boolean {
    return connection.exec.mock.calls.some(([sql]) =>
        /CREATE TABLE IF NOT EXISTS playlists/.test(String(sql))
    );
}

describe('initDatabase on a fresh install', () => {
    let warn: jest.SpyInstance;

    beforeEach(() => {
        connections.length = 0;
        pragmaHandler = () => undefined;
        execHandler = () => undefined;
        warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        closeDatabase();
        warn.mockRestore();
    });

    it('waits for the other connection and still creates the tables when switching to WAL says "database is locked"', async () => {
        let busy = 1;
        pragmaHandler = (statement) => {
            if (statement === 'journal_mode = WAL' && busy-- > 0) {
                throw busyError();
            }
            return statement === 'journal_mode' ? 'delete' : undefined;
        };

        await expect(initDatabase()).resolves.toEqual({ fake: 'drizzle' });

        const [connection] = connections;
        expect(connection.pragmas.indexOf('busy_timeout = 5000')).toBe(0);
        expect(
            connection.pragmas.filter((p) => p === 'journal_mode = WAL')
        ).toHaveLength(2);
        expect(createdPlaylists(connection)).toBe(true);
    });

    it('keeps the default journal and creates the tables when WAL cannot be set', async () => {
        pragmaHandler = (statement) => {
            if (statement === 'journal_mode = WAL') {
                throw new Error('disk I/O error');
            }
            return statement === 'journal_mode' ? 'delete' : undefined;
        };

        await expect(initDatabase()).resolves.toEqual({ fake: 'drizzle' });
        expect(createdPlaylists(connections[0])).toBe(true);
        expect(warn).toHaveBeenCalled();
    });

    it('does not switch the journal again when the file is already in WAL', async () => {
        pragmaHandler = (statement) =>
            statement === 'journal_mode' ? 'wal' : undefined;

        await initDatabase();

        expect(connections[0].pragmas).not.toContain('journal_mode = WAL');
    });

    it('tries again on the next call after a failed start instead of keeping the error', async () => {
        let fail = true;
        execHandler = () => {
            if (fail) {
                throw busyError();
            }
        };

        await expect(initDatabase()).rejects.toThrow('database is locked');
        expect(connections[0].close).toHaveBeenCalled();

        fail = false;
        await expect(initDatabase()).resolves.toEqual({ fake: 'drizzle' });
        expect(connections).toHaveLength(2);
        expect(createdPlaylists(connections[1])).toBe(true);
    });
});
