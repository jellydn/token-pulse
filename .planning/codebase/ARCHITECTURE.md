# Architecture

**Analysis Date:** 2026-09-17

## Pattern Overview

**Overall:** Server-rendered monolith — single Bun process with layered collection → storage → presentation, no client bundle

**Key Characteristics:**

- One Bun process in `src/index.tsx` owns scheduling, storage, and HTTP serving via `Bun.serve`
- Server-rendered Hono JSX in `src/app.tsx` + `src/ui.tsx`; HTMX swaps the `#dashboard` fragment every 60s, no hydration step
- Pluggable ingestion behind the `CodexBarAdapter` interface in `src/codexbar.ts` with `demo` / `http` / `cli` modes selected by `src/config.ts`
- Durable local state only in SQLite via `src/storage.ts` (`bun:sqlite`, WAL mode); UTC-calendar-day aggregates with upsert semantics

## Layers

**Process / Entrypoint:**

- Purpose: Wires config, storage, adapter, scheduler, and HTTP server; owns shutdown
- Location: `src/index.tsx`
- Contains: `collect()` loop, `setInterval` scheduler, `Bun.serve`, `SIGINT`/`SIGTERM` handlers
- Depends on: `src/app.tsx`, `src/codexbar.ts`, `src/config.ts`, `src/storage.ts`
- Used by: Production runtime (`bun run start` → `dist/index.js` built from it by `package.json`)

**Configuration:**

- Purpose: Parses environment into a typed `Config`; enforces trust-boundary guards
- Location: `src/config.ts`
- Contains: `SourceMode`, `Config` interface, `loadConfig()`, loopback-host check for `CODEXBAR_URL`
- Depends on: `Bun.env`
- Used by: `src/index.tsx`, `src/codexbar.ts`, `scripts/seed.ts`

**Ingestion / Adapter:**

- Purpose: Normalizes external CodexBar JSON into `NormalizedSnapshot`; never handles credentials beyond a Bearer passthrough
- Location: `src/codexbar.ts`
- Contains: `CodexBarAdapter` interface, `HttpAdapter`, `CliAdapter`, demo snapshot factory, `normalizeCodexBar()` plus defensive `record()`/`array()`/`text()`/`number()` helpers
- Depends on: `src/config.ts`, `src/types.ts`
- Used by: `src/index.tsx`, `scripts/seed.ts`

**Persistence / Query:**

- Purpose: Durable history and dashboard aggregation; preserves last good snapshot on failure
- Location: `src/storage.ts`
- Contains: `Storage` class (`migrate()`, `save()`, `recordFailure()`, `dashboard()`, `close()`), `totalRows()`, `percentChange()`, UTC-day helpers
- Depends on: `bun:sqlite`, `node:fs`, `node:path`, `src/types.ts`
- Used by: `src/index.tsx`, `src/app.tsx`, `scripts/seed.ts`, `tests/storage.test.ts`, `tests/routes.test.tsx`

**HTTP / Routing:**

- Purpose: Testable app factory; serves static assets, JSON API, HTML pages, and HTMX partials
- Location: `src/app.tsx`
- Contains: `createApp(storage)`, `sortValue()`, routes `GET /`, `GET /partials/dashboard`, `GET /api/dashboard`, `GET /healthz`, static-asset routes, `notFound` handler
- Depends on: `src/storage.ts`, `src/ui.tsx`, `hono`, `hono/bun`
- Used by: `src/index.tsx`, `tests/routes.test.tsx`

**View:**

- Purpose: Pure server-side JSX components; formatting and presentation only, no data fetching
- Location: `src/ui.tsx`
- Contains: `Page`, `Dashboard`, `ProviderCard`, `MetricCard`, `BurnChart`, `Breakdown`, `Projects`, `SortLink`, `StatusDot`, `Intl` formatters, `duration()`/`relative()`/`change()` helpers
- Depends on: `src/types.ts`, `hono/jsx`
- Used by: `src/app.tsx`

**Domain Types:**

