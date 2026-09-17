# External Integrations

**Analysis Date:** 2026-09-17

## APIs & External Services

**Token-usage collector (only external integration):**

- CodexBar - sole data source; owns provider credentials, Token Pulse consumes JSON only (see `src/codexbar.ts`, `src/config.ts`, `README.md`, `docs/security-deployment.md`)
- SDK/Client: none, native `fetch` + `Bun.spawn` in `src/codexbar.ts` (see `src/codexbar.ts`)
- HTTP mode (`TOKEN_PULSE_SOURCE=http`): authenticated `GET /dashboard/v1/snapshot` (`Authorization: Bearer CODEXBAR_DASHBOARD_TOKEN`) for limits/status + unauthenticated loopback `GET /cost?provider=all` for history/projects in `src/codexbar.ts` (`HttpAdapter.collect()`) (see `src/codexbar.ts`, `src/config.ts`, `README.md`)
- CLI mode (`TOKEN_PULSE_SOURCE=cli`): `codexbar dashboard` + `codexbar cost --provider all --format json` via `Bun.spawn` in `src/codexbar.ts` (`CliAdapter`, `runJson()`), binary path from `CODEXBAR_BIN` (see `src/codexbar.ts`, `src/config.ts`, `README.md`)
- Demo mode (`TOKEN_PULSE_SOURCE=demo` default): synthetic `createDemoSnapshot()` in `src/codexbar.ts`, no network/subprocess (see `src/codexbar.ts`, `src/config.ts`, `scripts/seed.ts`)
- Auth: `CODEXBAR_DASHBOARD_TOKEN` (Bearer for `/dashboard/v1/snapshot` only), `CODEXBAR_URL` enforced loopback (`127.0.0.1`/`localhost`/`::1`) in `src/config.ts`, `CODEXBAR_BIN` for CLI (see `src/config.ts`, `src/codexbar.ts`, `.env.example`)
- Schema: expects `schemaVersion: 1`, `providers[]`, `generatedAt` + cost array with `provider`/`daily[]`/`projects[]` in `normalizeCodexBar()` in `src/codexbar.ts`; unknown token/cost fields preserved, no invented sessions/pricing (see `src/codexbar.ts`, `AGENTS.md`)
- Resilience: `Promise.allSettled` HTTP with degraded `limits-current/cost-unavailable` message; collection failures call `recordFailure()` and preserve last good snapshot in `src/codexbar.ts`, `src/index.tsx`, `src/storage.ts` (see `src/codexbar.ts`, `src/index.tsx`, `src/storage.ts`)

## Data Storage

**Databases:**

- SQLite (WAL mode, `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`) via `Database` from `bun:sqlite` in `src/storage.ts` (see `src/storage.ts`, `README.md`)
- Connection: `TOKEN_PULSE_DB` (default `./data/token-pulse.db`, `:memory:` in tests) via `new Storage(config.dbPath)` in `src/index.tsx` and `scripts/seed.ts` (see `src/config.ts`, `src/index.tsx`, `scripts/seed.ts`, `src/storage.ts`)
- Client: no ORM, raw `db.query()` + `db.transaction()` in `src/storage.ts` (see `src/storage.ts`)
- Tables in `src/storage.ts` `migrate()`: `snapshots(captured_at, source, degraded, message, payload_json)`, `daily_usage(provider, date, ...tokens, cost_usd, observed_at)` keyed `(provider, date)` with upsert-replace, `project_usage(provider, name, ...)` keyed `(provider, name)` (see `src/storage.ts`, `AGENTS.md`)

**File Storage:**

- Local filesystem only - `public/` brand/static assets served at `/favicon.ico`, `/apple-touch-icon.png`, `/icon-*.png`, `/site.webmanifest`, `/assets/app.css`, `/assets/logo.svg`, `/assets/favicon.svg` in `src/app.tsx`; SQLite file in `data/`; no S3/GCS (see `src/app.tsx`, `src/storage.ts`, `AGENTS.md`)

**Caching:**

