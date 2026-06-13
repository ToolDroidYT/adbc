#!/bin/bash
#
# adbc.sh — Connect to an Android device over ADB TCP/IP
#
# Usage:
#   ./adbc.sh
#   ./adbc.sh --no-pause          # skip pause on exit
#   ./adbc.sh -n                   # same
#
# Dependencies: bash 4+, adb, ip, awk, head, grep, cut, tr, sort, uniq

set -u

# ── style helpers ──────────────────────────────────────────────────────────────
OK="[OK]"
WARN="[WARN]"
ERR="[ERROR]"
INFO="[INFO]"
RST="\033[0m"
BOLD="\033[1m"
RED="\033[0;31m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
NO_COLOR=""

# Detect color support
if [[ -t 1 ]] && [[ -n "${TERM:-}" ]] && tput colors &>/dev/null; then
    :  # keep color
else
    OK="[OK]"; WARN="[WARN]"; ERR="[ERROR]"; INFO="[INFO]"
    RST=""; BOLD=""; RED=""; GREEN=""; YELLOW=""; CYAN=""
fi

log_ok()   { echo -e "${GREEN}${OK}${RST}  $*" >&2; }
log_warn() { echo -e "${YELLOW}${WARN}${RST} $*" >&2; }
log_err()  { echo -e "${RED}${ERR}${RST} $*" >&2; }
log_info() { echo -e "${CYAN}${INFO}${RST} $*" >&2; }
log()      { echo -e "$*" >&2; }

PAUSE_ON_EXIT=true
for arg in "$@"; do
    case "$arg" in
        -n|--no-pause) PAUSE_ON_EXIT=false ;;
    esac
done

cleanup() {
    if [[ "$PAUSE_ON_EXIT" = true ]] && [[ -t 0 ]]; then
        echo
        read -r -p "Press Enter to exit..."
    fi
}
trap cleanup EXIT

die() {
    log_err "$*"
    exit 1
}

# ── dependency checks ─────────────────────────────────────────────────────────
REQUIRED_COMMANDS=(adb ip awk head grep cut tr sort uniq)

