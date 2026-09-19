import { runCommand } from './command.js';
import type { AdbDevice } from './types.js';

export async function ensureAdb(): Promise<void> {
  const result = await runCommand('adb', ['version']);

  if (result.exitCode !== 0) {
    throw new Error(
      'ADB is unavailable. Install Android platform-tools (android-tools).',
    );
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

  return result.stdout.trim() || result.stderr.trim();
}
