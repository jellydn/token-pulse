# Token Pulse 👋

[![GitHub license](https://img.shields.io/github/license/jellydn/token-pulse)](https://github.com/jellydn/token-pulse/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/jellydn/token-pulse)](https://github.com/jellydn/token-pulse/stargazers)

A local-first token usage dashboard for [CodexBar](https://github.com/steipete/CodexBar). One Bun server, server-rendered UI, no frontend build runtime.

## Introduction

Token Pulse reads CodexBar output and turns it into a dashboard you can glance at: provider status, session/weekly limits with reset countdowns, token usage and estimated cost across today / 7-day / 30-day windows, daily burn charts, and per-project attribution. History is stored durably in local SQLite, so your usage trends survive restarts.

It ships with a `demo` source, so you can see the full dashboard in under a minute without any credentials.

## Features

- 📊 Provider status, session/weekly limits, remaining percentage, and reset countdowns
- 📈 Today, 7-day, and 30-day tokens and estimated cost with prior-period comparison
- 🧩 Input, output, cache, and reasoning-token breakdowns
- 🔥 Daily token and cost burn charts
- 🗂️ Project attribution with token, cost, activity, and sorting
- 💾 Durable local snapshots and normalized daily history in SQLite
- 🔄 Five-minute collection by default with HTMX dashboard refresh every 60 seconds
- 📱 Responsive phone and desktop layouts, plus useful demo, empty, and degraded states

## Tech Stack

| Technology                               | Purpose                                                    |
| ---------------------------------------- | ---------------------------------------------------------- |
| [Bun](https://bun.sh/)                   | Runtime, server, and SQLite driver                         |
| [Hono](https://hono.dev/)                | HTTP routing and JSX server rendering                      |
| [HTMX](https://htmx.org/)                | Dashboard auto-refresh and sorting without a client bundle |
| [Tailwind CSS](https://tailwindcss.com/) | Styling (compiled to one static CSS file)                  |
| SQLite (WAL mode)                        | Durable snapshots and daily history                        |

## Prerequisites

- [Bun](https://bun.sh/) 1.2 or newer

## Quick Start

```sh
bun install
cp .env.example .env
bun run build
bun run start
```

The default `demo` source seeds representative data at startup. Open `http://127.0.0.1:3000`.

To seed the configured database without starting the service:

```sh
bun run seed
```

For development, run `bun run build:css` once and then `bun run dev`. Re-run the CSS build after changing Tailwind classes or the stylesheet — the hot-reload dev server does not rebuild CSS.

## Connect CodexBar

CodexBar remains the collector and owns all provider credentials. Token Pulse reads only its JSON output.

### Local HTTP mode (recommended)

Create a random dashboard token and run CodexBar on loopback only:

```sh
export CODEXBAR_DASHBOARD_TOKEN="$(openssl rand -hex 32)"
codexbar serve \
  --host 127.0.0.1 \
  --port 8080 \
  --refresh-interval 60 \
  --identity redacted
```

Use the same token in Token Pulse:

```sh
TOKEN_PULSE_SOURCE=http \
CODEXBAR_URL=http://127.0.0.1:8080 \
CODEXBAR_DASHBOARD_TOKEN="$CODEXBAR_DASHBOARD_TOKEN" \
bun run start
```

Token Pulse rejects non-loopback `CODEXBAR_URL` values. It calls authenticated `GET /dashboard/v1/snapshot` for limits/status and loopback `GET /cost?provider=all` for history and project attribution.

> **Do not tunnel port 8080.** Binding CodexBar to `127.0.0.1` blocks direct LAN and public connections, but Tailscale Serve, Cloudflare Tunnel, or another local proxy can still publish that loopback service. `--identity redacted` reduces identity detail; it is not authentication or access control. Expose only Token Pulse on port 3000 through Tailscale authentication or Cloudflare Tunnel + Access. See [Security and deployment](docs/security-deployment.md#why-codexbar-must-remain-internal) for safe and unsafe examples.

### CLI mode

```sh
TOKEN_PULSE_SOURCE=cli CODEXBAR_BIN=/usr/local/bin/codexbar bun run start
```

CLI mode executes `codexbar dashboard` and `codexbar cost --provider all --format json` every collection interval. It does not pass, discover, or store provider credentials.

## Configuration

| Variable                       | Default                 | Purpose                         |
| ------------------------------ | ----------------------- | ------------------------------- |
| `TOKEN_PULSE_SOURCE`           | `demo`                  | `demo`, `http`, or `cli`        |
| `TOKEN_PULSE_DB`               | `./data/token-pulse.db` | SQLite file path                |
| `TOKEN_PULSE_HOST`             | `127.0.0.1`             | Dashboard bind address          |
| `TOKEN_PULSE_PORT`             | `3000`                  | Dashboard port                  |
| `TOKEN_PULSE_SNAPSHOT_SECONDS` | `300`                   | Collection interval             |
| `CODEXBAR_URL`                 | `http://127.0.0.1:8080` | Loopback CodexBar endpoint      |
| `CODEXBAR_DASHBOARD_TOKEN`     | unset                   | CodexBar dashboard bearer token |
| `CODEXBAR_BIN`                 | `codexbar`              | CLI executable path             |

CodexBar project data is currently available for providers that report `projects[]`, notably Codex. CodexBar cost JSON does not expose session counts, so Token Pulse shows an em dash instead of inventing a value. Unknown costs and token fields remain unknown at ingestion.

## Routes

| Route                     | Purpose                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `GET /`                   | Complete server-rendered dashboard                           |
| `GET /partials/dashboard` | HTMX dashboard fragment; accepts `sort=tokens\|cost\|recent` |
| `GET /api/dashboard`      | Normalized dashboard JSON                                    |
| `GET /healthz`            | Process health                                               |

See [architecture](docs/architecture.md) and [security and deployment](docs/security-deployment.md) for operating details.

## Development

```sh
bun run format
bun run lint
bun run typecheck
bun test
bun run build
```

Run a single test file with `bun test tests/storage.test.ts`. Tests use in-memory SQLite; manual experiments should point `TOKEN_PULSE_DB` at a separate path.

## Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/jellydn/token-pulse/issues).

## Show your support

Give a ⭐️ if this project helped you!

## License

Copyright © 2026 [Dung Duc Huynh](https://github.com/jellydn).<br />
This project is [MIT](https://github.com/jellydn/token-pulse/blob/main/LICENSE) licensed.

## Author

👤 **Dung Duc Huynh**

- Website / Blog: [https://blog.productsway.com](https://blog.productsway.com)
- Twitter: [@jellydn](https://twitter.com/jellydn)
- Github: [@jellydn](https://github.com/jellydn)
