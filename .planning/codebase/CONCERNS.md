# Codebase Concerns

**Analysis Date:** 2026-09-17

> Method: read `src/config.ts` (47 lines), `src/codexbar.ts` (371 lines), `src/storage.ts` (256 lines), `src/index.tsx` (38 lines), `src/app.tsx` (58 lines), `src/ui.tsx` (470 lines), `src/types.ts` (80 lines), `scripts/seed.ts`, `tests/fixtures.ts`, `tests/codexbar.test.ts`, `tests/storage.test.ts`, `tests/routes.test.tsx`, `docs/architecture.md`, `docs/security-deployment.md`, `package.json`, `tsconfig.json`; grepped `src/` for `TODO|FIXME|HACK|XXX|TEMP` (zero matches), `console.|process.env|Bun.env|setInterval|JSON.parse`. No guessing: each finding cites the file and lines read. "Suspected" items are labeled as such.

## Tech Debt

**Positional SQL inserts without column lists:**

- Issue: `INSERT INTO daily_usage VALUES (...)` and `INSERT INTO project_usage VALUES (...)` rely on column order; any schema change silently misbinds values.
- Files: `src/storage.ts` (lines 130-137, 152-157)
- Impact: Future migrations corrupt data without a type error.
- Fix approach: Name columns explicitly in both `INSERT` statements.

**Unbounded `snapshots` table growth:**

- Issue: Every successful poll stores a full `payload_json` copy and every failure stores another row; there is no retention, pruning, or vacuum. At the default 300s cadence that is ~288 rows/day forever.
- Files: `src/storage.ts` (lines 117-129, 174-180), `src/index.tsx` (line 21)
- Impact: Database grows without bound; dashboard queries and backups get slower over months.
- Fix approach: Add a retention job (e.g. keep N days of `snapshots`, keep `daily_usage`/`project_usage` aggregates), or stop persisting full payloads on every poll.

**Largest file mixes presentation and logic:**

- Issue: `src/ui.tsx` (~470 lines) holds all formatting helpers (`duration`, `relative`, `change`), all cards, charts, tables, and the page shell with no unit tests for the helpers.
- Files: `src/ui.tsx`
- Impact: Small display changes risk breaking unrelated sections; edge cases untested.
- Fix approach: Extract `src/format.ts` for the helpers with unit tests; split `src/ui.tsx` into smaller components.

**Silent env-var fallback:**

- Issue: `integer()` in `src/config.ts` (lines 14-17) silently returns the default for any unparseable `TOKEN_PULSE_PORT` / `TOKEN_PULSE_SNAPSHOT_SECONDS` (including `0` or negative), with no warning.
- Files: `src/config.ts`
- Impact: Typos in ops config go unnoticed (e.g. `TOKEN_PULSE_SNAPSHOT_SECONDS=abc` polls every 5 min instead of failing fast).
- Fix approach: Log a warning or throw on present-but-invalid values; keep fallback only when unset.

**Relative static-asset paths:**

- Issue: `src/app.tsx` (lines 13-30) serves assets via relative paths (`./public/...`, `./node_modules/htmx.org/dist/htmx.min.js`), which resolve against the process CWD. Production runs `bun dist/index.js`, so starting from another directory or without `node_modules` present breaks assets/htmx.
- Files: `src/app.tsx`
- Impact: Fragile deploys; `dist/` alone is not complete (also noted in repo `AGENTS.md`).
- Fix approach: Resolve paths relative to the module file (`import.meta.dir`), and vendor `htmx.min.js` into `public/` instead of serving from `node_modules`.

**Startup always collects and writes:**

- Issue: `src/index.tsx` (line 20) runs `await collect()` before serving, and `scripts/seed.ts` always writes demo data to the configured DB regardless of source mode (documented behavior, but a footgun: pointing `TOKEN_PULSE_DB` at a production path while experimenting overwrites/mixes data).
- Files: `src/index.tsx`, `scripts/seed.ts`
- Impact: Slow first paint; accidental demo-data pollution of a live database.
- Fix approach: Document a `--no-collect`/`--dry-run` path and guard `seed` with a confirmation when the DB file already exists.

## Known Bugs

**Cost endpoint omits the dashboard token (verified):**

- Symptoms: With `CODEXBAR_DASHBOARD_TOKEN` set, the dashboard fetch sends `Authorization: Bearer ...` but the `/cost?provider=all` fetch sends no headers, so cost fails with 401 and the UI permanently shows "Limits are current, but cost usage is unavailable".
- Files: `src/codexbar.ts` (lines 179-187)
- Trigger: Set `TOKEN_PULSE_SOURCE=http` plus `CODEXBAR_DASHBOARD_TOKEN` against a token-protected CodexBar.
- Workaround: Run CodexBar without a dashboard token on loopback (reduces protection), or proxy that injects the token.

