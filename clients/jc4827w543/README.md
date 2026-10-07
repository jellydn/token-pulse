# Guition JC4827W543C client

Firmware for the Guition JC4827W543C desk panel. It reads Token Pulse
`GET /api/display` and never talks to CodexBar.

This board is not an AWTRIX matrix and it is not the Sunton ESP32-4827S043
RGB panel. Do not flash `clients/awtrix-ng/token_pulse.be`, and do not build
with `-D ESP32_4827S043`. That define selects a 16-bit RGB bus. This module
drives an NV3041A over QSPI.

## Hardware

| Part | Notes |
| --- | --- |
| **JC4827W543C** | ESP32-S3-WROOM-1-N4R8, 4 MB flash, 8 MB octal PSRAM |

The PlatformIO board id is `esp32-s3-devkitc-1`, which defaults to an 8 MB
partition table. `platformio.ini` forces the 4 MB `default.csv` table so the
partitions stay inside this module. This first image does not put the heap in
octal PSRAM. Direct drawing fits in internal RAM.
| **Panel** | 4.3" 480×272 IPS, NV3041A, QSPI |
| **Touch** | GT911 on I2C, registered as the LVGL pointer input |
| **USB** | USB-C on the board programs the chip. Use a data cable |

QSPI pins (vendor map): CS 45, SCK 47, D0 21, D1 48, D2 40, D3 39, backlight 1.
GT911: SDA 8, SCL 4, RST 38, INT 3. Address `0x5D` when INT is low during reset.

## Network and trust boundary

Same rule as the [e-paper client](../esp32-epaper/README.md):

1. Run Token Pulse on loopback (`127.0.0.1:3000`).
2. Publish only Token Pulse through Tailscale Serve or a Cloudflare Tunnel
   protected by Access. Never publish CodexBar port `8080`.
3. Point `DISPLAY_URL` at that origin, for example
   `https://tokens.example.ts.net/api/display`.
4. Store only Wi-Fi credentials and that URL on the device.

The panel stays on and polls. It does not deep-sleep. A failed fetch keeps the
last accepted JSON and draws **STALE**. The first successful paint is the only
one that can show **OFFLINE**.

## Configure on the panel

Tap **Settings** on the dashboard.

1. Open **Wi-Fi**, then tap **Scan**. The list contains up to eight unique
   visible 2.4 GHz SSIDs with RSSI and security type.
2. Select a supported network. Open networks connect directly. Secured
   networks open a masked keyboard for an 8–63 character passphrase or a
   64-character hexadecimal key.
3. Wait for the status to progress through association and IP address setup.
   Credentials replace the previous saved credentials only after the device
   gets an IP address.
4. Open **Display API**, enter the full
   `https://host/api/display` URL, and tap **Test + save**. The firmware tests
   TLS, HTTP status, and the display JSON before it replaces the saved URL.

The 480×136 keyboard is attached to the LVGL root screen. The Back,
Connect, and Test + save controls stay above it. The keyboard Close key hides
the keyboard; tap the field to open it again.

The ESP32-S3 radio supports 2.4 GHz only. WEP, WPA-only, enterprise, and
unknown security modes are visible but disabled. Use open, WPA2-Personal,
WPA/WPA2 transition, WPA3-Personal, or WPA2/WPA3 transition security.

Wi-Fi credentials use the `wifi` Preferences namespace. The display URL uses
the `display` namespace. Preferences/NVS gives persistence, not protection
against a person who can read the device flash. **Forget** clears saved Wi-Fi
credentials and disables the compile-time Wi-Fi fallback.

## Build-time defaults and TLS

Build flags are fallback defaults for first boot. Do not commit real values.

| Symbol | Purpose | Default |
| --- | --- | --- |
| `WIFI_SSID` / `WIFI_PASSWORD` | Optional first-boot station credentials | empty |
| `DISPLAY_URL` | Full `https://…/api/display` URL | example host |
| `REFRESH_SECONDS` | Seconds between polls | `300` |
| `HTTP_TIMEOUT_MS` | Fetch timeout | `15000` |
| `SKIP_TLS_VERIFY` | Lab-only: skip TLS verify (`1`) | `0` |
| `DISPLAY_ROOT_CA` | PEM of the publisher CA | empty |

Verified HTTPS needs `DISPLAY_ROOT_CA`. An empty CA with verification left on
fails closed. `-DSKIP_TLS_VERIFY=1` is only for a self-signed lab host on a
private network. On-device URL changes do not change this policy: URLs must
use HTTPS, and the firmware never adds a per-URL bypass.

Example flags:

```text
-DWIFI_SSID=\"network\"
-DWIFI_PASSWORD=\"secret\"
-DDISPLAY_URL=\"https://tokens.example.ts.net/api/display\"
-DDISPLAY_ROOT_CA='"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"'
```

## Build and flash

From this directory, with [PlatformIO](https://platformio.org/):

```sh
pio test -e native
pio run -e jc4827w543c
pio run -e jc4827w543c -t upload
pio device monitor
```

If the upload cannot open the port, put the chip in ROM download mode:

1. Hold **BOOT**.
2. Press **RST**.
3. Release **RST**.
4. Release **BOOT**.
5. Run the upload again.

`ls /dev/cu.usb*` on macOS should show a new device after the cable is connected.
The cable must carry data. A charge-only cable enumerates nothing.

## What the first screen does

1. Turn on the backlight and init the 480×272 panel.
2. Draw **Token Pulse** before Wi-Fi starts, so a network failure still proves the panel.
3. Register GT911 for touch input.
4. Connect with saved Wi-Fi settings and `GET /api/display`.
5. Draw up to four providers, headline remaining percent, and today's tokens and cost.

Arduino_GFX initializes the panel and paints the boot screen. LVGL then owns
the dashboard, settings screens, network list, text fields, and keyboard.

## Physical-device checks

Use the repeatable [hardware validation procedure](HARDWARE_VALIDATION.md),
including the isolated `hardware-smoke` target and a firmware-specific test record.

After flashing, verify these items on the board:

- The dashboard and **Settings** button respond at the displayed coordinates.
- Scan stays responsive, the list scrolls, and it states the 2.4 GHz limit.
- Keyboard Close, field reopen, Back, Connect, and Test + save remain reachable.
- Wrong Wi-Fi details and a failed API test keep the previous saved values.
- Serial output reports stages and numeric/named disconnect reasons, but never
  the SSID, password, API URL, or response body.
- A saved network and tested API URL survive reset; **Forget** survives reset.
- Verified TLS fails closed without `DISPLAY_ROOT_CA`; lab-only insecure mode
  works only when the image was built with `SKIP_TLS_VERIFY=1`.

## Limits

Headline `remainingPercent` is the tightest window, already folded server-side.
Account rows and window lists are ignored. `topProject` is still `null` in the
feed, so this client does not invent a project line. The sketch does not store
`CODEXBAR_DASHBOARD_TOKEN` or any provider secret.
