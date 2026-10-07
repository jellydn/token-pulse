# JC4827W543C hardware validation

Related: [issue #14](https://github.com/jellydn/token-pulse/issues/14) and
[PR #11](https://github.com/jellydn/token-pulse/pull/11).
This is a procedure, not a claim that a physical board passed.

## Identify the board first

Record PCB markings and a photo of both sides. The intended target is the
Guition **JC4827W543C**, ESP32-S3-WROOM-1-N4R8, NV3041A QSPI 480×272 panel,
and GT911 touch controller. **ESP32-4827S043 RGB examples are a different
board**. Do not use their firmware or RGB bus definitions.

Compare the configured pins with the board traces/vendor schematic:

| Signal | GPIO |
| --- | --- |
| QSPI CS / SCK | 45 / 47 |
| QSPI D0 / D1 / D2 / D3 | 21 / 48 / 40 / 39 |
| Backlight | 1 |
| GT911 SDA / SCL / RST / INT | 8 / 4 / 38 / 3 |

Independent references (these do not replace a physical check):

- [morfirk QSPI board examples](https://github.com/morfirk/JC4827W543_ESP32)
- [profi-max board examples](https://github.com/profi-max/JC4827W543_4.3inch_ESP32S3_board)
- [MicroPython board port](https://github.com/straga/micropython_lcd/tree/main/device/JC4827W543)

## 1. Isolate display and touch

From `clients/jc4827w543`, run:

```sh
pio run -e hardware-smoke
pio run -e hardware-smoke -t upload
pio device monitor -b 115200
```

Close the serial monitor before another upload. This diagnostic uses the
production board drivers but does not start Wi-Fi, fetch data, or write NVS.
The application image is replaced; use the normal target to restore it.

1. Confirm the boot text, then a one-second backlight-off interval, then light.
2. Confirm the red border is visible on all four edges at 480×272, with TL,
   TR, BL, BR and center targets upright and in their named positions.
3. Confirm the serial log reports GT911 address and product ID.
4. Touch the five targets. Record the displayed coordinates. X must increase
   left to right; Y must increase top to bottom. Center is near (240, 136).
   Drag across the screen and check for swapped axes, clipping, or offsets.
5. If this fails, compare a matching QSPI reference image before changing the
   application UI. Restore Token Pulse after that comparison.

## 2. Test the application

Build/upload `jc4827w543c` using the [setup guide](README.md). Use a private
test network and a protected Token Pulse endpoint; never publish port 8080.
Record each result as PASS, FAIL, or NOT RUN, with notes and evidence.

| Check | Expected result |
| --- | --- |
| Boot and Settings | Full screen, readable dashboard, correctly placed touch controls |
| Scan and scroll | Responsive list, RSSI/security shown, 2.4 GHz warning, unsupported networks disabled |
| Keyboard | Open, close, reopen; Back/Connect/Test + save remain reachable |
| Successful Wi-Fi | Association then IP; candidate saved only after connection |
| Failed Wi-Fi | Clear failure; previous saved credentials remain; reconnect works |
| Reboot | Working SSID and tested API URL restored |
| Forget and reboot | Wi-Fi cleared; compile-time fallback remains disabled |
| Live API | Verified HTTPS `/api/display` paints expected provider/today values |
| Invalid URL | HTTP, credentials in URL, and wrong path rejected before saving |
| Failed API test | TLS, non-2xx, malformed JSON fail without replacing saved URL |
| Poll failure | Disconnect server/network after a valid paint; STALE with last good values |
| Recovery | Restore network/server; fresh values replace STALE |
| Private diagnostics | Serial logs contain no SSID, password, API URL, or payload |

## Troubleshooting by boundary

| Symptom | Check first |
| --- | --- |
| No serial device | Data cable, USB port, BOOT/RST download sequence |
| Blank or white screen | Backlight, power, QSPI pins, NV3041A target; not RGB board definitions |
| Touch failure/offset | GT911 reset/address (`0x5D` or `0x14`), I2C pins, smoke-test coordinates |
| Wi-Fi failure | 2.4 GHz network, supported security, password, disconnect reason/IP stage |
| TLS/API failure | PEM CA in build, protected-origin device access, exact HTTPS path, HTTP status |
| JSON/model failure | `/api/display` schema, server version, valid payload retained as STALE |

The generic browser image has no publisher CA. Verified API fetch must fail
closed until a local build supplies `DISPLAY_ROOT_CA`; do not bypass TLS to
turn a failed test into a pass.

## Test record (fill on physical hardware)

- Date/tester:
- Firmware commit and target:
- PlatformIO/toolchain versions:
- PCB/module/display/touch markings and photo links:
- Pin verification method/results:
- Smoke-test border, backlight, and five coordinates:
- Application checklist results and evidence:
- Firmware flash/static RAM sizes:
- Failures and follow-up issue links:

**Current status: NOT RUN.** An orb build cannot verify board pins, display,
touch, radio behavior, or persistence on a physical device. Keep #14 open
until a completed record and photos are available.
