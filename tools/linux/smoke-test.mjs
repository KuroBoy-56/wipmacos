#!/usr/bin/env node
/**
 * Linux smoke test of a real MPX Player build (linux-unpacked, installed Snap or installed
 * Flatpak). Starts the app with the Chrome DevTools Protocol open, then checks from inside
 * the window that the Electron bridge, the device id, SQLite and (optionally) embedded MPV
 * work in that package's sandbox. The panel is never contacted: host resolution is mapped
 * to nothing, so CI runs do not show up as devices on the operator panel.
 *
 *   node tools/linux/smoke-test.mjs [--expect-embedded-mpv] [--screenshot=out.png] -- <command...>
 *   e.g. -- dist/executables/linux-unpacked/mpx-player.bin --no-sandbox
 *        -- mpx-player                       (installed snap, /snap/bin on PATH)
 *        -- flatpak run com.latmpx.MPXPlayer
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = 9333;
const START_TIMEOUT_MS = 120_000;

const sep = process.argv.indexOf('--');
const flags = sep === -1 ? process.argv.slice(2) : process.argv.slice(2, sep);
const command = sep === -1 ? [] : process.argv.slice(sep + 1);
if (command.length === 0) {
    console.error('usage: smoke-test.mjs [--expect-embedded-mpv] [--screenshot=file.png] -- <command...>');
    process.exit(2);
}
const expectEmbeddedMpv = flags.includes('--expect-embedded-mpv');
const screenshotPath = flags.find((f) => f.startsWith('--screenshot='))?.split('=')[1];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Checks run inside the app window (renderer), through the real preload bridge. */
const PROBE = `(async () => {
    const e = window.electron;
    if (!e) return { bridge: false };
    const key = 'linux-smoke-test';
    const value = String(Date.now());
    await e.dbSetAppState(key, value);
    const mpv = e.prepareEmbeddedMpv ? await e.prepareEmbeddedMpv() : await e.getEmbeddedMpvSupport();
    return {
        bridge: true,
        title: document.title,
        platform: e.platform,
        appVersion: await e.getAppVersion(),
        deviceId: await e.panelGetDeviceId(),
        sqliteRoundTrip: (await e.dbGetAppState(key)) === value,
        embeddedMpv: { supported: mpv.supported, reason: mpv.reason ?? null },
        rendered: document.querySelector('app-root')?.childElementCount > 0,
    };
})()`;

/** Validates the probe result; returns the list of failures. */
export function checkProbe(result, { expectEmbeddedMpv: needMpv }) {
    const failures = [];
    if (!result?.bridge) return ['window.electron (preload bridge) is missing'];
    if (result.platform !== 'linux') failures.push(`platform is ${result.platform}, expected linux`);
    if (!/^([0-9A-F]{2}:){7}[0-9A-F]{2}$/.test(result.deviceId ?? '')) failures.push(`bad device id: ${result.deviceId}`);
    if (!result.sqliteRoundTrip) failures.push('SQLite write/read of app state failed (data folder not writable?)');
    if (!result.rendered) failures.push('the Angular app did not render');
    if (!/MPX/.test(result.title ?? '')) failures.push(`unexpected window title: ${result.title}`);
    if (needMpv && !result.embeddedMpv?.supported) failures.push(`embedded MPV unavailable: ${result.embeddedMpv?.reason}`);
    return failures;
}

async function findAppPage() {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            const page = targets.find((t) => t.type === 'page' && /index\.html|localhost/.test(t.url));
            if (page) return page;
        } catch {
            // DevTools endpoint not up yet
        }
        await sleep(1000);
    }
    throw new Error(`no app window on the DevTools port within ${START_TIMEOUT_MS / 1000}s`);
}

function cdp(wsUrl) {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        pending.get(msg.id)?.(msg);
        pending.delete(msg.id);
    };
    const opened = new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
    });
    const send = async (method, params = {}) => {
        await opened;
        return new Promise((resolve) => {
            pending.set(++id, resolve);
            ws.send(JSON.stringify({ id, method, params }));
        });
    };
    return { send, close: () => ws.close() };
}

async function main() {
    const args = [
        ...command.slice(1),
        `--remote-debugging-port=${PORT}`,
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    ];
    const app = spawn(command[0], args, { stdio: ['ignore', 'inherit', 'inherit'], detached: true });
    const exited = new Promise((resolve) => app.once('exit', (code) => resolve(code)));
    try {
        const page = await Promise.race([
            findAppPage(),
            exited.then((code) => Promise.reject(new Error(`app exited early with code ${code}`))),
        ]);
        // let Angular bootstrap and the DB worker start
        await sleep(8000);
        const session = cdp(page.webSocketDebuggerUrl);
        const evaluated = await session.send('Runtime.evaluate', { expression: PROBE, awaitPromise: true, returnByValue: true });
        if (screenshotPath) {
            const shot = await session.send('Page.captureScreenshot', { format: 'png' });
            if (shot.result?.data) writeFileSync(screenshotPath, Buffer.from(shot.result.data, 'base64'));
        }
        session.close();
        const result = evaluated.result?.result?.value;
        if (!result) throw new Error(`probe failed: ${JSON.stringify(evaluated.result?.exceptionDetails ?? evaluated)}`);
        console.log(JSON.stringify(result, null, 2));
        const failures = checkProbe(result, { expectEmbeddedMpv });
        if (failures.length > 0) {
            console.error(`SMOKE TEST FAILED:\n- ${failures.join('\n- ')}`);
            process.exitCode = 1;
        } else {
            console.log('SMOKE TEST PASSED');
        }
    } finally {
        try {
            process.kill(-app.pid, 'SIGTERM');
        } catch {
            // already gone
        }
    }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
    main().catch((error) => {
        console.error(`SMOKE TEST FAILED: ${error.message}`);
        process.exit(1);
    });
}
