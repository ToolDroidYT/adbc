#!/bin/bash
#
# adbc — Connect an Android device over ADB TCP/IP (port 5555)
#
# Ditch the USB cable and work over Wi-Fi.  Requires USB debugging
# enabled on the device and the device plugged in initially.
#
# Requirements:
#   adb (android-tools), ip (iproute2), awk, grep, sed
#   ping and nc are optional (pre-flight checks only).
#
#   ./adbc           normal run
#   ./adbc -n        skip the "press enter" pause at exit
#
# If a USB device is plugged in:
#   1. Enable TCP/IP mode on it (adb tcpip 5555)
#   2. Detect its Wi-Fi IP address
#   3. Connect over Wi-Fi (adb connect <ip>:5555)
#
# If a device is already connected over Wi-Fi (serial like 10.0.0.5:5555):
#   USB setup is skipped — the existing connection is reused.
#
# Serials containing a colon (e.g. 10.0.0.5:5555) are TCP/IP connections,
# not USB devices.  We need to filter them out when looking for a USB
# device because `adb tcpip` expects a USB serial, not a TCP target.
#
# The host's default gateway IP is only a fallback for detecting the
# phone address — it may work when the phone is USB-tethering.

set -u

# ── Output helpers ──────────────────────────────────────────────────────

info()  { echo "info: $*" >&2; }
ok()    { echo "ok: $*" >&2; }
warn()  { echo "warn: $*" >&2; }
error() { echo "error: $*" >&2; }

# ── Options ─────────────────────────────────────────────────────────────

PAUSE_ON_EXIT=true
for arg in "$@"; do
    case "$arg" in
        -n|--no-pause) PAUSE_ON_EXIT=false ;;
    esac
done

cleanup() {
    if [[ "$PAUSE_ON_EXIT" = true ]] && [[ -t 0 ]]; then
        echo >&2
        read -r -p "press enter to exit" >&2
    fi
}
trap cleanup EXIT

die() {
    error "$*"
    exit 1
}

# ── Helpers ─────────────────────────────────────────────────────────────

is_valid_ip() {
    local ip="$1"
    [[ "$ip" =~ ^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$ ]]
}

# ── Dependency checks ──────────────────────────────────────────────────

check_deps() {
    local missing=()
    for cmd in adb ip awk grep sed; do
        command -v "$cmd" &>/dev/null || missing+=("$cmd")
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        for cmd in "${missing[@]}"; do
            error "missing: $cmd"
        done
        die "install android-tools: sudo pacman -S android-tools"
    fi

    command -v ping &>/dev/null || info "ping not found — skipping ping check"
    command -v nc &>/dev/null || info "nc not found — skipping port check"
}

# ── ADB server ─────────────────────────────────────────────────────────

start_adb() {
    info "starting adb server..."
    local out
    out=$(adb start-server 2>&1) || true
    if echo "$out" | grep -qi "error"; then
        warn "adb start-server failed — restarting"
        adb kill-server 2>/dev/null || true
        sleep 1
        out=$(adb start-server 2>&1) || true
        if echo "$out" | grep -qi "error"; then
            die "adb server won't start — check USB permissions"
        fi
    fi
    ok "adb server running"
}

# ── Enable TCP/IP on USB device ───────────────────────────────────────

enable_tcpip() {
    local serial="$1"

    # Check if tcpip is already on port 5555 (saves a device reconnect)
    local port
    port=$(adb -s "$serial" shell getprop service.adb.tcp.port 2>/dev/null | tr -d '[:space:]')

    if [[ "$port" = "5555" ]]; then
        ok "tcpip already enabled on port 5555"
        return 0
    fi

    info "enabling tcpip on port 5555..."
    local out
    out=$(adb -s "$serial" tcpip 5555 2>&1) || true
    if echo "$out" | grep -qi "error"; then
        error "tcpip failed: $(echo "$out" | head -1)"
        return 1
    fi

    ok "tcpip enabled"
    sleep 2
}

# ── Detect device IP ──────────────────────────────────────────────────
#
# Try several methods in order of reliability.  ip route is preferred
# because it gives the source IP used for the default route.  Fall
# back to ip addr and wifi manager for older devices.

