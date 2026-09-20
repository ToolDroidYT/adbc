#!/usr/bin/env node

import {
    connectTcpIp,
    ensureAdb,
    getConnectedDevices,
    switchToTcpIp,
} from './adb.js';
import { getDefaultGateway } from './network.js';
import { chooseDevice, error, info, label, success, warning } from './ui.js';

const ADB_PORT = 5555;

async function main(): Promise<void> {
    console.log();
    info('ADBC - ADB over TCP/IP');
    console.log();

    await ensureAdb();

    const devices = await getConnectedDevices();

    if (devices.length === 0) {
        warning('No connected ADB devices found.');

        const gateway = await getDefaultGateway();
        info(`Trying to connect to ${gateway}:${ADB_PORT}...`);

        const output = await connectTcpIp(gateway, ADB_PORT);

        if (/connected/i.test(output)) {
            success(output);
        } else {
            warning(output || 'Could not connect over TCP/IP.');
            console.log(
                'Connect a device over USB with USB debugging enabled.',
            );
        }

        return;
    }

    const gateway = await getDefaultGateway();

    label('Connected devices:', String(devices.length));
    label('Default gateway:', gateway);
    console.log();

    const device = await chooseDevice(devices);

    info(`Switching ${device.model ?? device.serial} to TCP/IP...`);
    await switchToTcpIp(device, ADB_PORT);
    success(`ADB TCP/IP enabled on port ${ADB_PORT}.`);

    console.log();

    info(`Connecting to ${gateway}:${ADB_PORT}...`);
    const output = await connectTcpIp(gateway, ADB_PORT);

    if (/already connected/i.test(output)) {
        success(output);
    } else {
        success(output || `Connected to ${gateway}:${ADB_PORT}`);
    }

    console.log();
}

main().catch((cause: unknown) => {
    const message = cause instanceof Error ? cause.message : String(cause);
    error(message);
    process.exitCode = 1;
});
