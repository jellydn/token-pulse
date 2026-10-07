# Architecture

## Components

```text
Provider sessions and local logs
              │
              ▼
  codexbar serve (loopback)     or     codexbar CLI
              │                           │
              └─────────────┬─────────────┘
                            ▼
                    CodexBar adapter
                limits + cost normalization
                            │
                            ▼
                  SQLite durable history
                            │
                            ▼
                  Hono JSX + HTMX routes
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
       Browser dashboard  /kindle   /api/display
                                         │
                                         ▼
                                   ESP32 e-paper
```

Token Pulse is one Bun process. Hono renders HTML on the server. HTMX replaces the main dashboard fragment every 60 seconds. The dedicated Kindle page uses a tiny dependency-free XHR helper to replace its fragment every 10 minutes and avoid full-page reloads. Tailwind produces one static CSS file for the main dashboard; the e-ink route uses a separate minimal monochrome stylesheet for older browser compatibility. `GET /api/display` maps `DashboardData` through `toDisplayModel()` in `src/display.ts` into a compact JSON document for headless clients such as the ESP32 sketch under `clients/esp32-epaper/`.

## Collection and storage

The scheduler collects every 300 seconds by default. The adapter has two implementations:

- `http`: reads CodexBar dashboard schema version 1 and `/cost` from loopback.
- `cli`: executes the equivalent CodexBar commands.

Each successful collection stores the full normalized snapshot. Daily provider rows use `(provider, date)` as their key because CodexBar reports cumulative daily values; replacement prevents five-minute polls from counting the same tokens more than once. Project rows retain the latest provider report. Raw normalized snapshots remain available for historical diagnosis.

Collection failures are stored as degraded events without deleting the last good snapshot. The UI continues to show the last good values and displays the failure.

## Aggregate definitions

- **Today:** current UTC calendar day.
- **7 days:** today plus the prior six UTC days.
- **30 days:** today plus the prior 29 UTC days.
- **Change:** current 7/30-day tokens versus the preceding equal-length period.
- **Cache:** cache-read plus cache-creation tokens.
- **Estimated cost:** CodexBar's `totalCost`; Token Pulse does not apply a second pricing model.
- **Subscription cost:** optional monthly values from `TOKEN_PULSE_SUBSCRIPTIONS`; these are displayed separately and are not added to usage cost.

SQLite runs in WAL mode. The database and provider credentials must not be placed in a public web root or committed to source control.

## Route contract

| Route | Purpose |
| --- | --- |
| `GET /` | Complete server-rendered dashboard |
| `GET /partials/dashboard` | HTMX dashboard fragment |
| `GET /kindle` | Complete Kindle/e-ink dashboard |
| `GET /partials/kindle` | Server-rendered Kindle refresh fragment |
| `GET /api/dashboard` | Normalized dashboard JSON |
| `GET /api/display` | Compact display-safe JSON for e-ink / ESP32 clients |
| `GET /healthz` | Process health |

## Display model

Kindle HTML and the ESP32 client share one normalized view of usage:

- Built only from `storage.dashboard()` — never from live CodexBar credentials or env.
- Includes `updatedAt`, `degraded`, `message`, provider headline remaining percent and reset time, optional masked accounts/windows, today's token count and estimated cost (`today.cost`, from dashboard `costUsd`), and `topProject`.
- Omits burn history, subscription configuration, adapter source mode, and raw snapshot blobs.
- `topProject` is always `null` while the live CodexBar feed has no project aggregation; clients must not invent a project name.
- Account labels are masked at CodexBar ingestion (emails → `d***@example.com`); non-email labels pass through unchanged per project policy.
- Timestamps stay ISO-8601 UTC, matching the rest of Token Pulse.
