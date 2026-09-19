# `$ ADBC`

An adb connect tool to automatically connect to adb connect

---

GOAL:
Port
`/home/tooldroid/Dev/tools/adbc/adbc.sh`
into Typescript... with improvements

Flow:

[adbc start] -> [has connected devices (adb devices)]

> Mock code only

```ts
const defaultGateway = getDefaultGateway();

if (hasConnectedDevices) {
    if (isOnlyOne) {
    } else {
        listDevices();
        // pick one (up/down arrows then enter)
        // (if there's only one devices, auto select that and continue immediately)

        // selected devices will be run `adb tcpip 5555`
        // then run `adb connect {defaultGateway}:5555`
    }
} else {
    // end: show message
}
```

---

add console colors

---

example output from legacy adbc
only use as reference, not the actual console output

```log
 ╭─tooldroid@laptop in repo: HemaTODAY on  main is  v1.0.0 via  v26.8.1 took 0s
 ╰─λ adbc
Getting default gateway IP address...

Default Gateway IP: '10.74.182.13'
Gateway IP found: 10.74.182.13

Running: 'adb connect 10.74.182.13'
already connected to 10.74.182.13:5555

Press Enter to exit...
```