check_deps() {
    local missing=()
    for cmd in "${REQUIRED_COMMANDS[@]}"; do
        if ! command -v "$cmd" &>/dev/null; then
            missing+=("$cmd")
        fi
    done

    if [[ ${#missing[@]} -eq 0 ]]; then
        log_ok "All required commands found."
        return 0
    fi

    log_err "Missing commands: ${missing[*]}"
    for cmd in "${missing[@]}"; do
        case "$cmd" in
            adb)
                log_info "Install with: sudo pacman -S android-tools"
                ;;
            ip|awk|head|grep|cut|tr|sort|uniq)
                log_info "Part of coreutils / iproute2. Install with: sudo pacman -S coreutils iproute2"
                ;;
        esac
    done
    die "Install missing dependencies and re-run."
}

# ── ADB server management ────────────────────────────────────────────────────
start_adb_server() {
    log_info "Starting ADB server..."
    local out
    out=$(adb start-server 2>&1) || true
    if echo "$out" | grep -qi "error"; then
        log_warn "adb start-server produced an error — attempting restart..."
        adb kill-server 2>/dev/null || true
        sleep 1
        out=$(adb start-server 2>&1) || true
        if echo "$out" | grep -qi "error"; then
            die "Failed to start ADB server. Check USB permissions."
        fi
    fi
    log_ok "ADB server is running."
}

# ── USB device detection ──────────────────────────────────────────────────────
detect_usb_device() {
    local list
    list=$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1}')
    local unauthorized
    unauthorized=$(adb devices 2>/dev/null | awk 'NR>1 && $2=="unauthorized" {print $1}')
    local offline
    offline=$(adb devices 2>/dev/null | awk 'NR>1 && $2=="offline" {print $1}')
    local all_lines
    all_lines=$(adb devices 2>/dev/null | awk 'NR>1 && $1!="" {print $1, $2}')

    local total
    total=$(echo "$all_lines" | awk 'END{print NR}')
    local valid_count
    valid_count=$(echo "$list" | awk 'NF{count++} END{print count+0}')

    log_info "ADB devices:"
    if [[ -z "${all_lines// }" ]]; then
        echo "  (none)" >&2
    else
        echo "$all_lines" | while read -r serial state; do
            echo "    $serial  [$state]" >&2
        done
    fi
    echo >&2

    # No devices at all
    if [[ -z "${all_lines// }" ]] || [[ "$total" -eq 0 ]]; then
        log_err "No Android devices detected over USB."
        log_info "Check:"
        log_info "  • USB debugging is enabled on the device (Developer options)."
        log_info "  • The cable is connected and not charge-only."
        log_info "  • You have authorized this PC on the device."
        log_info "  • Try: adb kill-server && adb start-server"
        return 1
    fi

    # Show unauthorized devices prominently
    if [[ -n "${unauthorized// }" ]]; then
        local ua_count
        ua_count=$(echo "$unauthorized" | awk 'END{print NR}')
        log_warn "$ua_count device(s) are unauthorized."
        echo "$unauthorized" | while read -r line; do
            [[ -z "$line" ]] && continue
            echo "    $line" >&2
        done
        log_info "Unlock the device and check the 'Allow USB debugging?' prompt."
        log_info "Revoke USB debugging authorizations in Developer options if needed."
    fi

    # Show offline devices
    if [[ -n "${offline// }" ]]; then
        local off_count
        off_count=$(echo "$offline" | awk 'END{print NR}')
        log_warn "$off_count device(s) are offline."
        echo "$offline" | while read -r line; do
            [[ -z "$line" ]] && continue
            echo "    $line" >&2
        done
        log_info "Replug the cable or restart the device."
    fi

    # No valid (device-state) devices
    if [[ -z "$list" ]] || [[ "$valid_count" -eq 0 ]]; then
        log_err "No authorized USB devices found."
        return 1
    fi

    # Multiple valid devices
    if [[ "$valid_count" -gt 1 ]]; then
        log_warn "Multiple authorized devices detected."
        echo >&2
        log_info "Available devices:"
        local i=1
        while read -r line; do
            [[ -z "$line" ]] && continue
            echo "  $i) $line" >&2
            i=$((i + 1))
        done <<< "$list"

        echo >&2
        log_info "Pass one of these serials via ADB_SERIAL env var next time."
        log_info "Using the first device for now: $(echo "$list" | head -1)"
        echo "$list" | head -1
        return 0
    fi

    echo "$list"
    return 0
}

# ── enable TCP/IP on device ───────────────────────────────────────────────────
enable_tcpip() {
    local serial="$1"

    # Check if tcpip is already on port 5555
    local current_port
    current_port=$(adb -s "$serial" shell getprop service.adb.tcp.port 2>/dev/null | tr -d '[:space:]')

    if [[ "$current_port" = "5555" ]]; then
        log_ok "ADB TCP/IP already listening on port 5555."
        return 0
    fi

    log_info "Switching device to TCP/IP mode on port 5555..."
    local out
    out=$(adb -s "$serial" tcpip 5555 2>&1) || true

    if echo "$out" | grep -qi "error"; then
        log_err "Failed to enable TCP/IP mode."
        log_info "Output: $out"
        log_info "Plan B: Connect device USB and manually run: adb -s $serial tcpip 5555"
        return 1
    fi

    log_ok "TCP/IP mode enabled."
    sleep 3

    # Verify device is still in device state after mode switch
    local state
    state=$(adb devices 2>/dev/null | awk -v s="$serial" '$1==s {print $2}')
    if [[ "$state" != "device" ]]; then
        log_warn "Device state after tcpip is '$state'. Reconnecting..."
        sleep 2
    fi
    return 0
}