**Strict `schemaVersion !== 1` rejects all future schemas (verified):**

- Symptoms: Any CodexBar release bumping `schemaVersion` (even minor/additive) throws `Unsupported CodexBar dashboard schema` and records a failure, losing all data until Token Pulse is updated.
- Files: `src/codexbar.ts` (lines 124-128)
- Trigger: Point at a CodexBar returning `schemaVersion: 2`.
- Workaround: None; pin CodexBar version.

**Uncaught `JSON.parse` crashes dashboard and CLI paths (verified):**

- Symptoms: A corrupt `payload_json` row makes `src/storage.ts` (line 193-195) throw inside `dashboard()`, breaking `/`, `/partials/dashboard`, and `/api/dashboard` simultaneously. A non-JSON CLI stdout makes `runJson` in `src/codexbar.ts` (line 225) throw a bare `SyntaxError` with no command context.
- Files: `src/storage.ts`, `src/codexbar.ts`
- Trigger: Hand-edit the DB, disk corruption, or `codexbar` CLI printing a warning to stdout.
- Workaround: Delete the corrupt `snapshots` row manually.

**Invalid dates render as `NaN` text (verified by reading, untested):**

- Symptoms: `duration()` in `src/ui.tsx` (lines 20-28) does not check for `NaN`; an unparseable `resetAt` yields `Resets in NaNh NaNm`. `relative()` (lines 30-39) coerces `NaN` to `0` days and prints "Today" for garbage input.
- Files: `src/ui.tsx`
- Trigger: CodexBar returns a malformed `resetAt`/`lastActivityAt` string (pass-through `text()` fields in `src/codexbar.ts` accept any string).
- Workaround: None in-app.

**Unclamped percentages break bar rendering (verified by reading):**

- Symptoms: `usedPercent`/`remainingPercent` are used raw in `style="width:...%"` (`src/ui.tsx` lines 98-101) and `Math.max(1, remainingPercent)` passes `NaN` through; negative, >100, or inconsistent pairs overflow or collapse the bars.
- Files: `src/ui.tsx`, `src/codexbar.ts` (lines 58-72)
- Trigger: CodexBar reports a window with only one side set plus an inconsistent value, or out-of-range numbers.
- Workaround: None in-app.

**First collection blocks server startup (verified):**

- Symptoms: `await collect()` in `src/index.tsx` (line 20) runs before `Bun.serve`, and HTTP fetches have no timeout (`src/codexbar.ts` lines 184-187), so a hung CodexBar delays `/healthz` and all routes indefinitely.
- Files: `src/index.tsx`, `src/codexbar.ts`
- Trigger: Start Token Pulse while CodexBar is hung or slow.
- Workaround: Start CodexBar first and confirm it responds.

**Overlapping polls and shutdown race (verified by reading):**

- Symptoms: `setInterval(collect, ...)` in `src/index.tsx` (line 21) can start a second `collect()` while the first is still awaiting CodexBar; concurrent `storage.save()` transactions on one `bun:sqlite` connection can throw `SQLITE_BUSY`. `shutdown()` (lines 29-33) closes storage while a poll may still be in flight.
- Files: `src/index.tsx`
- Trigger: Set a short `TOKEN_PULSE_SNAPSHOT_SECONDS` with a slow CodexBar, or SIGTERM mid-poll.
- Workaround: Keep the default 300s interval.

## Security Considerations

**Loopback allowlist is narrow and HTTP-mode-only (verified):**

- Risk: `src/config.ts` (lines 28-35) checks `CODEXBAR_URL` hostname against exactly `["127.0.0.1", "localhost", "::1", "[::1]"]` and only when `source === "http"`. Loopback siblings such as `127.0.0.2`–`127.255.255.255`, `::ffff:127.0.0.1`, or the uncompressed `0:0:0:0:0:0:0:1` form are rejected (fail-closed, good) but there is no scheme check, no port allowlist, and DNS-rebinding-style hostnames that resolve to loopback (e.g. `*.nip.io`/`*.sslip.io`) are also rejected only by accident of the exact-match list rather than by resolving and verifying the address. The larger hole is operational, not parsing: the check does nothing to stop loopback forwarding (documented in `docs/security-deployment.md`).
- Files: `src/config.ts`, `docs/security-deployment.md`
- Current mitigation: Exact-match deny-by-default hostname check in HTTP mode; docs explicitly forbid tunneling port 8080.
- Recommendations: Resolve the hostname and verify the resolved IP is loopback; validate scheme is `http:`; keep the docs warning next to the config error.

