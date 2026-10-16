import { spawn, type ChildProcess } from 'node:child_process';
import type { CommandResult, RunCommandOptions } from './types.js';

const DEFAULT_TIMEOUT = 30_000;

const activeChildren = new Set<ChildProcess>();
let signalHandlersRegistered = false;

function terminateActiveChildren(): void {
    for (const child of activeChildren) {
        child.kill('SIGTERM');
    }
}

function ensureSignalHandlers(): void {
    if (signalHandlersRegistered) return;

    signalHandlersRegistered = true;
    process.on('SIGINT', terminateActiveChildren);
    process.on('SIGTERM', terminateActiveChildren);
}

export function runCommand(
    command: string,
    args: string[] = [],
    options: RunCommandOptions = {},
): Promise<CommandResult> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    ensureSignalHandlers();

    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        activeChildren.add(child);

        let stdout = '';
        let stderr = '';
        let settled = false;
        let timer: NodeJS.Timeout | undefined;

        const finish = (): void => {
            settled = true;
            clearTimeout(timer);
            activeChildren.delete(child);
        };

        child.stdout.on('data', (chunk: Buffer) => {
            stdout += chunk.toString();
        });

        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        timer = setTimeout(() => {
            if (settled) return;

            child.kill('SIGTERM');
            finish();
            reject(
                new Error(
                    `Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`,
                ),
            );
        }, timeout);

        child.on('error', (err) => {
            if (settled) return;

            finish();
            reject(err);
        });

        child.on('close', (exitCode) => {
            if (settled) return;

            finish();
            resolve({
                stdout,
                stderr,
                exitCode: exitCode ?? 1,
            });
        });
    });
}
