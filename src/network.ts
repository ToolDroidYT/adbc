import { runCommand } from "./command.js";

export async function getDefaultGateway(): Promise<string> {
  const result = await runCommand("ip", ["route", "show", "default"]);

  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || "Failed to determine the default gateway.",
    );
  }

  for (const line of result.stdout.split(/\r?\n/)) {
    const match = /^default\s+via\s+(\S+)/.exec(line.trim());

    if (match?.[1]) {
      return match[1];
    }
  }

  throw new Error("No default gateway found.");
}
