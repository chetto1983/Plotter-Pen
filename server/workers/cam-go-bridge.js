/**
 * CAM Go Bridge
 * Spawns Go CAM engine as subprocess, communicates via JSON stdin/stdout
 */
import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';

// Detect platform and find binary
function getCamEngineInfo() {
    const platform = process.platform;
    const arch = process.arch;
    const archSuffix = (() => {
        switch (arch) {
            case 'arm64':
                return 'arm64';
            case 'arm':
                return 'arm';
            case 'x64':
            case 'amd64':
                return 'amd64';
            default:
                return arch;
        }
    })();

    // Binary names per platform + arch
    const binaries = {
        win32: 'cam-engine.exe',
        linux: `cam-engine-linux-${archSuffix}`,
        darwin: `cam-engine-darwin-${archSuffix}`
    };

    const binaryName = binaries[platform] || binaries.linux;
    const camEngineDir = path.join(process.cwd(), 'server', 'cam-engine');
    const distName = platform === 'win32'
        ? `cam-engine-windows-${archSuffix}.exe`
        : binaryName;

    // Check locations in order of preference
    const locations = platform === 'win32'
        ? [
            path.join(camEngineDir, binaryName),          // Windows default
            path.join(camEngineDir, distName),            // Cross-compiled (root)
            path.join(camEngineDir, 'dist', distName),    // Cross-compiled (dist)
        ]
        : [
            path.join(camEngineDir, binaryName),          // Platform-specific
            path.join(camEngineDir, 'cam-engine'),        // Docker/local build
            path.join(camEngineDir, 'dist', distName),    // Cross-compiled (dist)
        ];

    const found = locations.find((loc) => existsSync(loc)) ?? null;

    return {
        platform,
        arch,
        binaryName,
        path: found,
        tried: locations
    };
}

function findCamEngine() {
    const info = getCamEngineInfo();
    if (info.path) {
        return info.path;
    }
    throw new Error(`CAM engine binary not found. Tried: ${info.tried.join(', ')}`);
}

/**
 * Run CAM process via Go engine
 * @param {Object} params - { primitives, type, settings }
 * @param {number} timeout - Timeout in ms (default 60000)
 * @returns {Promise<Object>} - { status, gcode, stats }
 */
export async function runCamGo(params, timeout = 60000) {
    const binaryPath = findCamEngine();

    return new Promise((resolve, reject) => {
        const proc = spawn(binaryPath, [], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (!settled) {
                settled = true;
                proc.kill('SIGKILL');
                reject(new Error(`CAM engine timeout after ${timeout}ms`));
            }
        }, timeout);

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
            // Log stderr for debugging
            process.stderr.write(data);
        });

        proc.on('close', (code) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);

            if (code !== 0) {
                reject(new Error(`CAM engine exited with code ${code}: ${stderr}`));
                return;
            }

            try {
                const result = JSON.parse(stdout);
                if (result.status === 'error') {
                    reject(new Error(result.error || 'CAM engine error'));
                    return;
                }
                resolve(result);
            } catch (parseErr) {
                reject(new Error(`Failed to parse CAM output: ${parseErr.message}`));
            }
        });

        proc.on('error', (err) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(new Error(`Failed to spawn CAM engine: ${err.message}`));
        });

        // Send input JSON
        const input = JSON.stringify({
            primitives: params.primitives,
            type: params.type || 'profile',
            settings: params.settings || {}
        });

        proc.stdin.write(input);
        proc.stdin.end();
    });
}

/**
 * Check if Go CAM engine is available
 * @returns {boolean}
 */
export function isCamGoAvailable() {
    try {
        findCamEngine();
        return true;
    } catch {
        return false;
    }
}

export { getCamEngineInfo };
