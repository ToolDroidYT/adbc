import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../command.js', () => ({
  runCommand: vi.fn(),
}));

import { runCommand } from '../command.js';
import { getDefaultGateway } from '../network.js';

const mockRunCommand = vi.mocked(runCommand);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getDefaultGateway', () => {
  it('parses gateway from ip route output', async () => {
    mockRunCommand.mockResolvedValue({
      stdout:
        'default via 192.168.1.1 dev eth0 proto dhcp src 192.168.1.100 metric 100\n',
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

  it('throws when no default route exists', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: '192.168.1.0/24 dev eth0 proto kernel scope link\n',
      stderr: '',
      exitCode: 0,
    });

    await expect(getDefaultGateway()).rejects.toThrow(
      'No default gateway found',
    );
  });

  it('throws when ip route fails', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: '',
      stderr: 'RTNETLINK answers: No such process',
      exitCode: 2,
    });

    await expect(getDefaultGateway()).rejects.toThrow(
      'RTNETLINK answers: No such process',
    );
  });

  it('throws on empty output', async () => {
    mockRunCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      exitCode: 0,
    });

    await expect(getDefaultGateway()).rejects.toThrow(
      'No default gateway found',
    );
  });
});
