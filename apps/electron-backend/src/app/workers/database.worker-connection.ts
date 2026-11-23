import type BetterSqlite3 from 'better-sqlite3';
import * as schema from '@iptvnator/shared/database/schema';
import { getIptvnatorDatabasePath } from '@iptvnator/shared/database/path-utils';
import { workerData } from 'worker_threads';
import type { AppDatabase } from '../database/database.types';
import {
    getNativeModuleSearchPaths,
    getWorkerDataNativeModuleSearchPaths,
    loadNativeModuleFromSearchPaths,
    registerNativeModuleSearchPaths,
} from './worker-runtime-paths';
import {
    compactSqlForTrace,
    isSqlTraceEnabled,
    trace,
} from '../services/debug-trace';

let Database: typeof BetterSqlite3;
let drizzleFactory:
    | (typeof import('drizzle-orm/better-sqlite3'))['drizzle']
    | undefined;

const nativeModuleSearchPaths = [
    ...getWorkerDataNativeModuleSearchPaths(workerData),
    ...getNativeModuleSearchPaths({
        resourcesPath: (
            process as NodeJS.Process & { resourcesPath?: string }
        ).resourcesPath,
    }),
];

registerNativeModuleSearchPaths(nativeModuleSearchPaths);

function loadBetterSqlite3(): typeof BetterSqlite3 {
    return loadNativeModuleFromSearchPaths({
        moduleName: 'better-sqlite3',
        loggerLabel: '[DB Worker]',
        searchPaths: nativeModuleSearchPaths,
        fallbackRequire: () =>
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            require('better-sqlite3') as typeof BetterSqlite3,
    });
}

function getDrizzleFactory(): (typeof import('drizzle-orm/better-sqlite3'))['drizzle'] {
    if (drizzleFactory) {
        return drizzleFactory;
    }

    // Require drizzle only after native lookup paths have been registered.
    // Its better-sqlite3 driver resolves the native package at module load time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    drizzleFactory = require('drizzle-orm/better-sqlite3').drizzle as (
        typeof import('drizzle-orm/better-sqlite3')
    )['drizzle'];

    return drizzleFactory;
}

Database = loadBetterSqlite3();

let db: AppDatabase | null = null;
let sqlite: BetterSqlite3.Database | null = null;

export async function getWorkerDatabase(): Promise<AppDatabase> {
    if (db) {
        return db;
    }

    const filePath = getIptvnatorDatabasePath();
    sqlite = new Database(filePath, {
        verbose: isSqlTraceEnabled()
            ? (sql: string) => {
                  trace('sql-worker', 'query', {
                      sql: compactSqlForTrace(sql),
                  });
              }
            : undefined,
    });
    // busy_timeout first: the main process may be creating the tables right now. WAL is set by the main process and
    // stays in the file; switching to it here failed with "database is locked" when both opened a new install at once
    sqlite.pragma('busy_timeout = 5000');
    sqlite.pragma('foreign_keys = ON');
    try {
        if (
            String(
                sqlite.pragma('journal_mode', { simple: true })
            ).toLowerCase() !== 'wal'
        ) {
            sqlite.pragma('journal_mode = WAL');
        }
    } catch (error) {
        console.warn(
            '[DB Worker] journal_mode = WAL not set here (the main process sets it):',
            error
        );
    }
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('cache_size = -64000');
    sqlite.pragma('temp_store = MEMORY');
    sqlite.pragma('mmap_size = 268435456');

    if (isSqlTraceEnabled()) {
        trace('sql-worker', 'open', {
            filePath,
        });
    }

    db = getDrizzleFactory()(sqlite, { schema });
    return db;
}

export function closeWorkerDatabase(): void {
    if (!sqlite) {
        return;
    }

    try {
        sqlite.pragma('optimize');
    } catch {
        // Optimize is advisory; never block close on it.
    }

    sqlite.close();

    if (isSqlTraceEnabled()) {
        trace('sql-worker', 'close');
    }

    sqlite = null;
    db = null;
}
