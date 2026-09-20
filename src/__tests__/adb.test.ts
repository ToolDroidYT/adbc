import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../command.js', () => ({
    runCommand: vi.fn(),
}));

import { runCommand } from '../command.js';
import {
    ensureAdb,
    getConnectedDevices,
    parseDevice,
    switchToTcpIp,
    connectTcpIp,
} from '../adb.js';
import type { AdbDevice } from '../types.js';

const mockRunCommand = vi.mocked(runCommand);

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ensureAdb', () => {
    it('succeeds when adb version returns 0', async () => {
        mockRunCommand.mockResolvedValue({
            stdout: 'Android Debug Bridge version 1.0.41',
            stderr: '',
            exitCode: 0,
        });

        await expect(ensureAdb()).resolves.toBeUndefined();
        expect(mockRunCommand).toHaveBeenCalledWith('adb', ['version']);
    });

    it('throws when adb is not found', async () => {
        mockRunCommand.mockResolvedValue({
            stdout: '',
            stderr: 'adb: command not found',
            exitCode: 1,
        });

        await expect(ensureAdb()).rejects.toThrow('ADB is unavailable');
    });
});

describe('getConnectedDevices', () => {
    it('returns empty array when no devices', async () => {
        mockRunCommand.mockResolvedValue({
            stdout: 'List of devices attached\n\n',
            stderr: '',
            exitCode: 0,
        });

        const devices = await getConnectedDevices();
        expect(devices).toEqual([]);
    });

    it('parses a single device', async () => {
        mockRunCommand.mockResolvedValue({
            stdout:
                'List of devices attached\n' +
                'SERIAL123     device usb:1-1 product:redfin model:Pixel_5 transport_id:1\n',
            stderr: '',
            exitCode: 0,
        });

        const devices = await getConnectedDevices();
        expect(devices).toHaveLength(1);
        expect(devices[0]).toEqual({
            serial: 'SERIAL123',
            state: 'device',
            product: 'redfin',
            model: 'Pixel 5',
            transportId: '1',
        });
    });

    it('filters offline devices', async () => {
        mockRunCommand.mockResolvedValue({
            stdout:
                'List of devices attached\n' +
                'SERIAL123     device usb:1-1\n' +
                'SERIAL456     offline\n',
            stderr: '',
            exitCode: 0,
        });

        const devices = await getConnectedDevices();
        expect(devices).toHaveLength(1);
        expect(devices[0]?.serial).toBe('SERIAL123');
    });

    it('filters adb server status lines', async () => {
        mockRunCommand.mockResolvedValue({
            stdout:
                'List of devices attached\n' +
                '* daemon not running; starting now at tcp:5037\n' +
                '* daemon started successfully\n' +
                'SERIAL123     device\n',
            stderr: '',
            exitCode: 0,
        });

        const devices = await getConnectedDevices();
        expect(devices).toHaveLength(1);
    });
});

describe('parseDevice', () => {
    it('parses a minimal device line', () => {
        const device = parseDevice('SERIAL123     device');
        expect(device).toEqual({ serial: 'SERIAL123', state: 'device' });
    });

    it('parses a full device line with attributes', () => {
        const device = parseDevice(
            'SERIAL123     device product:redfin model:Pixel_5 transport_id:1',
        );
        expect(device).toEqual({
            serial: 'SERIAL123',
            state: 'device',
            product: 'redfin',
            model: 'Pixel 5',
            transportId: '1',
        });
    });

    it('replaces underscores in model name', () => {
        const device = parseDevice('SERIAL1 device model:Pixel_5_Pro');
        expect(device?.model).toBe('Pixel 5 Pro');
    });

    it('returns null for too-short lines', () => {
        expect(parseDevice('')).toBeNull();
        expect(parseDevice('SERIAL')).toBeNull();
    });

    it('skips attributes without colon separator', () => {
        const device = parseDevice('SERIAL1 device noColon');
        expect(device).toEqual({ serial: 'SERIAL1', state: 'device' });
    });
});

describe('switchToTcpIp', () => {
    it('calls adb -s <serial> tcpip <port>', async () => {
        mockRunCommand.mockResolvedValue({
            stdout: 'restarting in TCP mode port: 5555',
            stderr: '',
            exitCode: 0,
        });

        const device: AdbDevice = { serial: 'SERIAL123', state: 'device' };
        await switchToTcpIp(device, 5555);

        expect(mockRunCommand).toHaveBeenCalledWith('adb', [
            '-s',
            'SERIAL123',
            'tcpip',
            '5555',
        ]);
    });

    it('throws on failure', async () => {
        mockRunCommand.mockResolvedValue({
            stdout: '',
            stderr: 'error: device not found',
            exitCode: 1,
        });

        const device: AdbDevice = { serial: 'SERIAL123', state: 'device' };
        await expect(switchToTcpIp(device, 5555)).rejects.toThrow(
            'device not found',
        );
    });
});

describe('connectTcpIp', () => {
    it('calls adb connect <host>:<port>', async () => {
        mockRunCommand.mockResolvedValue({
            stdout: 'connected to 192.168.1.1:5555',
            stderr: '',
            exitCode: 0,
        });

        const result = await connectTcpIp('192.168.1.1', 5555);

        expect(mockRunCommand).toHaveBeenCalledWith('adb', [
            'connect',
            '192.168.1.1:5555',
        ]);
        expect(result).toBe('connected to 192.168.1.1:5555');
    });

    it('detects already connected', async () => {
        mockRunCommand.mockResolvedValue({
            stdout: 'already connected to 192.168.1.1:5555',
            stderr: '',
            exitCode: 0,
        });

        const result = await connectTcpIp('192.168.1.1', 5555);
        expect(result).toBe('already connected to 192.168.1.1:5555');
    });

    it('throws on connection failure', async () => {
        mockRunCommand.mockResolvedValue({
            stdout: '',
            stderr: 'cannot connect to 192.168.1.1:5555',
            exitCode: 1,
        });

        await expect(connectTcpIp('192.168.1.1', 5555)).rejects.toThrow(
            'cannot connect',
        );
    });
});
