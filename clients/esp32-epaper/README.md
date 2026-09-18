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
2. Publish **only** Token Pulse through Tailscale Serve or a Cloudflare Tunnel
   protected by Access — never CodexBar port `8080`.
3. Point the device at that protected origin, for example:

   ```text
   https://tokens.example.ts.net/api/display
   ```

4. The response is display-safe JSON only. It does not include
   `CODEXBAR_DASHBOARD_TOKEN`, provider credentials, or SQLite paths.

Token Pulse has no built-in device authentication. Treat LAN exposure the same
as the Kindle path: private network or Access policy in front of the origin.

## Configure

Edit the top of `token_pulse_display.ino` (or set the same symbols as build
flags):

| Symbol | Purpose | Default |
| --- | --- | --- |
| `WIFI_SSID` / `WIFI_PASSWORD` | Station credentials | required |
| `DISPLAY_URL` | Full `https://…/api/display` URL | required |
| `REFRESH_SECONDS` | Deep-sleep interval between fetches | `600` (10 min) |
| `FULL_REFRESH_EVERY` | Full panel refresh every N wakes | `6` (~1 hour) |
| `HTTP_TIMEOUT_MS` | Fetch timeout | `15000` |
| `SKIP_TLS_VERIFY` | Lab-only: disable TLS cert checks (`1`) | `0` (verify) |
| `DISPLAY_ROOT_CA` | Optional PEM string for a pinned CA | empty (system roots) |

TLS verification is on by default so Tailscale Serve and Cloudflare origins
work with the board trust store. Set `-DSKIP_TLS_VERIFY=1` only for self-signed
lab endpoints on a private network — never pair that with a public origin.

Partial refresh reduces flicker and power after the first successful paint; a
periodic full refresh (and the first wake) clears ghosting. Fresh 2xx bodies are
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
  → every N wakes: full refresh; otherwise partial when the panel supports it
  → deep sleep REFRESH_SECONDS
```

Layout targets a typical 296×128 (2.9") panel:

- Title + updated timestamp
- One provider block (name, remaining %, reset time, optional status)
- Today tokens and estimated cost
- Top project line (`Not reported` while the feed has no project data)
- Stale/offline indicator in the corner when needed

Larger panels can show more provider/account rows; keep fonts large enough to
read at arm's length.

## Power

Deep sleep between updates is the main battery win. A 10-minute interval on a
healthy 2.9" mono panel is a practical default. Measure your own current draw
before promising multi-day runtime; Wi-Fi association and full refresh dominate
the energy budget.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| HTTP 404 / empty body | Token Pulse build includes `/api/display`; path is exact |
| TLS failures | Use a valid cert on the published host, or Tailscale HTTPS |
| Ghosting | Lower `FULL_REFRESH_EVERY` or force full refresh after failures |
| Flicker every wake | Confirm partial refresh path for your controller |
| Cleared screen after outage | Ensure failure path skips `displayClear` / full white update |