detect_ip() {
    local serial="$1"
    local ip=""

    # Method 1: ip route — look for 'src' on wlan entries (most reliable)
    ip=$(adb -s "$serial" shell ip route 2>/dev/null | \
        awk '/wlan/ {for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | \
        head -1)

    # Method 2: ip addr show wlan0
    if [[ -z "$ip" ]]; then
        ip=$(adb -s "$serial" shell ip addr show wlan0 2>/dev/null | \
            awk '/inet / {split($2,a,"/"); print a[1]}' | head -1)
    fi

    # Method 3: generic ip addr (catches non-wlan0 interface names)
    if [[ -z "$ip" ]]; then
        ip=$(adb -s "$serial" shell ip addr 2>/dev/null | \
            awk '/inet / && !/127.0.0.1/ {split($2,a,"/"); print a[1]}' | \
            head -1)
    fi

    # Method 4: wifi manager (works on some devices without root)
    if [[ -z "$ip" ]]; then
        ip=$(adb -s "$serial" shell cmd wifi status 2>/dev/null | \
            grep -oE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' | \
            grep -v '0\.0\.0\.0' | head -1)
    fi

    if [[ -n "$ip" ]] && is_valid_ip "$ip" && \
       [[ "$ip" != "127.0.0.1" ]] && [[ "$ip" != "0.0.0.0" ]]; then
        echo "$ip"
        return 0
    fi

    return 1
}

# ── Pre-connect checks (best-effort) ──────────────────────────────────
#
# Android may block ICMP and ADB may not be listening yet, so these
# are warnings only.

ping_check() {
    local ip="$1"
    command -v ping &>/dev/null || return 0
    if ping -c 1 -W 2 "$ip" &>/dev/null; then
        ok "ping ok"
    else
        warn "no ping response (android may block icmp)"
    fi
}

port_check() {
    local ip="$1"
    local port="${2:-5555}"
    command -v nc &>/dev/null || return 0
    if nc -zv -w 3 "$ip" "$port" &>/dev/null; then
        ok "port $port open"
    else
        warn "port $port not reachable (adb may still connect)"
    fi
}

# ── ADB connect ───────────────────────────────────────────────────────

adb_connect() {
    local target="$1"
    info "adb connect $target"

    local out
    out=$(adb connect "$target" 2>&1) || true

    if echo "$out" | grep -qi "already connected"; then
        ok "already connected"
        return 0
    fi
    if echo "$out" | grep -qi "connected to"; then
        ok "connected"
        return 0
    fi
    if echo "$out" | grep -qi "connection refused"; then
        error "connection refused — re-plug usb and run again"
        return 1
    fi
    if echo "$out" | grep -qi "timed out"; then
        error "timed out — check network / firewall / same subnet"
        return 1
    fi
    if echo "$out" | grep -qi "no route to host"; then
        error "no route to host — check the ip address"
        return 1
    fi
    if echo "$out" | grep -qi "unauthorized"; then
        error "unauthorized — check device for adb authorization prompt"
        return 1
    fi
    if echo "$out" | grep -qi "failed to connect"; then
        error "failed to connect"
        return 1
    fi

    # Unclear response — check device list to confirm
    sleep 1
    if adb devices 2>/dev/null | awk 'NR>1' | grep -q "${target%:*}"; then
        ok "connected (verified)"
        return 0
    fi

    error "connection failed: $(echo "$out" | head -1)"
    return 1
}

# ── Gateway fallback ──────────────────────────────────────────────────
#
# Gets the host's default gateway.  This is only used as a fallback IP
# when automatic detection fails and the phone might be tethering.
# Do not assume the gateway is the phone — it's a guess.

get_gateway() {
    ip route show default 2>/dev/null | awk '{print $3}' | head -1
}

# ── Manual IP ─────────────────────────────────────────────────────────

manual_ip() {
    echo >&2
    info "could not detect device ip automatically"
    info "enter the ip from device wifi settings"
    echo >&2

    local ip
    while :; do
        read -r -p "device ip: " ip
        ip="${ip// /}"
        if [[ -z "$ip" ]]; then
            error "ip cannot be empty"
        elif is_valid_ip "$ip"; then
            echo "$ip"
            return 0
        else
            error "invalid ipv4 address"
        fi
    done
}

# ── Summary ───────────────────────────────────────────────────────────

print_summary() {
    echo >&2
    ok "summary:"
    [[ -n "$USB_SERIAL" ]] && echo "  usb serial:   $USB_SERIAL" >&2
    [[ -n "$TCP_EXISTING" ]] && echo "  existing tcp: $TCP_EXISTING" >&2
    echo "  device ip:    ${DEVICE_IP:--}" >&2
    echo "  target:       ${CONNECT_TARGET:--}" >&2
    echo "  status:       ${CONNECTION_STATUS}" >&2
    echo >&2

    if [[ -n "$CONNECT_TARGET" ]]; then
        echo "  commands:" >&2
        echo "    adb devices" >&2
        echo "    adb disconnect $CONNECT_TARGET" >&2
        echo "    adb connect $CONNECT_TARGET" >&2
    fi
}

# ══════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════

check_deps
start_adb

USB_SERIAL=""
TCP_EXISTING=""
DEVICE_IP=""
CONNECT_TARGET=""
CONNECTION_STATUS="failed"

# ── Parse adb device list ────────────────────────────────────────────
#
# Group devices by type (USB vs TCP) and state.  The presence of a
# colon in the serial distinguishes TCP (10.0.0.5:5555) from USB
# (25053PC47G).  TCP devices are already connected over Wi-Fi and
# should not be passed to `adb tcpip`.

usb_list=()
tcp_list=()
has_unauthorized=false
has_offline=false

while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    serial="${line%% *}"
    state="${line##* }"

    if [[ "$serial" == *:* ]]; then
        # TCP/IP device (serial contains a colon)
        [[ "$state" = "device" ]] && tcp_list+=("$serial")
        [[ "$state" = "unauthorized" ]] && has_unauthorized=true
        [[ "$state" = "offline" ]] && has_offline=true
    else
        # USB device (plain serial)
        [[ "$state" = "device" ]] && usb_list+=("$serial")
        [[ "$state" = "unauthorized" ]] && has_unauthorized=true
        [[ "$state" = "offline" ]] && has_offline=true
    fi
done < <(adb devices 2>/dev/null | awk 'NR>1 && $1!="" {print $1, $2}')

if [[ "$has_unauthorized" = true ]]; then
    warn "unauthorized device(s) — check for authorization prompt"
fi
if [[ "$has_offline" = true ]]; then
    warn "offline device(s) — try replugging the cable"
fi

# ── Already connected over Wi-Fi? ────────────────────────────────────
#
# If a TCP device is already in the device list, we're done.  No need
# to mess with USB — just reuse the existing connection.

if [[ ${#tcp_list[@]} -gt 0 ]]; then
    TCP_EXISTING="${tcp_list[0]}"
    ok "already connected: $TCP_EXISTING"
    echo >&2
    echo "  reconnect: adb disconnect $TCP_EXISTING && adb connect $TCP_EXISTING" >&2
    echo >&2

    CONNECT_TARGET="$TCP_EXISTING"
    CONNECTION_STATUS="connected"
    print_summary
    exit 0
fi

# ── No USB devices? ──────────────────────────────────────────────────

if [[ ${#usb_list[@]} -eq 0 ]]; then
    die "no usb devices found — plug in a device with usb debugging enabled"
fi

# ── Select USB device ────────────────────────────────────────────────

if [[ ${#usb_list[@]} -eq 1 ]]; then
    USB_SERIAL="${usb_list[0]}"
    ok "usb device: $USB_SERIAL"
elif [[ ${#usb_list[@]} -gt 1 ]]; then
    echo >&2
    echo "multiple usb devices:" >&2
    for i in "${!usb_list[@]}"; do
        echo "  $((i+1))) ${usb_list[$i]}" >&2
    done
    echo >&2

    if [[ -n "${ADB_SERIAL:-}" ]]; then
        found=false
        for s in "${usb_list[@]}"; do
            if [[ "$s" = "$ADB_SERIAL" ]]; then
                USB_SERIAL="$s"
                found=true
                break
            fi
        done
        if [[ "$found" = false ]]; then
            die "ADB_SERIAL=$ADB_SERIAL not found among usb devices"
        fi
    elif [[ -t 0 ]]; then
        choice=""
        read -r -p "choose device [1-${#usb_list[@]}]: " choice
        if [[ "$choice" =~ ^[0-9]+$ ]] && \
           [[ "$choice" -ge 1 ]] && [[ "$choice" -le "${#usb_list[@]}" ]]; then
            USB_SERIAL="${usb_list[$((choice-1))]}"
        else
            die "invalid choice"
        fi
    else
        die "multiple usb devices — set ADB_SERIAL=<serial> and re-run"
    fi
fi

# ── Enable TCP/IP on USB device ──────────────────────────────────────

enable_tcpip "$USB_SERIAL" || die "failed to enable tcpip"

# ── Detect device IP ─────────────────────────────────────────────────

DEVICE_IP=$(detect_ip "$USB_SERIAL") || true

# Fallback: try the host's gateway (works when phone is tethering)
if [[ -z "$DEVICE_IP" ]]; then
    GW=$(get_gateway)
    if [[ -n "$GW" ]]; then
        warn "auto ip detection failed — trying gateway ($GW) as fallback"
        DEVICE_IP="$GW"
    fi
fi

# Fallback: ask the user
if [[ -z "$DEVICE_IP" ]]; then
    DEVICE_IP=$(manual_ip)
fi

CONNECT_TARGET="${DEVICE_IP}:5555"
ok "target: $CONNECT_TARGET"

# ── Pre-connect checks ───────────────────────────────────────────────

ping_check "$DEVICE_IP"
port_check "$DEVICE_IP" 5555

# ── Connect ───────────────────────────────────────────────────────────

echo >&2
if adb_connect "$CONNECT_TARGET"; then
    CONNECTION_STATUS="connected"
else
    CONNECTION_STATUS="failed"
fi

# ── Done ──────────────────────────────────────────────────────────────

print_summary
