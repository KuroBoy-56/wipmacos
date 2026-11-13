import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';

import { buildElectronBuilderMetadata } from './generate-electron-builder-metadata.mjs';
import { inspectPackagedDependencyClosure } from './asar-dependency-closure.mjs';

const require = createRequire(import.meta.url);
const { extractFile, listPackage } = require('@electron/asar');
const {
    getEmbeddedMpvAddonArch,
    linuxUnpackedDirArch,
    validatePackagedEmbeddedMpv,
} = require('./embedded-mpv-packaging.cjs');
const args = process.argv.slice(2);
const normalizedArgs = args[0] === '--' ? args.slice(1) : args;
const [platform, arch = ''] = normalizedArgs;

if (!platform) {
    console.error(
        'Usage: node tools/packaging/verify-electron-package-layout.mjs <macos|linux|windows> [arch]'
    );
    process.exit(1);
}

const workspaceRoot = process.cwd();
const packageOutputRoots = [
    path.join(workspaceRoot, 'dist', 'executables'),
    path.join(workspaceRoot, 'dist', 'packages'),
];
const packageJsonPath = path.join(workspaceRoot, 'package.json');
const electronBuilderConfigPath = path.join(
    workspaceRoot,
    'electron-builder.json'
);
const LINUX_APP_ID = 'com.latmpx.MPXPlayer';
const flatpakMetainfoPath = path.join(
    workspaceRoot,
    'apps',
    'electron-backend',
    'linux',
    `${LINUX_APP_ID}.metainfo.xml`
);
const flatpakManifestPath = path.join(workspaceRoot, 'flatpak', `${LINUX_APP_ID}.yml`);
const snapcraftPath = path.join(workspaceRoot, 'snap', 'snapcraft.yaml');
const snapLauncherPath = path.join(workspaceRoot, 'snap', 'local', 'mpx-player');
const packageMetadata = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const electronBuilderConfig = JSON.parse(
    fs.readFileSync(electronBuilderConfigPath, 'utf8')
);
const linuxExecutableArgs = electronBuilderConfig.linux?.executableArgs ?? [];
const embeddedMpvRequired = isTruthy(
    process.env.IPTVNATOR_REQUIRE_EMBEDDED_MPV
);
const workerRelativeDir = path.join(
    'dist',
    'apps',
    'electron-backend',
    'workers'
);
const workerFiles = ['epg-parser.worker.js', 'database.worker.js'];
const packagedPackageMetadata = buildElectronBuilderMetadata(
    packageMetadata,
    electronBuilderConfig
).extraMetadata;
const nativeModuleRelativeDirs = [
    path.join('app.asar.unpacked', 'node_modules'),
    path.join('app.asar.unpacked', 'electron-backend', 'node_modules'),
    path.join(
        'app.asar.unpacked',
        'dist',
        'apps',
        'electron-backend',
        'node_modules'
    ),
];
const linuxExecutableName = getLinuxExecutableName();

function directoryExists(directoryPath) {
    return (
        fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory()
    );
}

