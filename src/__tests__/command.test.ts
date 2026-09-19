import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { runCommand } from '../command.js';

function createMockChild(
  stdout = '',
  stderr = '',
  exitCode: number | null = 0,
): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  const killMock = vi.fn();

  Object.defineProperty(child, 'stdout', { value: stdoutEmitter });
  Object.defineProperty(child, 'stderr', { value: stderrEmitter });
  Object.defineProperty(child, 'kill', { value: killMock });

  setTimeout(() => {
    if (stdout) stdoutEmitter.emit('data', Buffer.from(stdout));
    if (stderr) stderrEmitter.emit('data', Buffer.from(stderr));
    child.emit('close', exitCode);
  }, 0);

  return child;
}

function createHangChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  const killMock = vi.fn();

  Object.defineProperty(child, 'stdout', { value: stdoutEmitter });
  Object.defineProperty(child, 'stderr', { value: stderrEmitter });
  Object.defineProperty(child, 'kill', { value: killMock });

  return child;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('runCommand', () => {
  it('resolves with stdout on success', async () => {
    vi.mocked(spawn).mockReturnValue(createMockChild('hello\n', '', 0));

    const resultPromise = runCommand('echo', ['hello']);
    await vi.advanceTimersByTimeAsync(10);
    const result = await resultPromise;

    expect(result).toEqual({
      stdout: 'hello\n',
      stderr: '',
      exitCode: 0,
    });
  });

  it('resolves with stderr and non-zero exit code', async () => {
    vi.mocked(spawn).mockReturnValue(createMockChild('', 'error\n', 1));

    const resultPromise = runCommand('failing-cmd');
    await vi.advanceTimersByTimeAsync(10);
    const result = await resultPromise;

    expect(result).toEqual({
      stdout: '',
      stderr: 'error\n',
      exitCode: 1,
    });
  });

  it('rejects on spawn error', async () => {
    const child = createHangChild();
    vi.mocked(spawn).mockReturnValue(child);

    const promise = runCommand('nonexistent');

    await vi.advanceTimersByTimeAsync(0);
    child.emit('error', new Error('ENOENT'));

    await expect(promise).rejects.toThrow('ENOENT');
  });

  it('rejects on timeout', async () => {
    const child = createHangChild();
    vi.mocked(spawn).mockReturnValue(child);

    const promise = runCommand('slow-cmd', [], { timeout: 1000 });

    const rejection = expect(promise).rejects.toThrow('timed out after 1000ms');

    await vi.advanceTimersByTimeAsync(1000);
    await rejection;

    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });
});
