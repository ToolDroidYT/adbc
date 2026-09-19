import { spawn } from 'node:child_process';
import type { CommandResult, RunCommandOptions } from './types.js';

const DEFAULT_TIMEOUT = 30_000;

export function runCommand(
  command: string,
  args: string[] = [],
  options: RunCommandOptions = {},
): Promise<CommandResult> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(
        new Error(
          `Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`,
        ),
      );
    }, timeout);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (exitCode) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });

    process.on('SIGINT', () => {
      child.kill('SIGTERM');
    });
    process.on('SIGTERM', () => {
      child.kill('SIGTERM');
    });
  });
}
