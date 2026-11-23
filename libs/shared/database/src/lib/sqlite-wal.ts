import type Database from 'better-sqlite3';

/** SQLITE_BUSY / SQLITE_LOCKED: another connection has the file (a worker, or the previous instance after a restart). */
export function isSqliteBusy(error: unknown): boolean {
    const code = String((error as { code?: unknown })?.code ?? '');
    return (
        code.startsWith('SQLITE_BUSY') ||
        code.startsWith('SQLITE_LOCKED') ||
        /database is locked/i.test(String(error))
    );
}

/**
 * WAL is stored in the file once set, so it only has to succeed once. Switching to it fails with "database is locked"
 * (without waiting for busy_timeout) while another connection has the file open: on a fresh install the DB worker
 * could open the brand-new file at the same moment. Retry for a few seconds and, if it still cannot, keep the
 * default journal: the app works the same, and the tables must be created anyway.
 */
export async function enableWal(connection: Database.Database): Promise<void> {
    for (let attempt = 0; ; attempt++) {
        try {
            if (
                String(
                    connection.pragma('journal_mode', { simple: true })
                ).toLowerCase() !== 'wal'
            ) {
                connection.pragma('journal_mode = WAL');
            }
            return;
        } catch (error) {
            if (!isSqliteBusy(error) || attempt >= 20) {
                console.warn(
                    '[db] journal_mode = WAL not set, keeping the default journal:',
                    error
                );
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
}