function fileExists(filePath) {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function isTruthy(value) {
    return ['1', 'true', 'yes', 'on'].includes(
        String(value ?? '')
            .trim()
            .toLowerCase()
    );
}

function getMacResourceDirs() {
    const candidates = packageOutputRoots.flatMap((outputRoot) => [
        {
            arch: 'x64',
            directory: path.join(
                outputRoot,
                'mac',
                'IPTVnator.app',
                'Contents',
                'Resources'
            ),
        },
        {
            arch: 'arm64',
            directory: path.join(
                outputRoot,
                'mac-arm64',
                'IPTVnator.app',
                'Contents',
                'Resources'
            ),
        },
    ]);

    return candidates
        .filter((candidate) => !arch || candidate.arch === arch)
        .map((candidate) => candidate.directory)
        .filter(directoryExists);
}

function getUnpackedResourceDirs(prefix) {
    return packageOutputRoots.filter(directoryExists).flatMap((outputRoot) =>
        fs
            .readdirSync(outputRoot, { withFileTypes: true })
            .filter(
                (entry) =>
                    entry.isDirectory() &&
                    entry.name.startsWith(prefix) &&
                    entry.name.endsWith('-unpacked')
            )
            .map((entry) => path.join(outputRoot, entry.name, 'resources'))
            .filter(directoryExists)
    );
}

function getResourceDirs() {
    switch (platform) {
        case 'macos':
            return getMacResourceDirs();
        case 'linux':
            return getUnpackedResourceDirs('linux');
        case 'windows':
            return getUnpackedResourceDirs('win');
        default:
            console.error(`Unsupported platform "${platform}"`);
            process.exit(1);
    }
}

function sanitizeExecutableName(value) {
    const invalidCharacters = new Set([
        '<',
        '>',
        ':',
        '"',
        '/',
        '\\',
        '|',
        '?',
        '*',
    ]);

    return [...value]
        .filter(
            (character) =>
                character.charCodeAt(0) >= 32 &&
                !invalidCharacters.has(character)
        )
        .join('');
}

function getLinuxExecutableName() {
    const configuredExecutableName =
        electronBuilderConfig.linux?.executableName ??
        electronBuilderConfig.executableName;

    if (configuredExecutableName) {
        return sanitizeExecutableName(configuredExecutableName);
    }

    return packageMetadata.name.toLowerCase();
}

function formatJsonValue(value) {
    return JSON.stringify(value);
}

function packageMetadataMatches(actualValue, expectedValue) {
    return formatJsonValue(actualValue) === formatJsonValue(expectedValue);
}

function readAsarPackageMetadata(asarPath) {
    return JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
}

function verifyPackagedPackageMetadata(resourceDir, errors) {
    const asarPath = path.join(resourceDir, 'app.asar');

    if (!fileExists(asarPath)) {
        errors.push(`Missing packaged app archive: ${asarPath}`);
        return;
    }

    let appPackageMetadata;

    try {
        appPackageMetadata = readAsarPackageMetadata(asarPath);
    } catch (error) {
        errors.push(
            `Unable to read package.json from ${asarPath}: ${error.message}`
        );
        return;
    }

    const mismatches = Object.entries(packagedPackageMetadata)
        .filter(([, expectedValue]) => expectedValue !== undefined)
        .filter(
            ([fieldName, expectedValue]) =>
                !packageMetadataMatches(
                    appPackageMetadata[fieldName],
                    expectedValue
                )
        )
        .map(([fieldName, expectedValue]) => {
            const actualValue = appPackageMetadata[fieldName];

            return `- ${fieldName}: expected ${formatJsonValue(expectedValue)}, received ${formatJsonValue(actualValue)}`;
        });

    if (mismatches.length > 0) {
        errors.push(
            [
                `Packaged app package.json metadata does not match root package identity in ${asarPath}.`,
                ...mismatches,
            ].join('\n')
        );
    }
}

function verifyLinuxLauncher(resourceDir, errors) {
    const appDir = path.dirname(resourceDir);
    const launcherPath = path.join(appDir, linuxExecutableName);
    const launcherBinaryPath = `${launcherPath}.bin`;

    if (!fileExists(launcherBinaryPath)) {
        errors.push(
            `Missing Linux launcher binary in ${appDir}: ${path.basename(launcherBinaryPath)}`
        );
        return;
    }

    if (!fileExists(launcherPath)) {
        errors.push(
            `Missing Linux launcher wrapper in ${appDir}: ${path.basename(launcherPath)}`
        );
        return;
    }

    const launcherScript = fs.readFileSync(launcherPath, 'utf8');
    const requiredMarkers = [
        'SCRIPT_PATH="${BASH_SOURCE[0]}"',
        'readlink -f "$SCRIPT_PATH"',
        `exec "$SCRIPT_DIR/${linuxExecutableName}.bin"`,
    ];
    const missingMarkers = requiredMarkers.filter(
        (marker) => !launcherScript.includes(marker)
    );

    if (missingMarkers.length > 0) {
        errors.push(
            [
                `Linux launcher wrapper is missing symlink-safe logic in ${launcherPath}.`,
                'Missing markers:',
                ...missingMarkers.map((marker) => `- ${marker}`),
            ].join('\n')
        );
    }
}

function readTextOrReport(filePath, errors) {
    if (!fileExists(filePath)) {
        errors.push(`Missing Linux packaging file: ${filePath}`);
        return null;
    }
    return fs.readFileSync(filePath, 'utf8');
}

/** Flathub manifest: X11 (embedded MPV needs it) and no sandbox holes the app does not need. */
function verifyFlatpakPermissions(errors) {
    const manifest = readTextOrReport(flatpakManifestPath, errors);
    if (manifest === null) return;

    if (!manifest.includes('- --socket=x11')) {
        errors.push(`${flatpakManifestPath} must keep --socket=x11 (Electron runs with --ozone-platform=x11).`);
    }
    for (const forbidden of [
        '--talk-name=org.freedesktop.Flatpak',
        '--filesystem=home',
        '--filesystem=host',
    ]) {
        if (manifest.includes(forbidden)) {
            errors.push(
                `${flatpakManifestPath} must not use ${forbidden}: mpv is bundled and downloads only need xdg-download.`
            );
        }
    }
}

function verifyLinuxExecutableArgs(errors) {
    if (!Array.isArray(linuxExecutableArgs)) {
        errors.push('linux.executableArgs must be configured as an array.');
        return;
    }

    if (!linuxExecutableArgs.includes('--ozone-platform=x11')) {
        errors.push(
            'linux.executableArgs must include --ozone-platform=x11 while embedded MPV requires X11/Xwayland on Linux.'
        );
    }
}

/** Snap: core24 (same glibc family as the build), strict confinement, X11 launcher. */
function verifySnapPackagingConfig(errors) {
    const snapcraft = readTextOrReport(snapcraftPath, errors);
    const launcher = readTextOrReport(snapLauncherPath, errors);
    if (snapcraft !== null) {
        if (!/^base: core24$/m.test(snapcraft)) errors.push(`${snapcraftPath} must use base: core24.`);
        if (!/^confinement: strict$/m.test(snapcraft)) errors.push(`${snapcraftPath} must use confinement: strict.`);
    }
    if (launcher !== null && !launcher.includes('--ozone-platform=x11')) {
        errors.push(`${snapLauncherPath} must start Electron with --ozone-platform=x11.`);
    }
}

function verifyPackagedDependencyClosure(resourceDir, errors) {
    const asarPath = path.join(resourceDir, 'app.asar');

    if (!fileExists(asarPath)) {
        // Missing archive is already reported by verifyPackagedPackageMetadata.
        return;
    }

    let inspection;

    try {
        inspection = inspectPackagedDependencyClosure(asarPath, {
            listPackage,
            extractFile,
        });
    } catch (error) {
        errors.push(
            `Unable to inspect packaged app archive ${asarPath}: ${error.message}`
        );
        return;
    }

    const { missing, packageCount, manifestReadFailures } = inspection;

    // A packaged app always ships node_modules, so an empty audit means the
    // guard itself failed (e.g. path-separator handling), not a healthy asar.
    if (packageCount === 0) {
        errors.push(
            `Dependency-closure guard found no node_modules packages in ${asarPath}; the audit cannot have run against the real archive contents.`
        );
        return;
    }

    if (manifestReadFailures.length > 0) {
        errors.push(
            [
                `Dependency-closure guard could not read ${manifestReadFailures.length} package manifest(s) in ${asarPath}:`,
                ...manifestReadFailures.map(
                    (failure) => `- ${failure.packageDir}: ${failure.message}`
                ),
            ].join('\n')
        );
    }

    if (missing.length === 0) {
        return;
    }

    const details = missing
        .map((entry) => `- ${entry.dependency} (required by ${entry.requiredBy})`)
        .join('\n');

    errors.push(
        [
            `Packaged app.asar is missing runtime node_modules in ${asarPath}.`,
            "electron-builder's pnpm collector likely dropped a deduplicated transitive dependency.",
            'Fix it by declaring the missing package as a direct dependency in package.json (see issue #1103).',
            details,
        ].join('\n')
    );
}

// The embedded MPV addon is built once per CI host (x64), but electron-builder
// emits arm64/armv7l Linux output directories from the same dist tree. Those
// must carry the unavailable marker instead of a foreign-architecture addon.
function isForeignArchLinuxResourceDir(resourceDir) {
    if (platform !== 'linux') {
        return false;
    }

    const dirArch = linuxUnpackedDirArch(
        path.basename(path.dirname(resourceDir))
    );
    return Boolean(dirArch) && dirArch !== getEmbeddedMpvAddonArch();
}

function verifyResourceDir(resourceDir) {
    const missingWorkers = workerFiles.filter(
        (workerFile) =>
            !fileExists(path.join(resourceDir, workerRelativeDir, workerFile))
    );

    const nativeModuleDirs = nativeModuleRelativeDirs.map((relativeDir) =>
        path.join(resourceDir, relativeDir)
    );
    const matchingNativeModuleDir = nativeModuleDirs.find((nativeDir) =>
        fileExists(path.join(nativeDir, 'better-sqlite3', 'package.json'))
    );

    const errors = [];

    verifyPackagedPackageMetadata(resourceDir, errors);
    verifyPackagedDependencyClosure(resourceDir, errors);

    if (missingWorkers.length > 0) {
        errors.push(
            `Missing worker artifacts in ${resourceDir}: ${missingWorkers.join(', ')}`
        );
    }

    if (!matchingNativeModuleDir) {
        errors.push(
            [
                `Unable to find unpacked better-sqlite3 in ${resourceDir}.`,
                'Checked:',
                ...nativeModuleDirs.map((nativeDir) => `- ${nativeDir}`),
            ].join('\n')
        );
    }

    if (platform === 'linux') {
        if (!fileExists(flatpakMetainfoPath)) {
            errors.push(
                `Missing Flatpak metainfo file: ${flatpakMetainfoPath}`
            );
        }
        verifyLinuxExecutableArgs(errors);
        verifyFlatpakPermissions(errors);
        verifySnapPackagingConfig(errors);
        verifyLinuxLauncher(resourceDir, errors);
    }

    errors.push(
        ...validatePackagedEmbeddedMpv(resourceDir, {
            platform,
            required: embeddedMpvRequired,
            foreignArch: isForeignArchLinuxResourceDir(resourceDir),
        })
    );

    return {
        resourceDir,
        errors,
        matchingNativeModuleDir,
    };
}

const resourceDirs = getResourceDirs();

if (resourceDirs.length === 0) {
    console.error(
        `No packaged resource directories found for ${platform}${arch ? ` (${arch})` : ''}.`
    );
    process.exit(1);
}

const results = resourceDirs.map(verifyResourceDir);
const failures = results.filter((result) => result.errors.length > 0);

for (const result of results) {
    console.log(`Verified packaged resources: ${result.resourceDir}`);
    if (result.matchingNativeModuleDir) {
        console.log(
            `Resolved unpacked better-sqlite3 at: ${result.matchingNativeModuleDir}`
        );
    }
}

if (failures.length > 0) {
    for (const failure of failures) {
        console.error(failure.errors.join('\n'));
    }
    process.exit(1);
}
