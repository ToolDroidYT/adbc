import { runCommand } from './command.js';
import type { AdbDevice } from './types.js';

const ADB_UNAVAILABLE_MESSAGE =
    'ADB is unavailable. Install Android platform-tools (android-tools).';

export async function ensureAdb(): Promise<void> {
    let available = false;

    try {
        const result = await runCommand('adb', ['version']);
        available = result.exitCode === 0;
    } catch {
        // `spawn` rejects when adb is not in PATH.
        available = false;
    }

    if (!available) {
        throw new Error(ADB_UNAVAILABLE_MESSAGE);
    }
}

export async function getConnectedDevices(): Promise<AdbDevice[]> {
    const result = await runCommand('adb', ['devices', '-l']);

    if (result.exitCode !== 0) {
        throw new Error(result.stderr.trim() || 'Failed to query ADB devices.');
    }

    return result.stdout
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.startsWith('*'))
        .map(parseDevice)
        .filter((device): device is AdbDevice => device !== null)
        .filter((device) => device.state === 'device');
}

export function parseDevice(line: string): AdbDevice | null {
    const parts = line.split(/\s+/);

    if (parts.length < 2) return null;

    const [serial, state, ...attributes] = parts;
    if (!serial || !state) return null;

    const device: AdbDevice = { serial, state };

    for (const attribute of attributes) {
        const separator = attribute.indexOf(':');
        if (separator === -1) continue;

        const key = attribute.slice(0, separator);
        const value = attribute.slice(separator + 1);

        if (key === 'product') device.product = value;
        if (key === 'model') device.model = value.replaceAll('_', ' ');
        if (key === 'transport_id') device.transportId = value;
    }

    return device;
}

export async function switchToTcpIp(
    device: AdbDevice,
    port: number,
): Promise<void> {
    const result = await runCommand('adb', [
        '-s',
        device.serial,
        'tcpip',
        String(port),
    ]);

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr.trim() ||
                result.stdout.trim() ||
                `Failed to switch ${device.serial} to TCP/IP.`,
        );
    }
}

const CONNECT_FAILURE_PATTERNS: readonly RegExp[] = [
    /(?:cannot|can't|failed to|unable to) (?:connect|authenticate)/i,
    /connection refused/i,
    /no route to host/i,
    /network is unreachable/i,
    /(?:connection|operation) timed out/i,
];

export function isConnectionFailure(output: string): boolean {
    return CONNECT_FAILURE_PATTERNS.some((pattern) => pattern.test(output));
}

export async function connectTcpIp(
    host: string,
    port: number,
): Promise<string> {
    const target = `${host}:${port}`;
    const result = await runCommand('adb', ['connect', target]);

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr.trim() ||
                result.stdout.trim() ||
                `Failed to connect to ${target}.`,
        );
    }

    const output = result.stdout.trim() || result.stderr.trim();

    // `adb connect` exits with status 0 even when the connection failed,
    // reporting the error on stdout instead.
    if (isConnectionFailure(output)) {
        throw new Error(output || `Failed to connect to ${target}.`);
    }

    return output;
}
