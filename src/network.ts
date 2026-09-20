import { platform } from 'node:os';
import { runCommand } from './command.js';

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

        if (match?.[1]) {
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
        const match = /^\S+\s+00000000\s+(\S{8})\s+0003/.exec(line.trim());

        if (match?.[1]) {
            return hexToIp(match[1]);
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

        if (match?.[1]) {
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
    const result = await runCommand('netstat', ['-nr']);

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr.trim() || 'Failed to determine the default gateway.',
        );
    }

    for (const line of result.stdout.split(/\r?\n/)) {
        const match = /^default\s+(\S+)/.exec(line.trim());

        if (match?.[1]) {
            return match[1];
        }
    }

    throw new Error('No default gateway found.');
}

async function getWindowsGateway(): Promise<string> {
    const result = await runCommand('ipconfig');

    if (result.exitCode !== 0) {
        throw new Error(
            result.stderr.trim() || 'Failed to determine the default gateway.',
        );
    }

    for (const line of result.stdout.split(/\r?\n/)) {
        const match = /Default Gateway[.\s]+:\s+(\S+)/i.exec(line.trim());

        if (match?.[1] && match[1] !== '') {
            return match[1];
        }
    }

    throw new Error('No default gateway found.');
}