- Purpose: Shared contracts between ingestion, storage, and view layers
- Location: `src/types.ts`
- Contains: `NormalizedSnapshot`, `ProviderState`, `LimitWindow`, `DailyUsage`, `ProjectUsage`, `UsageTotals`, `DashboardData`, `StatusLevel`
- Depends on: Nothing
- Used by: `src/codexbar.ts`, `src/storage.ts`, `src/ui.tsx`, `tests/fixtures.ts`

**Styling:**

- Purpose: Tailwind v4 source compiled to a single static CSS file
- Location: `src/styles.css`
- Contains: `@import "tailwindcss"`, `@theme` fonts, `.panel` and `.metric-label` component classes
- Depends on: `tailwindcss`
- Used by: Build script `build:css` in `package.json` → output `public/app.css`

**Seed script:**

- Purpose: Writes deterministic demo data to the configured database regardless of source mode
- Location: `scripts/seed.ts`
- Contains: `createDemoSnapshot()` + `Storage.save()` invocation
- Depends on: `src/codexbar.ts`, `src/config.ts`, `src/storage.ts`
- Used by: `bun run seed` in `package.json`

## Data Flow

**Scheduled collection:**

1. `src/index.tsx` calls `collect()` once at boot, then every `config.snapshotSeconds` (default 300s)
2. `src/codexbar.ts` adapter fetches CodexBar dashboard + cost JSON (`HttpAdapter`), spawns CLI commands (`CliAdapter`), or synthesizes data (demo mode), then `normalizeCodexBar()` emits a `NormalizedSnapshot`
3. `src/storage.ts` `save()` writes one `snapshots` row plus upserts into `daily_usage` keyed `(provider, date)` and `project_usage` keyed `(provider, name)` inside a single transaction

**Full-page dashboard render:**

1. Browser requests `GET /` on `src/app.tsx`
2. `Storage.dashboard(sort)` aggregates `daily_usage` over UTC windows and reads latest providers/projects
3. `src/ui.tsx` `Page` + `Dashboard` render complete HTML; HTMX attributes on `#dashboard` schedule fragment refresh

**HTMX partial refresh / sort change:**

1. HTMX polls `GET /partials/dashboard?sort=tokens|cost|recent` every 60s, or `SortLink` clicks re-target `#dashboard` with `hx-push-url`
2. `src/app.tsx` re-queries `Storage.dashboard(sort)` with validated sort order
3. `src/ui.tsx` `Dashboard` fragment replaces `#dashboard` innerHTML; no full reload

**API / health:**

1. `GET /api/dashboard` in `src/app.tsx` returns `Storage.dashboard(sort)` as JSON
2. `GET /healthz` in `src/app.tsx` returns `{ status: "ok" }` without touching storage

**Failure / degraded path:**

1. `collect()` in `src/index.tsx` catches adapter errors and calls `Storage.recordFailure()`, which inserts a degraded `snapshots` row with `payload_json = NULL`
2. `Storage.dashboard()` in `src/storage.ts` still serves the latest successful snapshot while surfacing the newest event's `degraded` flag and `message`
3. `src/ui.tsx` `Dashboard` renders the last good values plus an amber status banner

**State Management:**

- Sole durable state is SQLite at `config.dbPath` (default `./data/token-pulse.db`); `snapshots`, `daily_usage`, `project_usage` tables created in `src/storage.ts` `migrate()`
- CodexBar daily values are cumulative, so `save()` uses `ON CONFLICT ... DO UPDATE` replacement, not summation
- No in-process cache or session state; every request re-aggregates from SQLite over UTC calendar days (today / 7-day / 30-day windows defined in `docs/architecture.md`)
- Unknown token/cost fields are preserved at ingestion in `src/codexbar.ts`; no invented session counts, no second pricing model

## Key Abstractions

**NormalizedSnapshot:**

- Purpose: Stable internal contract decoupling CodexBar's external JSON from storage and UI
- Examples: `src/types.ts`, `src/codexbar.ts`, `src/storage.ts`
- Pattern: Normalizer — defensive coercion (`record`/`array`/`text`/`number`) plus schema-version gate (`schemaVersion !== 1` throws)

**CodexBarAdapter:**

