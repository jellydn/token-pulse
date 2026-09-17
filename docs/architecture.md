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
                            ▼
                     Browser dashboard
```

Token Pulse is one Bun process. Hono renders HTML on the server. HTMX replaces the dashboard fragment every 60 seconds and when project sorting changes. Tailwind produces one static CSS file during the build.

## Collection and storage

The scheduler collects every 300 seconds by default. The adapter has three implementations:

- `http`: reads CodexBar dashboard schema version 1 and `/cost` from loopback.
- `cli`: executes the equivalent CodexBar commands.
- `demo`: produces representative deterministic history without credentials.

Each successful collection stores the full normalized snapshot. Daily provider rows use `(provider, date)` as their key because CodexBar reports cumulative daily values; replacement prevents five-minute polls from counting the same tokens more than once. Project rows retain the latest provider report. Raw normalized snapshots remain available for historical diagnosis.

Collection failures are stored as degraded events without deleting the last good snapshot. The UI continues to show the last good values and displays the failure.

## Aggregate definitions

- **Today:** current UTC calendar day.
- **7 days:** today plus the prior six UTC days.
- **30 days:** today plus the prior 29 UTC days.
- **Change:** current 7/30-day tokens versus the preceding equal-length period.
- **Cache:** cache-read plus cache-creation tokens.
- **Estimated cost:** CodexBar's `totalCost`; Token Pulse does not apply a second pricing model.

SQLite runs in WAL mode. The database and provider credentials must not be placed in a public web root or committed to source control.

## Route contract

| Route | Purpose |
| --- | --- |
| `GET /` | Complete server-rendered dashboard |
| `GET /partials/dashboard` | HTMX dashboard fragment; accepts `sort=tokens|cost|recent` |
| `GET /api/dashboard` | Normalized dashboard JSON |
| `GET /healthz` | Process health |