- None - periodic poll (`setInterval(collect, snapshotSeconds*1000)` in `src/index.tsx`, default `300s` from `TOKEN_PULSE_SNAPSHOT_SECONDS` in `src/config.ts`) + HTMX `every 60s` refetch of `/partials/dashboard` in `src/app.tsx`; dashboard aggregates computed on-read in `Storage.dashboard()` in `src/storage.ts` (see `src/index.tsx`, `src/app.tsx`, `src/storage.ts`, `src/config.ts`)

## Authentication & Identity

**Auth Provider:**

- None for Token Pulse itself - no built-in user auth; remote access must expose only Token Pulse (`127.0.0.1:3000`) behind authenticated access, never tunnel CodexBar `:8080` (see `AGENTS.md`, `README.md`, `docs/security-deployment.md`)
- Implementation: CodexBar owns credentials; Token Pulse passes `CODEXBAR_DASHBOARD_TOKEN` as Bearer only to loopback `CODEXBAR_URL`, CLI mode passes/stores no credentials in `src/codexbar.ts` and `src/config.ts` (see `src/codexbar.ts`, `src/config.ts`, `README.md`)

## Monitoring & Observability

**Error Tracking:**

- None - `try/catch` in `collect()` in `src/index.tsx` writes `snapshots(degraded=1, payload_json=NULL)` via `recordFailure()` in `src/storage.ts` and surfaces `degraded`/`message` in `dashboard()` (see `src/index.tsx`, `src/storage.ts`)

**Logs:**

- `console.error(Token Pulse snapshot failed: ...)` on failure + `console.log(Token Pulse listening on ...)` on boot in `src/index.tsx` (see `src/index.tsx`)

## CI/CD & Deployment

**Hosting:**

- Self-hosted Bun process (`Bun.serve` in `src/index.tsx`, `bun dist/index.js` via `start` in `package.json`); binds `TOKEN_PULSE_HOST`/`TOKEN_PULSE_PORT` (see `src/index.tsx`, `src/config.ts`, `package.json`, `README.md`)
- Health/JSON: `GET /healthz`, `GET /api/dashboard`, `GET /partials/dashboard?sort=tokens|cost|recent`, `GET /` in `src/app.tsx` (see `src/app.tsx`, `README.md`)

**CI Pipeline:**

- None hosted - local `prek` hooks in `prek.toml` run `bun run lint`, `bun run typecheck`, `bun test` on every commit (see `prek.toml`)

## Environment Configuration

**Required env vars:**

- `TOKEN_PULSE_SOURCE` (`demo|http|cli`, default `demo`), `TOKEN_PULSE_DB` (`./data/token-pulse.db`), `TOKEN_PULSE_HOST` (`127.0.0.1`), `TOKEN_PULSE_PORT` (`3000`), `TOKEN_PULSE_SNAPSHOT_SECONDS` (`300`), `CODEXBAR_URL` (`http://127.0.0.1:8080` loopback-only in `http` mode), `CODEXBAR_DASHBOARD_TOKEN` (unset), `CODEXBAR_BIN` (`codexbar`) (see `.env.example`, `src/config.ts`, `README.md`)

**Secrets location:**

- Local `.env` / process env via `Bun.env` in `src/config.ts` (copied from `.env.example` per `README.md`); `CODEXBAR_DASHBOARD_TOKEN` never stored in SQLite (only passed as header in `src/codexbar.ts`), full snapshots archived as `payload_json` in `snapshots` table in `src/storage.ts` (see `.env.example`, `src/config.ts`, `src/codexbar.ts`, `src/storage.ts`, `README.md`)

## Webhooks & Callbacks

**Incoming:**

- None - only `GET` routes (`/`, `/partials/dashboard`, `/api/dashboard`, `/healthz`, static `/assets/*`, root brand files) in `src/app.tsx`; `notFound` returns JSON `404` (see `src/app.tsx`)

**Outgoing:**

- None persistent - outbound only as CodexBar polling per interval: `fetch(${CODEXBAR_URL}/dashboard/v1/snapshot)` + `fetch(${CODEXBAR_URL}/cost?provider=all)` or spawned `codexbar` CLI in `src/codexbar.ts`, scheduled by `setInterval` in `src/index.tsx` (see `src/codexbar.ts`, `src/index.tsx`)

---

_Integration audit: 2026-09-17_
