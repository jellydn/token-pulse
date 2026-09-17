# Testing Patterns

**Analysis Date:** 2026-09-17

## Test Framework

**Runner:**

- `bun:test` (Bun 1.2+) in `AGENTS.md`
- Config: no separate config file; types via `bun-types` in `tsconfig.json`

**Assertion Library:**

- Built-in `bun:test` (`describe`, `test`, `expect`, `afterEach`) in `tests/storage.test.ts`, `tests/routes.test.tsx`, `tests/codexbar.test.ts`

**Run Commands:**

```bash
bun test                          # Run all tests (`package.json`)
bun test tests/storage.test.ts    # Focus one file (`AGENTS.md`)
bun test tests/routes.test.tsx    # Focus route tests (`AGENTS.md`)
bun run lint && bun run typecheck && bun test && bun run build  # Full verify (`AGENTS.md`)
```

## Test File Organization

**Location:**

- Separate `tests/` directory, not co-located, in `tests/storage.test.ts`, `tests/routes.test.tsx`, `tests/codexbar.test.ts`
- Shared helpers in `tests/fixtures.ts`

**Naming:**

- Pattern `*.test.ts` in `tests/storage.test.ts`, `tests/codexbar.test.ts`
- Pattern `*.test.tsx` for JSX route tests in `tests/routes.test.tsx`

**Structure:**

```
tests/
  fixtures.ts
  storage.test.ts
  codexbar.test.ts
  routes.test.tsx
```

## Test Structure

**Suite Organization:**

```typescript
// `tests/storage.test.ts`
import { afterEach, describe, expect, test } from "bun:test";
const stores: Storage[] = [];
function store(): Storage {
  const storage = new Storage(":memory:");
  stores.push(storage);
  return storage;
}
afterEach(() => {
  for (const storage of stores.splice(0)) storage.close();
});
describe("SQLite storage and aggregates", () => {
  test("persists snapshots but replaces cumulative daily observations", () => {
    const storage = store();
    storage.save(storageFixture());
    expect(storage.dashboard().today.tokens).toBe(100);
  });
});
```

**Patterns:**

- Setup via helper that creates `new Storage(":memory:")` in `tests/storage.test.ts` (`store()`) and `tests/routes.test.tsx` (`setup()` returns `{ storage, app: createApp(storage) }`)
- Teardown via `afterEach` draining `stores` and calling `storage.close()` in `tests/storage.test.ts` and `tests/routes.test.tsx`
- Assertion via `toBe`, `toEqual`, `toContain`, `toMatchObject`, `toHaveLength` in `tests/storage.test.ts`, `tests/routes.test.tsx`, `tests/codexbar.test.ts`

## Mocking

**Framework:** None; no mock library in `package.json`

**Patterns:**

```typescript
// `tests/routes.test.tsx` — real app, no mocks
const storage = new Storage(":memory:");
storage.save(storageFixture());
const app = createApp(storage);
const response = await app.request("/partials/dashboard?sort=cost");
```

**What to Mock:**

- Nothing; use deterministic fixtures from `tests/fixtures.ts` and in-memory `Storage` from `src/storage.ts`

**What NOT to Mock:**

- Do not mock `src/storage.ts` (`bun:sqlite` `:memory:` is fast enough) per `tests/storage.test.ts`
- Do not mock `src/app.tsx` routing; use `app.request()` per `tests/routes.test.tsx` and `AGENTS.md`
- Do not import process entrypoint `src/index.tsx` (opens real DB, serves port) per `AGENTS.md`

## Fixtures and Factories

**Test Data:**

```typescript
// `tests/fixtures.ts`
export function storageFixture(): NormalizedSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    source: "test",
    providers: [],
    daily: Array.from({ length: 60 }, (_, daysAgo) => ({
      provider: "codex",
      date: date(daysAgo),
      totalTokens: daysAgo < 7 ? 100 : 50,
      costUsd: daysAgo < 7 ? 1 : 0.5,
      // ...
    })),
    projects: [/* small-recent vs large-old */],
    degraded: false,
    message: null,
  };
}
```

**Location:**

- All shared data in `tests/fixtures.ts` (`dashboardFixture`, `costFixture`, `storageFixture()`)
- UTC-day helper `date()` in `tests/fixtures.ts` mirrors `dateDaysAgo()` in `src/storage.ts`

## Coverage

**Requirements:** None enforced; no threshold in `package.json`, `prek.toml`, `AGENTS.md`

**View Coverage:**

```bash
bun test --coverage  # Bun built-in, not wired to a script in `package.json`
```

## Test Types

**Unit Tests:**

- Pure normalization in `tests/codexbar.test.ts` (`normalizeCodexBar` keeps tokens/costs/projects, rejects `schemaVersion: 2`)
- Config validation in `tests/codexbar.test.ts` (`loadConfig` rejects non-loopback `CODEXBAR_URL`)
- Aggregate math in `tests/storage.test.ts` (cumulative replace, week/month, project sort, `recordFailure`)

**Integration Tests:**

- HTTP routes via `createApp(storage)` + `app.request()` in `tests/routes.test.tsx` (`/`, `/partials/dashboard`, `/api/dashboard`, `/healthz`, brand assets)
- SQLite persistence via `save()` then `dashboard()` in `tests/storage.test.ts`

**E2E Tests:**

- Not used; no browser runner in `package.json`

## Common Patterns

**Async Testing:**

```typescript
// `tests/routes.test.tsx`
test("returns JSON data and health", async () => {
  const { app } = setup();
  const dashboard = await app.request("/api/dashboard");
  expect((await dashboard.json()).history30).toHaveLength(30);
});
```

**Error Testing:**

```typescript
// `tests/codexbar.test.ts`
expect(() =>
  normalizeCodexBar({ ...dashboardFixture, schemaVersion: 2 }, [], "fixture"),
).toThrow("Unsupported CodexBar dashboard schema");
// `tests/storage.test.ts`
storage.recordFailure("test", "collector offline");
expect(dashboard.degraded).toBe(true);
```

---

_Testing analysis: 2026-09-17_