# ── detect Android device IP ──────────────────────────────────────────────────
detect_device_ip() {
    local serial="$1"

    log_info "Detecting device IP address..."

    # Strategy 1: ip route (most reliable on modern Android)
    local ip=""
    ip=$(adb -s "$serial" shell ip route 2>/dev/null | \
        awk '/wlan/{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | \
        head -1)

    # Strategy 2: ip addr show wlan0
    if [[ -z "$ip" ]]; then
        ip=$(adb -s "$serial" shell ip addr show wlan0 2>/dev/null | \
            awk '/inet /{split($2,a,"/"); print a[1]}' | head -1)
    fi

    # Strategy 3: ifconfig wlan0 (legacy fallback)
    if [[ -z "$ip" ]]; then
        ip=$(adb -s "$serial" shell ifconfig wlan0 2>/dev/null | \
            awk '/inet addr/{split($2,a,":"); print a[2]}' | head -1)
    fi

    # Strategy 4: try getting IP from wifi manager
    if [[ -z "$ip" ]]; then
        ip=$(adb -s "$serial" shell cmd wifi status 2>/dev/null | \
            grep -oE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' | \
            grep -v '0\.0\.0\.0' | head -1)
    fi

    # Validate
    if [[ -n "$ip" ]]; then
        # Basic IPv4 validation
        if [[ "$ip" =~ ^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$ ]]; then
            if [[ "$ip" != "127.0.0.1" ]] && [[ "$ip" != "0.0.0.0" ]]; then
                log_ok "Device IP: $ip"
                echo "$ip"
                return 0
            fi
        fi
    fi

    log_warn "Could not detect device IP automatically."
    return 1
}

# ── network sanity checks ────────────────────────────────────────────────────
check_default_route() {
    local gw
    gw=$(ip route show default 2>/dev/null | awk '{print $3}' | head -1)
    if [[ -z "$gw" ]]; then
        log_err "Computer has no default route. Are you connected to a network?"
        return 1
    fi
    log_ok "Default gateway: $gw"
    echo "$gw"
    return 0
}

check_reachable() {
    local ip="$1"
    if command -v ping &>/dev/null; then
        if ping -c 1 -W 2 "$ip" &>/dev/null; then
            log_ok "Device is reachable (ping)."
            return 0
        else
            log_warn "Device does not respond to ping (may still connect via ADB)."
            return 0
        fi
    fi
    # No ping available — not an error
    return 0
}

check_port_reachable() {
    local ip="$1"
    local port="${2:-5555}"

    if command -v nc &>/dev/null; then
        if nc -zv -w 3 "$ip" "$port" &>/dev/null; then
            log_ok "Port $port is open."
            return 0
        else
            log_warn "Port $port not reachable via nc (ADB may still accept connections)."
            return 0
        fi
    fi

    if command -v timeout &>/dev/null && command -v bash &>/dev/null; then
        if timeout 2 bash -c "echo > /dev/tcp/$ip/$port" 2>/dev/null; then
            log_ok "Port $port is open."
            return 0
        else
            log_warn "Port $port not reachable via /dev/tcp (may be blocked or ADB not ready)."
            return 0
        fi
    fi

    log_info "No port checker available (nc or /dev/tcp). Skipping port check."
    return 0
}

# ── ADB connect ───────────────────────────────────────────────────────────────
attempt_connect() {
    local target="$1"
    log_info "Connecting: adb connect $target"

    local out
    out=$(adb connect "$target" 2>&1) || true
    local exit_code=$?

    echo "  $out"

    if echo "$out" | grep -qi "connected to" && ! echo "$out" | grep -qi "already"; then
        log_ok "Successfully connected to $target"
        return 0
    fi

    if echo "$out" | grep -qi "already connected"; then
        log_ok "Already connected to $target"
        return 0
    fi

    if echo "$out" | grep -qi "connection refused"; then
        log_err "Connection refused — TCP/IP mode may not be enabled on device."
        log_info "Reconnect USB and re-run the script."
        return 1
    fi

    if echo "$out" | grep -qi "timeout"; then
        log_err "Connection timed out."
        log_info "  • Ensure device and PC are on the same Wi-Fi network."
        log_info "  • Check that firewall is not blocking port 5555."
        log_info "  • Try pinging $target from this PC."
        return 1
    fi

    if echo "$out" | grep -qi "no route to host"; then
        log_err "No route to host."
        log_info "  • Verify the IP address is correct."
        log_info "  • Check network connectivity between devices."
        return 1
    fi

    if echo "$out" | grep -qi "unauthorized"; then
        log_err "Authentication failed / unauthorized."
        log_info "  • Check the device for a 'Allow USB debugging?' prompt."
        log_info "  • Revoke USB debugging authorizations and try again."
        return 1
    fi

    if echo "$out" | grep -qi "cannot connect"; then
        log_err "Cannot connect to $target."
        log_info "  • Try: adb kill-server && adb start-server"
        log_info "  • Verify USB debugging is still enabled."
        return 1
    fi

    # Generic failure
    if [[ "$exit_code" -ne 0 ]]; then
        log_err "ADB connect failed (exit code $exit_code)."
        return 1
    fi

    # If we got here but didn't match known failures, consider it a success
    if echo "$out" | grep -qi "connected"; then
        log_ok "Connected (non-standard response)."
        return 0
    fi

    log_warn "Unexpected ADB response. Attempting connection check..."
    sleep 1
    if adb devices 2>/dev/null | awk 'NR>1' | grep -q "${target%:*}"; then
        log_ok "Device appears in device list. Connected."
        return 0
    fi

    log_err "Connection outcome uncertain. Check: adb devices"
    return 1
}

# ── Plan C: manual IP input ──────────────────────────────────────────────────
manual_ip_entry() {
    log_info "Please enter the Android device IP address manually."
    log_info "You can find it on the device under:"
    log_info "  Settings → About phone → Status → IP address"
    log_info "  Or: Settings → Wi-Fi → tap connected network → IP address"
    echo >&2
    local ip=""
    while : ; do
        read -r -p "Device IP: " ip
        ip="${ip// /}"
        if [[ -z "$ip" ]]; then
            log_err "IP cannot be empty."
            continue
        fi
        if [[ "$ip" =~ ^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$ ]]; then
            echo "$ip"
            return 0
        else
            log_err "Invalid IPv4 address. Try again."
        fi
    done
}

# ── Plan D: troubleshooting guide ────────────────────────────────────────────
print_troubleshooting() {
    log_info "═══════════════════════════════════════════════════════════"
    log_info "  ADB Wi-Fi Connection — Troubleshooting Guide"
    log_info "═══════════════════════════════════════════════════════════"
    log_info ""
    log_info "  1. Confirm phone and PC are on the same Wi-Fi network"
    log_info "  2. Confirm USB debugging is enabled (Developer options)"
    log_info "  3. Revoke & re-authorize USB debugging if unauthorized"
    log_info "  4. Replug the USB cable"
    log_info "  5. Restart ADB server: adb kill-server && adb start-server"
    log_info "  6. Disable VPN or firewall temporarily"
    log_info "  7. Check Android Wi-Fi state (not randomized/off)"
    log_info "  8. Restart both devices"
    log_info "  9. Try a different USB cable or port"
    log_info ""
    log_info "  Commands to diagnose:"
    log_info "    adb devices"
    log_info "    adb shell ip route"
    log_info "    adb shell ip addr show wlan0"
    log_info "    adb shell getprop service.adb.tcp.port"
    log_info "    ping <device-ip>"
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

echo -e "${BOLD}╔════════════════════════════════════════════╗${RST}" >&2
echo -e "${BOLD}║   ADB Wi-Fi Connection Helper             ║${RST}" >&2
echo -e "${BOLD}╚════════════════════════════════════════════╝${RST}" >&2

USB_SERIAL=""
DEVICE_IP=""
CONNECT_TARGET=""
CONNECTION_OK=false

# Step 1: Preflight
log_info "Step 1: Preflight checks"
check_deps
start_adb_server
DEFAULT_GW=$(check_default_route || true)
echo >&2

# Step 2: USB detection
log_info "Step 2: USB device detection"

if detect_usb_device; then
    USB_SERIAL=$(adb devices 2>/dev/null | awk 'NR>1 && $2=="device" {print $1}' | head -1)
    log_ok "Using USB device: $USB_SERIAL"
    echo >&2

    # Step 3: Enable TCP/IP
    log_info "Step 3: Enable ADB TCP/IP on device"
    if ! enable_tcpip "$USB_SERIAL"; then
        log_err "TCP/IP mode could not be enabled."
        print_troubleshooting
        exit 1
    fi
    echo >&2

    # Step 4: Detect device IP (Plan A)
    log_info "Step 4: Detect device IP"
    DEVICE_IP=$(detect_device_ip "$USB_SERIAL") || true

    if [[ -n "$DEVICE_IP" ]]; then
        CONNECT_TARGET="${DEVICE_IP}:5555"
        log_info "Plan A: Connect via detected device IP"
        log_info "Target: $CONNECT_TARGET"
        check_reachable "$DEVICE_IP"
        check_port_reachable "$DEVICE_IP" 5555
        echo >&2
        if attempt_connect "$CONNECT_TARGET"; then
            CONNECTION_OK=true
        fi
    fi

    # Plan B: try default gateway
    if [[ "$CONNECTION_OK" != true ]] && [[ -n "$DEFAULT_GW" ]]; then
        echo >&2
        log_info "Plan B: Trying default gateway ($DEFAULT_GW) as device IP..."
        log_info "This works when the phone is USB-tethering or acting as gateway."
        DEVICE_IP="$DEFAULT_GW"
        CONNECT_TARGET="${DEVICE_IP}:5555"
        check_reachable "$DEVICE_IP"
        check_port_reachable "$DEVICE_IP" 5555
        echo >&2
        if attempt_connect "$CONNECT_TARGET"; then
            CONNECTION_OK=true
        fi
    fi
else
    log_err "No USB device available."
    echo >&2
    log_info "Proceeding to fallback plans..."
fi
echo >&2

# Plan C: manual IP entry (if no success yet)
if [[ "$CONNECTION_OK" != true ]]; then
    echo >&2
    log_info "Plan C: Manual IP entry"
    log_info "──────────────────────"
    DEVICE_IP=$(manual_ip_entry)
    CONNECT_TARGET="${DEVICE_IP}:5555"
    echo >&2
    check_reachable "$DEVICE_IP"
    check_port_reachable "$DEVICE_IP" 5555
    echo >&2
    if attempt_connect "$CONNECT_TARGET"; then
        CONNECTION_OK=true
    fi
fi

# Plan D: troubleshooting (if still failed)
if [[ "$CONNECTION_OK" != true ]]; then
    echo >&2
    log_err "All connection plans failed."
    print_troubleshooting
    exit 1
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo >&2
log_info "═══════════════════════════════════════════════"
log_info "  Connection Summary"
log_info "═══════════════════════════════════════════════"
if [[ -n "$USB_SERIAL" ]]; then
    log_info "  USB Serial:  $USB_SERIAL"
fi
log_info "  Device IP:   ${DEVICE_IP:-(not set)}"
log_info "  Target:      ${CONNECT_TARGET:-(not set)}"
log_info "  Status:      ${CONNECTION_OK:+Connected}"
echo >&2
log_info "Now disconnected from USB (if applicable)."
log_info "To disconnect:   adb disconnect $CONNECT_TARGET"
log_info "To reconnect:    adb connect $CONNECT_TARGET"
