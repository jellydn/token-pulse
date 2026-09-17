# Token Pulse

A local-first token usage dashboard for [CodexBar](https://github.com/steipete/CodexBar). Token Pulse uses Bun, Hono JSX, HTMX, Tailwind CSS, and SQLite. It has one server and no frontend build runtime.

## MVP features

- Provider status, session/weekly limits, remaining percentage, and reset countdowns
- Today, 7-day, and 30-day tokens and estimated cost with prior-period comparison
- Input, output, cache, and reasoning-token breakdowns
- Daily token and cost burn charts
- Project attribution with token, cost, session availability, activity, and sorting
- Durable local snapshots and normalized daily history in SQLite
- Useful demo, empty, and degraded states; responsive phone and desktop layouts
- Five-minute collection by default and HTMX dashboard refresh every 60 seconds

## Quick start

Requires [Bun](https://bun.sh/) 1.2 or newer.

```sh
bun install
cp .env.example .env
bun run build
bun run start
```

The default `demo` source seeds representative data at startup. Open `http://127.0.0.1:3000`. To seed the configured database without starting the service, run `bun run seed`.

For development, run `bun run build:css` once and then `bun run dev`.

## Connect CodexBar

CodexBar remains the collector and owns all provider credentials. Token Pulse reads only its JSON output.

### Local HTTP mode (recommended)

Create a random dashboard token and run CodexBar on loopback only:

```sh
export CODEXBAR_DASHBOARD_TOKEN="$(openssl rand -hex 32)"
codexbar serve --host 127.0.0.1 --port 8080
```

Use the same token in Token Pulse:

```sh
TOKEN_PULSE_SOURCE=http \
CODEXBAR_URL=http://127.0.0.1:8080 \
CODEXBAR_DASHBOARD_TOKEN="$CODEXBAR_DASHBOARD_TOKEN" \
bun run start
```

Token Pulse rejects non-loopback `CODEXBAR_URL` values. It calls authenticated `GET /dashboard/v1/snapshot` for limits/status and loopback `GET /cost?provider=all` for history and project attribution.

### CLI mode

```sh
TOKEN_PULSE_SOURCE=cli CODEXBAR_BIN=/usr/local/bin/codexbar bun run start
```

CLI mode executes `codexbar dashboard` and `codexbar cost --provider all --format json` every collection interval. It does not pass, discover, or store provider credentials.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `TOKEN_PULSE_SOURCE` | `demo` | `demo`, `http`, or `cli` |
| `TOKEN_PULSE_DB` | `./data/token-pulse.db` | SQLite file path |
| `TOKEN_PULSE_HOST` | `127.0.0.1` | Dashboard bind address |
| `TOKEN_PULSE_PORT` | `3000` | Dashboard port |
| `TOKEN_PULSE_SNAPSHOT_SECONDS` | `300` | Collection interval |
| `CODEXBAR_URL` | `http://127.0.0.1:8080` | Loopback CodexBar endpoint |
| `CODEXBAR_DASHBOARD_TOKEN` | unset | CodexBar dashboard bearer token |
| `CODEXBAR_BIN` | `codexbar` | CLI executable path |

CodexBar project data is currently available for providers that report `projects[]`, notably Codex. CodexBar cost JSON does not expose session counts, so Token Pulse shows an em dash instead of inventing a value. Unknown costs and token fields remain unknown at ingestion.

## Quality checks

```sh
bun run format
bun run lint
bun run typecheck
bun test
bun run build
```

See [architecture](docs/architecture.md) and [security and deployment](docs/security-deployment.md) for operating details.
