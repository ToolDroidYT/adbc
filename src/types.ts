export interface AdbDevice {
  serial: string;
  state: string;
  product?: string;
  model?: string;
  transportId?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