**No built-in authentication on Token Pulse (verified, documented):**

- Risk: Anyone who can reach the port can read project paths, usage, and costs via `/` and `/api/dashboard`. `TOKEN_PULSE_HOST` defaults to `127.0.0.1` but can be set to `0.0.0.0` with no warning.
- Files: `src/app.tsx`, `src/config.ts` (line 40), `docs/security-deployment.md` (lines 68-73)
- Current mitigation: Loopback default bind; deployment docs requiring Tailscale/Cloudflare Access.
- Recommendations: Log a loud startup warning when bound to a non-loopback host; add optional bearer-token auth; add `X-Content-Type-Options`/`frame-ancestors`/CSP headers in `src/app.tsx`.

**Interpolated `ORDER BY` (verified safe today, fragile tomorrow):**

- Risk: `src/storage.ts` (lines 222-234) interpolates `order` into SQL. Today the value comes only from the whitelisted `sortValue()` in `src/app.tsx` (lines 6-8), so there is no injection; any future caller passing a raw string reopens it.
- Files: `src/storage.ts`, `src/app.tsx`
- Current mitigation: Whitelist at the route layer.
- Recommendations: Move the whitelist into `Storage.dashboard()` (map enum to SQL internally) so safety does not depend on callers.

**Sensitive data in API and logs (verified):**

- Risk: `/api/dashboard` exposes project filesystem paths and per-project tokens/costs with no auth (`src/app.tsx` lines 32-34). Failure messages embed raw collector errors into the dashboard banner (`src/storage.ts` lines 174-180, `src/ui.tsx` lines 356-363) and `console.error` (`src/index.tsx` line 16), which can leak paths or tokens if CodexBar echoes them.
- Files: `src/app.tsx`, `src/storage.ts`, `src/ui.tsx`, `src/codexbar.ts`
- Current mitigation: Hono JSX escaping of banner text; loopback default.
- Recommendations: Redact path-like segments option (docs already suggest `--identity redacted` for CodexBar); scrub tokens from error strings before storing/logging.

**Configurable CLI binary (verified, low risk):**

- Risk: `CODEXBAR_BIN` selects the executed binary (`src/config.ts` line 45, `src/codexbar.ts` lines 232-244). `Bun.spawn` with an argv array avoids shell injection, but a poisoned env var points execution at an arbitrary binary with the service user's privileges.
- Files: `src/config.ts`, `src/codexbar.ts`
- Current mitigation: No shell involved; env must already be trusted.
- Recommendations: Document `CODEXBAR_BIN` as privileged; optionally restrict to an absolute path.

## Performance Bottlenecks

**Full aggregate recompute per HTTP request:**

- Problem: Every `/`, `/partials/dashboard` (HTMX every 60s per client), and `/api/dashboard` call runs `Storage.dashboard()`: two snapshot lookups, a 60-day grouped aggregate, and a full `JSON.parse` of the latest payload (`src/storage.ts` lines 182-234).
- Files: `src/storage.ts`, `src/app.tsx`
- Cause: No caching or memoization of dashboard output between polls.
- Improvement path: Cache the rendered dashboard JSON keyed by latest snapshot id plus sort param; invalidate only on new snapshot/failure.

**Payload-heavy snapshot writes every poll:**

- Problem: Each poll serializes and stores the entire normalized snapshot as `payload_json`, even when nothing changed.
- Files: `src/storage.ts` (lines 117-129), `src/index.tsx` (line 21)
- Cause: No change detection or retention policy.
- Improvement path: Skip the `snapshots` insert (or store a hash) when providers/daily/projects are identical; add retention.

**Unbounded history scan window:**

- Problem: `dashboard()` always scans 60 days of `daily_usage` (`src/storage.ts` lines 196-202) with `SUM()` per day; fine now, linearly slower as providers/days accumulate.
- Files: `src/storage.ts`
- Cause: Fixed 60-day window with no rollup table.
- Improvement path: Keep as-is until slow; then add weekly/monthly rollup or limit the scan to requested ranges.

## Fragile Areas

**CodexBar normalization (`src/codexbar.ts`):**

- Files: `src/codexbar.ts` (lines 34-165)
- Why fragile: Lenient helpers silently drop providers without `id`, daily rows without `date`, projects without `name` (no counts/logs); `lastActivityAt` is synthesized as `${date}T23:59:59Z` (line 114), inventing precision the source never claimed; window fallback arithmetic (`used ?? 100 - (remaining ?? 100)`, lines 67-68) assumes complementary percentages; unknown `status.level` collapses to `"unknown"`.
- Safe modification: Add a `dropped` counter to `NormalizedSnapshot.message` when rows are skipped; validate `date` format (`YYYY-MM-DD`) and clamp percentages to 0-100; cover each branch with fixture tests.
- Test coverage: One happy-path fixture plus schema-rejection test in `tests/codexbar.test.ts`; no tests for partial/malformed payloads, inconsistent windows, or unknown fields.