- Purpose: Strategy interface so `demo` / `http` / `cli` modes are interchangeable
- Examples: `src/codexbar.ts`
- Pattern: Strategy + factory (`createCodexBarAdapter(config)`); `HttpAdapter` uses `Promise.allSettled` so cost-endpoint failure degrades instead of failing; `CliAdapter` shells via `Bun.spawn`

**Storage:**

- Purpose: Repository + aggregate-root for all dashboard reads
- Examples: `src/storage.ts`
- Pattern: Transaction-script repository over `bun:sqlite`; raw SQL with `SUM ... GROUP BY date`, gap-filled `history7`/`history30` series, whitelisted `ORDER BY` for project sort

**createApp:**

- Purpose: Pure app factory enabling route tests without booting the process entrypoint
- Examples: `src/app.tsx`, `tests/routes.test.tsx`
- Pattern: Dependency injection — caller passes an already-opened `Storage` (tests use `new Storage(":memory:")`)

**DashboardData:**

- Purpose: Read model shaped exactly for rendering and the JSON API
- Examples: `src/types.ts`, `src/storage.ts`, `src/ui.tsx`
- Pattern: DTO — `today`/`week`/`month` totals, `weekChange`/`monthChange`, `history7`/`history30`, `providers`, `projects`, `degraded`/`message`

## Entry Points

**Production process:**

- Location: `src/index.tsx`
- Triggers: `bun run dev` (`bun --hot src/index.tsx`), `bun run build` output `dist/index.js`, `bun run start` (`bun dist/index.js`)
- Responsibilities: Loads config, opens storage, collects once before serving, schedules polling, serves Hono app, handles shutdown

**Seed:**

- Location: `scripts/seed.ts`
- Triggers: `bun run seed`
- Responsibilities: Writes `createDemoSnapshot()` to the configured DB via `loadConfig().dbPath`

**Test entry:**

- Location: `tests/routes.test.tsx`, `tests/storage.test.ts`, `tests/codexbar.test.ts`
- Triggers: `bun test` / `bun run test` in `package.json`
- Responsibilities: Exercise `createApp(storage).request()` and `Storage` against `:memory:` databases using `tests/fixtures.ts`

**CSS build:**

- Location: `src/styles.css` → `public/app.css`
- Triggers: `bun run build:css` (must run before `bun run dev`; `bun run build` chains it before `bun build`)
- Responsibilities: Compiles Tailwind v4 into the single stylesheet served at `/assets/app.css`

## Error Handling

**Strategy:** Preserve last good snapshot; degrade visibly rather than blanking the dashboard

**Patterns:**

- Scheduler catch-and-record in `src/index.tsx`: adapter throw → `Storage.recordFailure()` + `console.error`, timer continues
- Partial-failure tolerance in `src/codexbar.ts` `HttpAdapter`: dashboard fetch is required, cost fetch is best-effort via `Promise.allSettled` with a `degraded` message
- Strict schema gate in `src/codexbar.ts` `normalizeCodexBar()`: non-v1 `schemaVersion` throws, surfacing as a degraded event
- Startup guards in `src/config.ts`: invalid `TOKEN_PULSE_SOURCE` throws; non-loopback `CODEXBAR_URL` in `http` mode throws
- Safe query construction in `src/storage.ts` `dashboard()`: sort param mapped through `sortValue()` in `src/app.tsx` to a three-branch `ORDER BY` whitelist
- JSON 404 fallback in `src/app.tsx` `notFound` handler

## Cross-Cutting Concerns

**Logging:** Minimal `console.log` on listen and `console.error` on snapshot failure, both in `src/index.tsx`; no structured logger

**Validation:** Defensive unknown-JSON coercion in `src/codexbar.ts` (`record`/`array`/`text`/`number` returning `null`/`[]`/`{}`); sort-param whitelist in `src/app.tsx`; integer parsing with fallbacks in `src/config.ts`

**Authentication:** None built in — Token Pulse has no login (see `docs/security-deployment.md`); trust boundary is loopback-only `CODEXBAR_URL` enforcement in `src/config.ts` plus optional `CODEXBAR_DASHBOARD_TOKEN` Bearer header in `src/codexbar.ts`; remote access must expose only Token Pulse behind Tailscale ACLs or Cloudflare Access, never CodexBar port 8080

---

_Architecture analysis: 2026-09-17_
