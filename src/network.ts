import { platform } from 'node:os';
import { runCommand } from './command.js';

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * Matches `ipconfig` label lines such as
 * `   Default Gateway . . . . . . . . . : 192.168.1.1`.
 * The dot leaders are required so that continuation lines (which may be IPv6
 * addresses containing colons, e.g. `fe80::1%5`) are not mistaken for labels.
 */
const WINDOWS_LABEL_PATTERN =
    /^\s*([A-Za-z][A-Za-z0-9 ()_-]*?)(?:\.\s*)+:\s*(.*)$/;

export async function getDefaultGateway(): Promise<string> {
    const os = platform();

    switch (os) {
        case 'linux':
        case 'android':
            return getLinuxGateway();
        case 'darwin':
            return getMacOsGateway();
        case 'win32':
            return getWindowsGateway();
        default:
            throw new Error(`Unsupported platform: ${os}`);
    }
}

export function isIpv4(value: string): boolean {
    const match = IPV4_PATTERN.exec(value);

    if (!match) return false;

    for (const octet of match.slice(1)) {
        if (Number(octet) > 255) return false;
    }

    return true;
}

function isUsableGateway(value: string): boolean {
    // `adb connect` needs an IPv4 host, so IPv6 routes and on-link candidates
    // are skipped. Unspecified and link-local (APIPA) addresses are not
    // reachable gateways either.
    if (!isIpv4(value)) return false;
    if (value === '0.0.0.0') return false;
    if (value.startsWith('169.254.')) return false;

    return true;
}

async function getLinuxGateway(): Promise<string> {
    try {
        return await getGatewayFromIpRoute();
    } catch {
        // ip route failed or returned empty, try fallbacks
    }

    try {
        return await getGatewayFromProcRoute();
    } catch {
        // /proc/net/route failed, try next fallback
    }

    return getGatewayFromNetstat();
}

async function getGatewayFromIpRoute(): Promise<string> {
    const result = await runCommand('ip', ['route', 'show', 'default']);

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr.trim() || 'Failed to determine the default gateway.',
        );
    }

    for (const line of result.stdout.split(/\r?\n/)) {
        const match = /^default\s+via\s+(\S+)/.exec(line.trim());

        if (match?.[1] && isUsableGateway(match[1])) {
            return match[1];
        }
    }

    throw new Error('No default gateway found.');
}

async function getGatewayFromProcRoute(): Promise<string> {
    const result = await runCommand('cat', ['/proc/net/route']);

    if (result.exitCode !== 0) {
        throw new Error('Failed to read /proc/net/route.');
    }

    for (const line of result.stdout.split(/\r?\n/)) {
        // Iface Destination Gateway Flags RefCnt Use Metric Mask ...
        const fields = line.trim().split(/\s+/);
        const destination = fields[1];
        const gateway = fields[2];
        const flags = fields[3];

        if (destination !== '00000000' || !gateway || !flags) continue;
        if (gateway === '00000000') continue;

        // The G flag marks the route as using a gateway.
        if ((Number.parseInt(flags, 16) & 0x2) === 0) continue;

        const ip = hexToIp(gateway);

        if (isUsableGateway(ip)) {
            return ip;
        }
    }

    throw new Error('No default gateway found in /proc/net/route.');
}

async function getGatewayFromNetstat(): Promise<string> {
    const result = await runCommand('netstat', ['-rn']);

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr.trim() || 'Failed to determine the default gateway.',
        );
    }

    for (const line of result.stdout.split(/\r?\n/)) {
        const match = /^(?:default|0\.0\.0\.0)\s+(\S+)/.exec(line.trim());

        if (match?.[1] && isUsableGateway(match[1])) {
            return match[1];
        }
    }

    throw new Error('No default gateway found.');
}

function hexToIp(hex: string): string {
    const parts: string[] = [];

    for (let i = 6; i >= 0; i -= 2) {
        parts.push(String(parseInt(hex.slice(i, i + 2), 16)));
    }

    return parts.join('.');
}

async function getMacOsGateway(): Promise<string> {
    // `-f inet` restricts the output to IPv4 routes.
    const result = await runCommand('netstat', ['-nr', '-f', 'inet']);

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr.trim() || 'Failed to determine the default gateway.',
        );
    }

    for (const line of result.stdout.split(/\r?\n/)) {
        const match = /^default\s+(\S+)/.exec(line.trim());

        if (match?.[1] && isUsableGateway(match[1])) {
            return match[1];
        }
    }

    throw new Error('No default gateway found.');
}

async function getWindowsGateway(): Promise<string> {
    let ipconfigError = new Error('No default gateway found.');

    try {
        const result = await runCommand('ipconfig');

        if (result.exitCode !== 0) {
            throw new Error(
                result.stderr.trim() ||
                    'Failed to determine the default gateway.',
            );
        }

        const gateway = getGatewayFromIpconfig(result.stdout);

        if (gateway) return gateway;

        ipconfigError = new Error('No default gateway found.');
    } catch (cause) {
        ipconfigError =
            cause instanceof Error ? cause : new Error(String(cause));
    }

    try {
        // `ipconfig` can report IPv6-only gateways (or fail entirely); the
        // IPv4 route table always lists the gateway actually in use.
        return await getGatewayFromWindowsRouteTable();
    } catch {
        throw ipconfigError;
    }
}

function getGatewayFromIpconfig(output: string): string | null {
    const candidates: string[] = [];
    let collecting = false;

    for (const rawLine of output.split(/\r?\n/)) {
        const line = rawLine.trim();

        if (line === '') {
            collecting = false;
            continue;
        }

        const labelMatch = WINDOWS_LABEL_PATTERN.exec(rawLine);

        if (labelMatch) {
            const label = (labelMatch[1] ?? '').toLowerCase();
            collecting = label.includes('default gateway');

            if (collecting) {
                candidates.push(
                    ...(labelMatch[2] ?? '').split(/\s+/).filter(Boolean),
                );
            }

            continue;
        }

        // Continuation lines of a multi-address entry (for example an IPv6
        // and an IPv4 default gateway) have no label of their own.
        if (collecting) {
            candidates.push(...line.split(/\s+/));
        }
    }

    for (const candidate of candidates) {
        if (isUsableGateway(candidate)) {
            return candidate;
        }
    }

    return null;
}

async function getGatewayFromWindowsRouteTable(): Promise<string> {
    const result = await runCommand('netstat', ['-rn']);

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr.trim() || 'Failed to determine the default gateway.',
        );
    }

    for (const line of result.stdout.split(/\r?\n/)) {
        // Network Destination  Netmask  Gateway  Interface  Metric
        const match = /^0\.0\.0\.0\s+0\.0\.0\.0\s+(\S+)/.exec(line.trim());

        if (match?.[1] && isUsableGateway(match[1])) {
            return match[1];
        }
    }

    throw new Error('No default gateway found.');
}
