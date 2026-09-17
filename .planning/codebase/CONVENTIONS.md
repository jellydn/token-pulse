# Coding Conventions

**Analysis Date:** 2026-09-17

## Naming Patterns

**Files:**

- Lowercase flat layout in `src/storage.ts`, `src/config.ts`, `src/codexbar.ts`, `src/app.tsx`, `src/index.tsx`, `src/types.ts`, `src/ui.tsx`
- Tests in `tests/storage.test.ts`, `tests/codexbar.test.ts`, `tests/routes.test.tsx` with shared data in `tests/fixtures.ts`
- Scripts in `scripts/seed.ts`; no barrel `index.ts` re-exports

**Functions:**

- `camelCase` verbs in `src/codexbar.ts` (`normalizeCodexBar`, `createCodexBarAdapter`, `createDemoSnapshot`)
- `camelCase` factories in `src/app.tsx` (`createApp`), `src/config.ts` (`loadConfig`), `src/storage.ts` (`dateDaysAgo`, `totalRows`, `percentChange`)
- Private helpers lowercase in `src/codexbar.ts` (`record`, `array`, `text`, `number`, `responseJson`, `runJson`)

**Variables:**

- `camelCase` locals in `src/storage.ts` (`dailyStatement`, `projectStatement`, `latestSuccess`, `byDate`)
- `UPPER_SNAKE` for env keys in `src/config.ts` (`TOKEN_PULSE_SOURCE`, `TOKEN_PULSE_DB`, `CODEXBAR_URL`)
- `UPPER_SNAKE` constants in `src/storage.ts` (`EMPTY_TOTALS`)

**Types:**

- `PascalCase` interfaces in `src/types.ts` (`NormalizedSnapshot`, `DashboardData`, `DailyUsage`, `ProjectUsage`, `ProviderState`)
- `PascalCase` config types in `src/config.ts` (`Config`, `SourceMode`)
- `PascalCase` class in `src/storage.ts` (`Storage`); interface in `src/codexbar.ts` (`CodexBarAdapter`)

## Code Style

**Formatting:**

- Tool `Biome` via `biome.json` (`formatter.enabled: true`, `indentStyle: space`)
- Command `bun run format` (`biome format --write .`) in `package.json`
- Excludes `dist`, `public/app.css`, `node_modules`, `data` in `biome.json`

**Linting:**

- Tool `Biome check` via `bun run lint` (`biome check .`) in `package.json`
- Rules `preset: recommended` in `biome.json`
- Enforced pre-commit in `prek.toml` (`bun run lint`, `bun run typecheck`, `bun test`)

## Import Organization

**Order:**

1. External packages in `src/app.tsx` (`hono`, `hono/bun`) and `src/storage.ts` (`bun:sqlite`)
2. Node builtins in `src/storage.ts` (`node:fs`, `node:path`)
3. Internal relative in `src/index.tsx` (`./app`, `./codexbar`, `./config`, `./storage`)

- Type-only imports as `import type` in `src/storage.ts`, `src/codexbar.ts`, `src/app.tsx`, `tests/fixtures.ts`

**Path Aliases:**

- None in `tsconfig.json`; only relative `./` and `../src/` in `tests/storage.test.ts`, `tests/routes.test.tsx`, `tests/codexbar.test.ts`

## Error Handling

**Patterns:**

- Throw `Error` with message for bad input in `src/config.ts` (`TOKEN_PULSE_SOURCE must be...`, `CODEXBAR_URL must use a loopback host`)
- Throw `Error` for schema mismatch in `src/codexbar.ts` (`Unsupported CodexBar dashboard schema`)
- Catch at boundary in `src/index.tsx` (`collect()` catches, calls `storage.recordFailure()`, logs `console.error`, preserves last good snapshot)
- Degrade not fail for partial outage in `src/codexbar.ts` (`HttpAdapter` uses `Promise.allSettled`, sets `degraded: true` when cost fetch fails)
- Skip invalid rows with `null` + `flatMap` filter in `src/codexbar.ts` (`normalizeProvider`, `normalizeDaily`, `normalizeProject`)
- Normalize message with `error instanceof Error ? error.message : String(error)` in `src/index.tsx` and `src/codexbar.ts`

## Logging

**Framework:** `console` only, no logger library in `package.json`

**Patterns:**

- `console.error` only on collection failure in `src/index.tsx` (`Token Pulse snapshot failed: ...`)
- `console.log` once on startup in `src/index.tsx` (`Token Pulse listening on ...`)
- No debug logging in `src/storage.ts`, `src/codexbar.ts`, `src/app.tsx`

## Comments

**When to Comment:**

- Almost no inline comments in `src/storage.ts`, `src/codexbar.ts`, `src/app.tsx`; code is self-documenting
- Architecture rules live in `AGENTS.md` (UTC days, cumulative replace, preserve unknown fields) and `docs/architecture.md`
- Security rules live in `AGENTS.md` (loopback-only `CODEXBAR_URL`, no auth, no tunnel of port 8080)

**JSDoc/TSDoc:**

- Not used in `src/storage.ts`, `src/config.ts`, `src/codexbar.ts`, `tests/fixtures.ts`

## Function Design

**Size:** Small pure helpers under ~20 lines in `src/storage.ts` (`totalRows`, `percentChange`), `src/codexbar.ts` (`record`, `text`, `number`), `src/config.ts` (`integer`)
**Parameters:** 1–3 params or single `env` record in `src/config.ts` (`loadConfig(env)`); union literal `dashboard(sort = "tokens")` in `src/storage.ts`
**Return Values:** Typed domain objects in `src/types.ts` (`NormalizedSnapshot`, `DashboardData`, `Config`); `null` for absent nullable fields (`reasoningTokens`, `sessions`, `resetAt`)

## Module Design

**Exports:** Named exports only in `src/storage.ts` (`export class Storage`), `src/config.ts` (`export function loadConfig`), `src/codexbar.ts` (`export function normalizeCodexBar`), `src/app.tsx` (`export function createApp`)
**Barrel Files:** None; process entrypoint with side effects is `src/index.tsx` (open `Storage`, `collect()`, `Bun.serve`, signal handlers); tests must use `createApp(storage)` from `src/app.tsx` per `AGENTS.md`, never import `src/index.tsx`

---

_Convention analysis: 2026-09-17_