**Storage read path (`src/storage.ts`):**

- Files: `src/storage.ts` (lines 182-251)
- Why fragile: Positional inserts, `JSON.parse` without `try/catch`, interpolated `ORDER BY`, and date math (`dateDaysAgo` + `range`) that assumes CodexBar dates are UTC calendar days matching local computation.
- Safe modification: Explicit column lists, `try/catch` around `JSON.parse` falling back to the previous good snapshot with `degraded: true`, enum-to-SQL mapping inside `dashboard()`.
- Test coverage: Good for aggregates/sorting/failure-preservation (`tests/storage.test.ts`); missing corrupt-payload, timezone-boundary, and concurrent-write tests.

**Static serving and deploy layout (`src/app.tsx`):**

- Files: `src/app.tsx` (lines 13-30)
- Why fragile: CWD-relative `./public/...` and `./node_modules/...` paths; generated `public/app.css` is git-ignored so a fresh clone without `bun run build:css` serves a stale/missing stylesheet; htmx depends on `node_modules` surviving deployment.
- Safe modification: Test `bun run build` output from a clean directory; vendor htmx into `public/`.
- Test coverage: `tests/routes.test.tsx` asserts asset routes return 200 from the repo root only; does not cover `dist/` or alternate CWD.

**Scheduler lifecycle (`src/index.tsx`):**

- Files: `src/index.tsx`
- Why fragile: Top-level await + bare `setInterval` + `Bun.serve` in one file; no timeout, no overlap guard, no error boundary beyond `collect()`'s own catch, shutdown not awaiting in-flight work.
- Safe modification: Guard with an `inFlight` flag (skip or await), add `AbortSignal.timeout()` to fetches, await pending collect in `shutdown()`.
- Test coverage: None (entrypoint intentionally untested; `AGENTS.md` directs tests at `createApp(storage)`).

## Scaling Limits

**Single-host SQLite writer:**

- Current capacity: One Bun process, WAL mode, ~288 snapshot writes/day plus daily/project upserts; dashboard reads per request. Comfortable for personal/small-team use.
- Limit: Concurrent writers (overlapping polls, manual `seed` while serving) hit `SQLITE_BUSY`; multi-instance or multi-host collection is unsupported.
- Scaling path: Single writer discipline (overlap guard), busy-timeout, retention; beyond that, move to a server database or per-host collectors with merged reads.

**Fixed 60-day analytics window:**

- Current capacity: `history30`/`history7` plus 7/30-day change comparisons over UTC days (`src/storage.ts` lines 203-221, `docs/architecture.md` lines 40-46).
- Limit: Longer history questions (quarterly trends, year-over-year) require ad-hoc SQL; `snapshots` bloat makes naive scans slower.
- Scaling path: Retention + rollup tables; parameterized range API only if a real need appears.

## Dependencies at Risk

**Bun runtime (`bun:sqlite`, `Bun.serve`, `Bun.spawn`, `Bun.env`):**

- Risk: Code is locked to Bun 1.2+; cannot run under Node/Deno without rewrites of storage, server, CLI adapter, and config.
- Impact: `src/storage.ts`, `src/index.tsx`, `src/codexbar.ts`, `src/config.ts`
- Migration plan: None needed while Bun is the blessed runtime (repo `AGENTS.md` mandates it); if portability ever matters, isolate behind adapters starting with storage.

**`htmx.org` served from `node_modules`:**

- Risk: `src/app.tsx` (lines 27-30) serves `/assets/htmx.min.js` from `./node_modules/htmx.org/dist/htmx.min.js`; production installs that prune dev files or deploy `dist/` alone lose interactivity (polling + sort links degrade to full-page loads at best).
- Impact: Dashboard live-refresh and partial sorting.
- Migration plan: Vendor the file into `public/` and serve it as a static asset; pin the version in `package.json` (already `^2.0.7`).

**Tailwind build step:**

- Risk: `public/app.css` is generated and git-ignored; `bun run dev` (`--hot src/index.tsx`) does not rebuild CSS, so class changes silently do nothing until `bun run build:css` is rerun (repo `AGENTS.md` calls this out).
- Impact: Stale styling during development; broken styles if deploy skips the CSS build.
- Migration plan: Already handled by `bun run build` chaining `build:css`; consider a watch-mode CSS build for dev.

