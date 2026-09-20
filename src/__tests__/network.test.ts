import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:os', () => ({
    platform: vi.fn(),
}));

vi.mock('../command.js', () => ({
    runCommand: vi.fn(),
}));

import { platform } from 'node:os';
import { runCommand } from '../command.js';
import { getDefaultGateway } from '../network.js';

const mockPlatform = vi.mocked(platform);
const mockRunCommand = vi.mocked(runCommand);

beforeEach(() => {
    vi.clearAllMocks();
    mockPlatform.mockReturnValue('linux');
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('getDefaultGateway', () => {
    describe('linux', () => {
        beforeEach(() => {
            mockPlatform.mockReturnValue('linux');
        });

        it('parses gateway from ip route output', async () => {
            mockRunCommand.mockResolvedValue({
                stdout: 'default via 192.168.1.1 dev eth0 proto dhcp src 192.168.1.100 metric 100\n',
                stderr: '',
                exitCode: 0,
            });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('handles multi-line output', async () => {
            mockRunCommand.mockResolvedValue({
                stdout:
                    '192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.100\n' +
                    'default via 192.168.1.1 dev eth0 proto dhcp\n',
                stderr: '',
                exitCode: 0,
            });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('falls back to /proc/net/route when ip route has no default', async () => {
            mockRunCommand
                .mockResolvedValueOnce({
                    stdout: '192.168.1.0/24 dev eth0 proto kernel scope link\n',
                    stderr: '',
                    exitCode: 0,
                })
                .mockResolvedValueOnce({
                    stdout:
                        'Iface\tDestination\tGateway\t\tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT\n' +
                        'eth0\t00000000\t0101A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0\n',
                    stderr: '',
                    exitCode: 0,
                });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('falls back to netstat when ip route and /proc/net/route fail', async () => {
            mockRunCommand
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: 'RTNETLINK answers: No such process',
                    exitCode: 2,
                })
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: '',
                    exitCode: 1,
                })
                .mockResolvedValueOnce({
                    stdout:
                        'Kernel IP routing table\n' +
                        'Destination\tGateway\t\tGenmask\t\tFlags\tMSS\tWindow\tirtt\tIface\n' +
                        '0.0.0.0\t\t192.168.1.1\t0.0.0.0\t\tUG\t0\t0\t0\teth0\n',
                    stderr: '',
                    exitCode: 0,
                });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('throws when all methods fail', async () => {
            mockRunCommand.mockResolvedValue({
                stdout: '',
                stderr: 'Failed to determine the default gateway.',
                exitCode: 1,
            });

            await expect(getDefaultGateway()).rejects.toThrow(
                'Failed to determine the default gateway.',
            );
        });
    });

    describe('android (Termux)', () => {
        beforeEach(() => {
            mockPlatform.mockReturnValue('android');
        });

        it('parses gateway from ip route output', async () => {
            mockRunCommand.mockResolvedValue({
                stdout: 'default via 192.168.1.1 dev wlan0 proto dhcp\n',
                stderr: '',
                exitCode: 0,
            });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('falls back to /proc/net/route when ip route is empty', async () => {
            mockRunCommand
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: '',
                    exitCode: 0,
                })
                .mockResolvedValueOnce({
                    stdout:
                        'Iface\tDestination\tGateway\t\tFlags\tRefCnt\tUse\tMetric\tMask\t\tMTU\tWindow\tIRTT\n' +
                        'wlan0\t00000000\t0101A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0\n',
                    stderr: '',
                    exitCode: 0,
                });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('falls back to netstat when ip route and /proc/net/route fail', async () => {
            mockRunCommand
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: '',
                    exitCode: 0,
                })
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: '',
                    exitCode: 1,
                })
                .mockResolvedValueOnce({
                    stdout:
                        'Kernel IP routing table\n' +
                        'Destination\tGateway\t\tGenmask\t\tFlags\tMSS\tWindow\tirtt\tIface\n' +
                        '0.0.0.0\t\t192.168.1.1\t0.0.0.0\t\tUG\t0\t0\t0\twlan0\n',
                    stderr: '',
                    exitCode: 0,
                });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('throws when all methods fail', async () => {
            mockRunCommand.mockResolvedValue({
                stdout: '',
                stderr: 'Failed to determine the default gateway.',
                exitCode: 1,
            });

            await expect(getDefaultGateway()).rejects.toThrow(
                'Failed to determine the default gateway.',
            );
        });
    });

    describe('macOS', () => {
        beforeEach(() => {
            mockPlatform.mockReturnValue('darwin');
        });

        it('parses gateway from netstat output', async () => {
            mockRunCommand.mockResolvedValue({
                stdout:
                    'Routing tables\n' +
                    '\n' +
                    'Internet:\n' +
                    'Destination        Gateway            Flags           Netif Expire\n' +
                    'default            192.168.1.1        UGScg          en0       \n' +
                    '127.0.0.1          127.0.0.1          UH             lo0       \n',
                stderr: '',
                exitCode: 0,
            });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('handles multiple default routes', async () => {
            mockRunCommand.mockResolvedValue({
                stdout:
                    'default            192.168.1.1        UGScg          en0       \n' +
                    'default            10.0.0.1           UGScg          en1       \n',
                stderr: '',
                exitCode: 0,
            });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('throws when no default route exists', async () => {
            mockRunCommand.mockResolvedValue({
                stdout: '127.0.0.1          127.0.0.1          UH             lo0       \n',
                stderr: '',
                exitCode: 0,
            });

            await expect(getDefaultGateway()).rejects.toThrow(
                'No default gateway found',
            );
        });

        it('throws when netstat fails', async () => {
            mockRunCommand.mockResolvedValue({
                stdout: '',
                stderr: 'netstat: socket: Permission denied',
                exitCode: 1,
            });

            await expect(getDefaultGateway()).rejects.toThrow(
                'netstat: socket: Permission denied',
            );
        });
    });

    describe('windows', () => {
        beforeEach(() => {
            mockPlatform.mockReturnValue('win32');
        });

        it('parses gateway from ipconfig output', async () => {
            mockRunCommand.mockResolvedValue({
                stdout:
                    'Windows IP Configuration\n' +
                    '\n' +
                    'Ethernet adapter Ethernet:\n' +
                    '\n' +
                    '   Connection-specific DNS Suffix  . : \n' +
                    '   IPv4 Address. . . . . . . . . . . : 192.168.1.100\n' +
                    '   Subnet Mask . . . . . . . . . . . : 255.255.255.0\n' +
                    '   Default Gateway . . . . . . . . . : 192.168.1.1\n',
                stderr: '',
                exitCode: 0,
            });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('handles ipconfig with multiple adapters', async () => {
            mockRunCommand.mockResolvedValue({
                stdout:
                    'Ethernet adapter Ethernet:\n' +
                    '\n' +
                    '   Default Gateway . . . . . . . . . : 192.168.1.1\n' +
                    '\n' +
                    'Wireless LAN adapter Wi-Fi:\n' +
                    '\n' +
                    '   Default Gateway . . . . . . . . . : 10.0.0.1\n',
                stderr: '',
                exitCode: 0,
            });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('192.168.1.1');
        });

        it('skips empty default gateway lines', async () => {
            mockRunCommand.mockResolvedValue({
                stdout:
                    'Ethernet adapter Ethernet:\n' +
                    '\n' +
                    '   Default Gateway . . . . . . . . . : \n' +
                    '\n' +
                    'Wireless LAN adapter Wi-Fi:\n' +
                    '\n' +
                    '   Default Gateway . . . . . . . . . : 10.0.0.1\n',
                stderr: '',
                exitCode: 0,
            });

            const gateway = await getDefaultGateway();
            expect(gateway).toBe('10.0.0.1');
        });

        it('throws when no default gateway exists', async () => {
            mockRunCommand.mockResolvedValue({
                stdout:
                    'Ethernet adapter Ethernet:\n' +
                    '\n' +
                    '   IPv4 Address. . . . . . . . . . . : 192.168.1.100\n',
                stderr: '',
                exitCode: 0,
            });

            await expect(getDefaultGateway()).rejects.toThrow(
                'No default gateway found',
            );
        });

        it('throws when ipconfig fails', async () => {
            mockRunCommand.mockResolvedValue({
                stdout: '',
                stderr: 'ipconfig: command not found',
                exitCode: 1,
            });

            await expect(getDefaultGateway()).rejects.toThrow(
                'ipconfig: command not found',
            );
        });
    });

    describe('unsupported platform', () => {
        it('throws on unsupported platform', async () => {
            mockPlatform.mockReturnValue('freebsd' as NodeJS.Platform);

            await expect(getDefaultGateway()).rejects.toThrow(
                'Unsupported platform: freebsd',
            );
        });
    });
});
