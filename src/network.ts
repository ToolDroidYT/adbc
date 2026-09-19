import { platform } from 'node:os';
import { runCommand } from './command.js';

export async function getDefaultGateway(): Promise<string> {
  const os = platform();

  switch (os) {
    case 'linux':
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