## Missing Critical Features

**No snapshot retention management:**

- Problem: Nothing deletes old `snapshots` rows; operators must hand-vacuum SQLite.
- Blocks: Long-running unattended deployments.

**No collector timeouts or retry/backoff config:**

- Problem: HTTP fetches have no timeout; CLI spawns have no timeout; failures are logged and retried only at the fixed `TOKEN_PULSE_SNAPSHOT_SECONDS` cadence.
- Blocks: Predictable behavior against a flaky CodexBar; fast startup when CodexBar is down.

**No auth, audit, or multi-user controls:**

- Problem: Deliberately out of scope (proxy-provided per `docs/security-deployment.md`), but worth stating: no login, no roles, no audit log, no per-user filtering of project paths.
- Blocks: Any deployment where the dashboard audience is not fully trusted with all project paths.

## Test Coverage Gaps

**HTTP/CLI adapter collect paths:**

- What's not tested: `HttpAdapter.collect()` (partial cost failure, non-OK status, network hang, missing token header) and `CliAdapter.collect()` (nonzero exit, stderr text, invalid JSON on stdout).
- Files: `src/codexbar.ts` (lines 176-245)
- Risk: The token-omission bug above shipped despite a passing suite; CLI failure modes are entirely unexercised.
- Priority: High

**Corrupt/partial persistence:**

- What's not tested: Corrupt `payload_json`, missing `daily_usage` rows for recent dates, `NULL` vs `0` token semantics in aggregates, concurrent `save()` calls.
- Files: `src/storage.ts`
- Risk: One bad row can take down all routes; silent `NULL` handling may misreport totals.
- Priority: High

**Config edge cases:**

- What's not tested: Invalid `TOKEN_PULSE_SOURCE`, non-numeric/zero/negative `TOKEN_PULSE_PORT` and `TOKEN_PULSE_SNAPSHOT_SECONDS`, loopback bypass spellings (`127.0.0.2`, `::ffff:127.0.0.1`, uppercase, trailing dot, scheme variants), non-loopback `TOKEN_PULSE_HOST` warning (does not exist yet).
- Files: `src/config.ts`
- Risk: Misconfigurations fail silently or confusingly at 3am.
- Priority: Medium

**UI date/percent edge cases:**

- What's not tested: `duration()`/`relative()` with invalid/empty/future dates, `change()` with zero priors, bar widths with out-of-range percents, empty-provider and all-error states beyond the no-snapshot case.
- Files: `src/ui.tsx`
- Risk: Cosmetic breakage and misleading "Today"/"No prior data" labels on malformed upstream data.
- Priority: Medium

**Scheduler lifecycle:**

- What's not tested: Startup when CodexBar is down, overlapping intervals, SIGINT/SIGTERM with in-flight collect, `recordFailure` storms.
- Files: `src/index.tsx`
- Risk: Slow startup, busy-DB errors, or unclean shutdown discovered only in production.
- Priority: Low (small blast radius, but cheap to cover with an extracted scheduler module)

---

## Follow-up (2026-09-17, post-audit fixes)

The tree changed after the audit above (demo mode removed, `project_usage` dropped, sort param removed). Validated against the current tree; status per item:

**Fixed:**

- Cost endpoint now reuses the Bearer headers (`src/codexbar.ts`); fetches and `Bun.spawn` have 30s timeouts; `runJson` errors name the command.
- Percentages clamped 0..100 at ingestion (`src/codexbar.ts`) and 1..100 at render (`src/ui.tsx`); `duration()`/`relative()` NaN-safe.
- `daily_usage` INSERT uses an explicit column list; `dashboard()` falls back past corrupt payloads; `snapshots` pruned to newest 1000 rows (`src/storage.ts`).
- Scheduler has an in-flight guard, shutdown awaits pending collect (5s cap), warns on non-loopback bind (`src/index.tsx`).
- `integer()` throws on present-but-invalid values; `CODEXBAR_URL` requires `http:` scheme (`src/config.ts`).
- Security headers (`nosniff`, `same-origin` referrer, `DENY` framing) and `public/htmx.min.js` vendoring (`src/app.tsx`); vendored file excluded from Biome (`biome.json`).
- Suite grew 13 → 26 tests (`tests/ui.test.ts` added).

**Stale (fixed by the rewrite, no action):** interpolated `ORDER BY`, `project_usage` positional insert, seed demo-data footgun.

**Accepted design (not changing):** strict `schemaVersion` gate (tested), no built-in auth + Bun lock-in + single-host SQLite (documented).

_Concerns audit: 2026-09-17_
