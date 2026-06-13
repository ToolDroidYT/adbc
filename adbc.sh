#!/bin/bash

echo "Getting default gateway IP address..."
echo

# Get default gateway using 'ip route'
# Extracts the 3rd field (IP) from the default route line
gateway_ip=$(ip route show default | awk '{print $3}' | head -n 1)

echo "Default Gateway IP: '$gateway_ip'"

# Check if gateway IP exists and is not empty
if [[ -n "$gateway_ip" ]]; then
    echo "Gateway IP found: $gateway_ip"
    echo
    echo "Running: 'adb connect $gateway_ip'"

    # Check if adb command exists
    if command -v adb &> /dev/null; then
        adb connect "$gateway_ip"
    else
        echo "Error: adb command not found. Ensure android-tools is installed."
        exit 1
    fi
else
    echo "Error: No default gateway IP found."
    exit 1
fi

echo
read -p "Press Enter to exit..."
