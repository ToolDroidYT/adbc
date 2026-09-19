# ADBC (Android Debug Bridge Connect)

Automatically connect Android devices over ADB TCP/IP.

## Requirements

- Node.js >= 22
- `adb` (Android platform-tools) in your PATH
- A supported OS for gateway detection (see below)

## Installation

```bash
# From npm
npm install -g adbc

# From source
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

The tool will:

1. Check that `adb` is installed
2. List connected USB devices
3. Detect your default gateway IP
4. If multiple devices are connected, prompt you to select one
5. Switch the selected device to TCP/IP mode on port 5555
6. Connect to the device wirelessly via `adb connect <gateway>:5555`

## Platform Support

| Platform         | Gateway detection command |
| ---------------- | ------------------------- |
| Linux            | `ip route show default`   |
| Android (Termux) | `ip route show default`   |
| macOS            | `netstat -nr`             |
| Windows          | `ipconfig`                |

## Development

```bash
npm run dev        # Run without building
npm run build      # Compile TypeScript
npm run start      # Run compiled output
npm run test       # Run tests
npm run test:watch # Run tests in watch mode
npm run lint       # Check for lint errors
npm run lint:fix   # Auto-fix lint errors
npm run format     # Format code with Prettier
npm run typecheck  # Type-check without emitting
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details
