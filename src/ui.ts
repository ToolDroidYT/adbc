import chalk from "chalk";
import { select } from "@inquirer/prompts";
import type { AdbDevice } from "./types.js";

export function info(message: string): void {
  console.log(chalk.cyan(message));
}

export function success(message: string): void {
  console.log(chalk.green(message));
}

export function warning(message: string): void {
  console.log(chalk.yellow(message));
}

export function error(message: string): void {
  console.error(chalk.red(message));
}

export function label(name: string, value: string): void {
  console.log(`${chalk.dim(name)} ${chalk.bold(value)}`);
}

export async function chooseDevice(devices: AdbDevice[]): Promise<AdbDevice> {
  if (devices.length === 1) return devices[0]!;

  return select({
    message: "Select a device",
    choices: devices.map((device) => ({
      name: formatDevice(device),
      value: device,
    })),
    pageSize: 10,
  });
}

function formatDevice(device: AdbDevice): string {
  const name = device.model ?? device.product ?? "Unknown device";
  return `${name} ${chalk.dim(`(${device.serial})`)}`;
}
