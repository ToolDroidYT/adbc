import { describe, it, expect } from 'vitest';
import { formatDevice } from '../ui.js';
import type { AdbDevice } from '../types.js';

describe('formatDevice', () => {
  it('uses model name when available', () => {
    const device: AdbDevice = {
      serial: 'SERIAL123',
      state: 'device',
      model: 'Pixel 5',
    };

    const result = formatDevice(device);
    expect(result).toContain('Pixel 5');
    expect(result).toContain('SERIAL123');
  });

  it('falls back to product when no model', () => {
    const device: AdbDevice = {
      serial: 'SERIAL123',
      state: 'device',
      product: 'redfin',
    };

    const result = formatDevice(device);
    expect(result).toContain('redfin');
  });

  it("uses 'Unknown device' when neither model nor product", () => {
    const device: AdbDevice = {
      serial: 'SERIAL123',
      state: 'device',
    };

    const result = formatDevice(device);
    expect(result).toContain('Unknown device');
  });
});
