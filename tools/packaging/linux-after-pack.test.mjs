import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const linuxAfterPack = require('./linux-after-pack.cjs');

function makeResources(files) {
    const root = mkdtempSync(join(tmpdir(), 'linux-after-pack-'));
    for (const file of files) {
        mkdirSync(join(root, file, '..'), { recursive: true });
        writeFileSync(join(root, file), '');
    }
    return root;
}

test('finds Windows players and DLLs that would end up in a Linux package', async () => {
    const root = makeResources([
        'bin/mpv/mpv.exe',
        'bin/vlc/libvlc.DLL',
        'bin/vlc/README.txt',
        'app.asar.unpacked/electron-backend/native/lib/mpv-2.dll',
        'app.asar.unpacked/electron-backend/native/embedded_mpv.node',
        'app.asar.unpacked/node_modules/some-dep/helper.exe',
    ]);
    try {
        const found = (await linuxAfterPack.findWindowsBinaries(root)).map((f) => f.slice(root.length + 1)).sort();
        assert.deepEqual(found, [
            'app.asar.unpacked/electron-backend/native/lib/mpv-2.dll',
            'bin/mpv/mpv.exe',
            'bin/vlc/libvlc.DLL',
        ]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('a clean Linux package (no bin/, Linux native output) passes', async () => {
    const root = makeResources(['app.asar.unpacked/electron-backend/native/embedded_mpv.node']);
    try {
        assert.deepEqual(await linuxAfterPack.findWindowsBinaries(root), []);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test('the hook refuses to pack Linux with Windows binaries and ignores other platforms', async () => {
    const appOutDir = makeResources(['resources/bin/mpv/mpv.exe']);
    try {
        await assert.rejects(
            linuxAfterPack({ electronPlatformName: 'linux', appOutDir, packager: { executableName: 'mpx-player', appInfo: { productName: 'MPX Player' } } }),
            /Windows binaries/
        );
        await linuxAfterPack({ electronPlatformName: 'win32', appOutDir });
    } finally {
        rmSync(appOutDir, { recursive: true, force: true });
    }
});
