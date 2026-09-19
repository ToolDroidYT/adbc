import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { runCommand } from "../command.js";

function createMockChild(
  stdout = "",
  stderr = "",
  exitCode: number | null = 0,
): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  (child as any).stdout = new EventEmitter();
  (child as any).stderr = new EventEmitter();
  (child as any).kill = vi.fn();

  setTimeout(() => {
    if (stdout) (child as any).stdout.emit("data", Buffer.from(stdout));
    if (stderr) (child as any).stderr.emit("data", Buffer.from(stderr));
    child.emit("close", exitCode);
  }, 0);

  return child;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runCommand", () => {
  it("resolves with stdout on success", async () => {
    vi.mocked(spawn).mockReturnValue(createMockChild("hello\n", "", 0));

    const result = runCommand("echo", ["hello"]);
    await vi.advanceTimersByTimeAsync(0);

    expect(result).toEqual({
      stdout: "hello\n",
      stderr: "",
      exitCode: 0,
    });
  });

  it("resolves with stderr and non-zero exit code", async () => {
    vi.mocked(spawn).mockReturnValue(createMockChild("", "error\n", 1));

    const result = runCommand("failing-cmd");
    await vi.advanceTimersByTimeAsync(0);

    expect(result).toEqual({
      stdout: "",
      stderr: "error\n",
      exitCode: 1,
    });
  });

  it("rejects on spawn error", async () => {
    const child = createMockChild();
    vi.mocked(spawn).mockReturnValue(child);

    const promise = runCommand("nonexistent");
    child.emit("error", new Error("ENOENT"));
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).rejects.toThrow("ENOENT");
  });

  it("rejects on timeout", async () => {
    const child = createMockChild();
    vi.mocked(spawn).mockReturnValue(child);

    const promise = runCommand("slow-cmd", [], { timeout: 1000 });

    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("timed out after 1000ms");
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
