# ESP32 e-paper client

Firmware sketch for a dedicated monochrome e-paper desk display that reads
Token Pulse `GET /api/display` and never talks to CodexBar.

## Recommended hardware

| Part | Notes |
| --- | --- |
| **ESP32-WROOM-32** or **ESP32-S3** dev board | 2.4 GHz Wi-Fi, deep sleep, enough RAM for a full frame buffer |
| **2.9" or 4.2" monochrome e-paper** (SSD1680 / UC8151 / IL0373 family) | Black/white only; avoid 3-color panels for fastest refresh |
| Common modules | Waveshare 2.9" V2, GoodDisplay GDEY029T94, LilyGo T5 4.7" (adjust driver) |

Wire the panel per the vendor pin map (SPI: SCK, MOSI, CS, DC, RST, BUSY). Keep
BUSY free of pull-ups that fight the controller. Power the panel from 3.3 V only.

## Network and trust boundary

1. Run Token Pulse on loopback (`127.0.0.1:3000`).
2. Use an HTTPS gateway reachable from a restricted device LAN. Allow only
   the display device/network to reach it. Proxy only `/api/display` to
   `http://127.0.0.1:3000` when the gateway runs on the Token Pulse host.
   Never forward CodexBar port `8080` or expose this gateway publicly.
3. Point the device at that gateway, for example:

   ```text
   https://tokens.internal.example/api/display
   ```

4. The response is display-safe JSON only. It does not include
   `CODEXBAR_DASHBOARD_TOKEN`, provider credentials, or SQLite paths.

Token Pulse has no built-in device authentication. The sketch does not run
Tailscale, complete browser logins, or send Cloudflare Access service tokens.
A Tailscale Serve URL or an Access login page is therefore not a direct device
endpoint. For a remote Token Pulse host, the gateway must join the tailnet and
proxy to its Serve URL; restrict that gateway's tailnet access to Token Pulse.
The ESP32 connects only to the gateway's LAN HTTPS address. Configure the
gateway certificate, DNS and network access rules before flashing. A CA
certificate verifies the server; it does not authenticate the device.

## Configure

Edit the top of `token_pulse_display.ino` (or set the same symbols as build
flags):

| Symbol | Purpose | Default |
| --- | --- | --- |
| `WIFI_SSID` / `WIFI_PASSWORD` | Station credentials | required |
| `DISPLAY_URL` | Full `https://…/api/display` URL | required |
| `REFRESH_SECONDS` | Deep-sleep interval between fetches | `600` (10 min) |
| `PANEL_RETAINS_RAM` | Opt in to partial refresh after confirming controller RAM survives processor sleep | `0` (full refresh only) |
| `FULL_REFRESH_EVERY` | Full refresh every N wakes when partial refresh is enabled; must be at least 1 | `6` (~1 hour) |
| `HTTP_TIMEOUT_MS` | Fetch timeout | `15000` |
| `SKIP_TLS_VERIFY` | Lab-only: disable TLS cert checks (`1`) | `0` (verify) |
| `DISPLAY_ROOT_CA` | PEM string for the HTTPS CA (required unless skip) | empty |

HTTPS fetches verify certificates by default. Arduino-ESP32 `WiFiClientSecure`
needs explicit trust material, so set `DISPLAY_ROOT_CA` to the PEM of your
gateway CA (the CA that signs the device-facing HTTPS certificate). Example
build flag:

```text
-DDISPLAY_ROOT_CA='"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n"'
```

Set `-DSKIP_TLS_VERIFY=1` only for self-signed lab endpoints on a private
network — never pair that with a public origin. An empty `DISPLAY_ROOT_CA` with
verification enabled fails closed (no fetch) rather than falling back to
insecure mode.

Full refresh is the safe default. Set `PANEL_RETAINS_RAM=1` only after checking
that the panel controller remains powered and retains both image buffers across
ESP32 timer sleep, including the reset pulse on wake. A visible e-paper image
alone does not prove RAM retention. With this opt-in, timer wakes after a valid
frame use partial refresh; cold boots, other wake causes and every Nth wake use
full refresh. Keep the default on boards that switch panel power or lose RAM.
The sketch uses `powerOff()` for panel drive voltages, not controller hibernation.
Fresh 2xx bodies are
JSON-validated before they replace the last good frame. Keep that frame when the
fetch or parse fails and draw a small **STALE** / **OFFLINE** badge instead of
clearing the screen.

## Build

1. Install [Arduino IDE](https://www.arduino.cc/en/software) 2.x or PlatformIO.
2. Add the Espressif ESP32 board package.
3. Install libraries matching your panel (examples):
   - [GxEPD2](https://github.com/ZinggJM/GxEPD2)
   - Adafruit GFX
   - [ArduinoJson](https://arduinojson.org/) (v6 or v7)
4. Select your board and port, set Wi-Fi + `DISPLAY_URL`, then upload
   `token_pulse_display.ino`.

PlatformIO users can point `src_dir` at this folder and depend on
`zinggJM/GxEPD2`, `adafruit/Adafruit GFX Library`, and `bblanchon/ArduinoJson`.

## Runtime behaviour

```text
boot / wake
  → connect Wi-Fi
  → GET /api/display
  → on success: parse JSON, render monochrome layout, clear stale flag
  → on failure: keep last frame, draw STALE/OFFLINE
  → full refresh by default; verified retained panels can opt in to partial
  → deep sleep REFRESH_SECONDS
```

Layout targets a typical 296×128 (2.9") panel:

- Title + updated timestamp
- One provider block (name and remaining %; reset/status only on taller panels)
- Today tokens and estimated cost
- Top project line (`n/a` while the feed has no project data)
- Stale/offline indicator in the corner when needed

Long text is clipped horizontally rather than wrapping over the next row.
The detailed message is omitted when it would overlap the project line; the
STALE/DEGRADED badge still shows status. Larger panels can show more rows.

## Power

Deep sleep between updates is the main battery win. A 10-minute interval on a
healthy 2.9" mono panel is a practical default. Measure your own current draw
before promising multi-day runtime; Wi-Fi association and full refresh dominate
the energy budget.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| HTTP 404 / empty body | Token Pulse build includes `/api/display`; path is exact |
| TLS failures | Install the gateway CA and check the device-facing hostname |
| Ghosting | Lower `FULL_REFRESH_EVERY` or force full refresh after failures |
| Flicker every wake | Full refresh is the default; verify RAM retention before enabling partial updates |
| Cleared screen after outage | Ensure failure path skips `displayClear` / full white update |
