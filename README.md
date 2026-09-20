# ADBC

[![CI](https://github.com/ToolDroidYT/adbc/actions/workflows/ci.yml/badge.svg)](https://github.com/ToolDroidYT/adbc/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@tooldroid/adbc)](https://www.npmjs.com/package/@tooldroid/adbc)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Wirelessly connect to Android devices over ADB TCP/IP - automatically detect your network gateway and switch USB-connected devices to Wi-Fi ADB.

## Requirements

- Node.js >= 22
- `adb` (Android platform-tools) in your PATH
- USB debugging enabled on the target device

## Installation

#### NPM

```bash
npm install -g @tooldroid/adbc
```

#### From source

```bash
git clone https://github.com/ToolDroidYT/adbc.git
cd adbc
npm install
npm run build
npm link
```

## Usage

```bash
adbc
```

The tool handles two scenarios:

**No devices connected:** Attempts to connect to `<gateway>:5555` directly, in case a device was previously switched to TCP/IP mode.

**One or more USB devices connected:**

1. Detects your default gateway IP
2. If multiple devices are found, prompts you to select one
3. Switches the selected device to TCP/IP mode on port 5555
4. Connects to the device wirelessly via `adb connect <gateway>:5555`

## Platform Support

| Platform         | Gateway detection                          |
| ---------------- | ------------------------------------------ |
| Linux            | `ip route` → `/proc/net/route` → `netstat` |
| Android (Termux) | `ip route` → `/proc/net/route` → `netstat` |
| macOS            | `netstat -nr`                              |
| Windows          | `ipconfig`                                 |

Linux and Android (Termux) use a fallback chain: primary method via `ip route show default`, then `/proc/net/route` parsing, then `netstat -rn`.

## Architecture

| Module       | Purpose                                                   |
| ------------ | --------------------------------------------------------- |
| `index.ts`   | CLI entry point and main workflow                         |
| `adb.ts`     | ADB device listing, parsing, TCP/IP switching, connecting |
| `network.ts` | Platform-specific default gateway detection               |
| `command.ts` | Child process runner with 30s timeout                     |
| `ui.ts`      | Colored terminal output and interactive device selection  |
| `types.ts`   | TypeScript interfaces (`AdbDevice`, `CommandResult`)      |

## Development

```bash
npm run dev        # Run without building
npm run build      # Compile TypeScript + minify with esbuild
npm run start      # Run compiled output
npm run test       # Run tests (Vitest)
npm run test:watch # Run tests in watch mode
npm run lint       # Check for lint errors (ESLint)
npm run lint:fix   # Auto-fix lint errors
npm run format     # Format code with Prettier
npm run typecheck  # Type-check without emitting
```

### CI Pipeline

The CI runs on every push and pull request to `main`:

1. `typecheck` — TypeScript type checking
2. `lint` — ESLint analysis
3. `format:check` — Prettier formatting verification
4. `build` — Compilation and minification
5. `test` — Unit tests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Ensure `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test` all pass
4. Submit a pull request

## License

[MIT](LICENSE)
