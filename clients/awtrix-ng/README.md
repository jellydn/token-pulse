# AWTRIX NG client

Berry app that shows Token Pulse usage on an
[AWTRIX NG](https://github.com/Blueforcer/awtrix-ng) LED-matrix clock.
It polls the same Token Pulse `GET /api/display` endpoint as the
[ESP32 e-paper client](../esp32-epaper/) and never talks to CodexBar.

```text
CodexBar → Token Pulse → GET /api/display → AWTRIX NG (this app)
                         ↘ GET /kindle (HTML)
                         ↘ ESP32 e-paper
```

## What it shows

One page per provider plus optional extra pages, stepped through with the
panel's normal rotation (`on_hide` advances the page):

- `Codex 41%` — provider name plus headline remaining percent, with a
  bottom-row progress bar (green ≥ 25%, amber ≥ 10%, red below)
- `T 1.2K $0.03` — today's tokens and estimated cost (toggle with **Show today**)
- `<project> 5.8M` — top project, once the feed reports project aggregation
  (currently always absent, so no page is added)

A leading `~` and a dimmed grey bar mean the last fetch failed and the numbers
are last-known-good. `!` prefix means Token Pulse reported `degraded: true`.
`...` means no fetch has succeeded yet.

## Install

1. Flash AWTRIX NG and join it to the same LAN as Token Pulse
   ([flashing guide](https://blueforcer.github.io/awtrix-ng/getting-started/flashing/)).
   No hardware yet? Iterate with the simulator instead:
   `pio run -e native_sim` in the AWTRIX NG checkout.
2. Open the AWTRIX web UI → **Scripts** tab, paste
   [`token_pulse.be`](token_pulse.be) under a fresh script name
   (for example `TokenPulse`), and save.
3. On the app's row, open **⚙ Settings** and set:
   - **Display URL** — full LAN URL of Token Pulse, e.g.
     `http://192.168.1.2:3000/api/display`
   - **Refresh** — minutes between fetches (default `5`)
   - **Show today** — whether to add the today page (default on)
4. Saving restarts the app; the first fetch lands within a few seconds.

## How it works

- `loop()` fires one `http.get()` per refresh interval (default 5 min),
  guarded by `in_flight` so a slow network cannot stack requests against the
  eight-in-flight cap. `draw()` only paints the cached `self.pages`.
- The response is parsed with `json.load()` — the `/api/display` payload is a
  few hundred bytes, so no `find`/`keep` window is needed. Only `name`,
  `remainingPercent`, `today.tokens`, `today.cost`, and `topProject`
  are read; account/window detail is ignored (headline percent already
  folds multi-account providers down to the tightest window server-side).
- Good responses replace the cached pages and persist them with `store.set()`,
  so a reboot shows last-known values instantly. Failures (`body == nil`,
  garbage, or zero usable pages) keep the previous pages and set the stale
  flag — the panel never blanks.
- `select` forces a refresh on the next `loop()` tick. Left/right keep their
  normal rotation behaviour.

## Trust boundary

- The app fetches only the Token Pulse display URL you configure. It sends no
  credentials: `/api/display` carries no `CODEXBAR_DASHBOARD_TOKEN`, provider
  secrets, or SQLite paths by construction.
- Script source is stored in plain text on AWTRIX and readable over its HTTP
  API when AWTRIX authentication is off — so keep secrets out of the script.
  This app needs none: the display URL is a LAN address, not a credential.
- Point the URL at Token Pulse on your LAN (or a Tailscale/Cloudflare-Access
  origin). Never point AWTRIX at CodexBar port `8080` directly.

## Limits

AWTRIX NG is a 32×8 (or wider) LED matrix, not e-paper: there is no partial
refresh, no ghosting cadence, and no deep sleep — the panel stays powered and
this app simply takes its turn in the rotation. It is an alternative client for
the shared display model, alongside `/kindle` and the e-paper sketch.
