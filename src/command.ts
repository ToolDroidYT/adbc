import { spawn } from "node:child_process";
import type { CommandResult } from "./types.js";

export function runCommand(
  command: string,
  args: string[] = [],
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (exitCode) => {
      resolve({
        stdout,
        stderr,
        exitCode: exitCode ?? 1,
      });
    });
  });
}
