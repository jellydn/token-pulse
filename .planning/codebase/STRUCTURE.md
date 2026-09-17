# Codebase Structure

**Analysis Date:** 2026-09-17

## Directory Layout

```
token-pulse/
├── src/ # Runtime source (Hono + SQLite + JSX view)
├── tests/ # bun:test suites + shared fixtures
├── scripts/ # Operational scripts (demo seeder)
├── docs/ # Architecture + security/deployment notes
├── public/ # Static web root (generated CSS, brand, manifest)
├── data/ # Default SQLite directory (gitignored)
├── dist/ # Build output (gitignored, needs public/ alongside)
├── .planning/codebase/ # Generated codebase maps (this file's home)
├── node_modules/ # Dependencies incl. vendored htmx asset
└── package.json # Scripts (dev/build/test/lint/typecheck)
└── tsconfig.json # Strict TS + hono/jsx config
└── biome.json # Format + lint config
└── AGENTS.md # Repo agent instructions
└── README.md # Human operator guide
└── .env / .env.example # Local env samples
```

## Directory Purposes

**`src/`:**

- Purpose: All production runtime code — config, ingestion, storage, routes, views, styles
- Contains: `.ts` logic modules, `.tsx` Hono JSX modules, `.css` Tailwind source
- Key files: `src/index.tsx`, `src/app.tsx`, `src/ui.tsx`, `src/storage.ts`, `src/codexbar.ts`, `src/config.ts`, `src/types.ts`, `src/styles.css`

**`tests/`:**

- Purpose: Unit + route tests run with `bun:test`
- Contains: `*.test.ts` / `*.test.tsx` suites plus a shared fixture module
- Key files: `tests/codexbar.test.ts`, `tests/storage.test.ts`, `tests/routes.test.tsx`, `tests/fixtures.ts`

**`scripts/`:**

- Purpose: One-shot operational scripts
- Contains: Single Bun script
- Key files: `scripts/seed.ts`

**`docs/`:**

- Purpose: Human design and operator documentation
- Contains: Markdown architecture and security guides
- Key files: `docs/architecture.md`, `docs/security-deployment.md`

**`public/`:**

- Purpose: Static web root served by `src/app.tsx` via `hono/bun` `serveStatic`
- Contains: Generated CSS, SVG/PNG brand icons, web manifest
- Key files: `public/app.css` (generated, gitignored), `public/logo.svg`, `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/site.webmanifest`

**`data/`:**

- Purpose: Default on-disk SQLite location (`./data/token-pulse.db` from `src/config.ts`)
- Contains: Runtime database files only
- Key files: `data/token-pulse.db` (created at runtime, gitignored)

**`dist/`:**

- Purpose: Production bundle from `bun build src/index.tsx --target bun --outdir dist`
- Contains: Built `dist/index.js` (run with `bun dist/index.js` from repo root so relative `public/` paths resolve)
- Key files: `dist/index.js`

## Key File Locations

**Entry Points:**

- `src/index.tsx`: Production process entry — scheduler + `Bun.serve`
- `scripts/seed.ts`: Demo-data seeder (`bun run seed`)
- `tests/routes.test.tsx`: Route-level entry for HTTP tests via `createApp(storage).request()`

**Configuration:**

- `src/config.ts`: Env parsing (`TOKEN_PULSE_*`, `CODEXBAR_*`) and loopback guard
- `package.json`: Scripts for `dev`, `build`, `build:css`, `start`, `seed`, `lint`, `typecheck`, `test`
- `tsconfig.json`: Strict TS, `jsx: react-jsx` with `jsxImportSource: hono/jsx`
- `biome.json`: Formatter + linter rules (`bun run lint` checks formatting too)
- `.env` / `.env.example`: Local environment samples
- `prek.toml`: Pre-commit hook config

**Core Logic:**

- `src/codexbar.ts`: Ingestion adapters + normalization + demo snapshot
- `src/storage.ts`: SQLite schema, transactional writes, dashboard aggregates
- `src/app.tsx`: Route table (`/`, `/partials/dashboard`, `/api/dashboard`, `/healthz`, `/assets/*`)
- `src/ui.tsx`: All JSX view components (`Page`, `Dashboard`, cards, charts, tables)
- `src/types.ts`: Shared domain + DTO interfaces

**Testing:**

- `tests/codexbar.test.ts`: Normalizer unit tests
- `tests/storage.test.ts`: Aggregation + upsert + failure-preservation tests
- `tests/routes.test.tsx`: HTTP contract tests against in-memory storage
- `tests/fixtures.ts`: `dashboardFixture`, `costFixture`, `storageFixture()`

## Naming Conventions

**Files:**

- Lowercase flat modules: `src/storage.ts`, `src/config.ts`, `src/types.ts`, `src/codexbar.ts`
- `.tsx` iff the module contains JSX: `src/index.tsx` (none directly, but entry), `src/app.tsx`, `src/ui.tsx`, `tests/routes.test.tsx`
- Tests colocated by subject under `tests/`: `tests/storage.test.ts`, `tests/codexbar.test.ts`, `tests/routes.test.tsx`
- Fixtures in one shared module: `tests/fixtures.ts`
- Single-purpose script named by verb: `scripts/seed.ts`
- Lowercase docs: `docs/architecture.md`, `docs/security-deployment.md`

**Directories:**

- Lowercase singular nouns: `src/`, `tests/`, `scripts/`, `docs/`, `public/`, `data/`, `dist/`
- Hidden tooling dirs dotted: `.planning/`

## Where to Add New Code

**New Feature:**

- Primary code: `src/` — adapter parsing in `src/codexbar.ts`, persistence/aggregation in `src/storage.ts`, routes in `src/app.tsx`, rendering in `src/ui.tsx`, contracts in `src/types.ts`
- Tests: `tests/` alongside the subject (`tests/storage.test.ts`, `tests/codexbar.test.ts`, `tests/routes.test.tsx`), shared data in `tests/fixtures.ts`

**New Component/Module:**

- Implementation: New flat lowercase module in `src/` (e.g. `src/metrics.ts`); JSX components go in `src/ui.tsx` or a new `src/*.tsx` module

**Utilities:**

- Shared helpers: Keep small pure helpers local to the owning module (`totalRows` in `src/storage.ts`, `record`/`number`/`text` in `src/codexbar.ts`, formatters in `src/ui.tsx`); no shared `utils/` directory exists

## Special Directories

**`data/`:**

- Purpose: Runtime SQLite storage
- Generated: Yes (created by `mkdirSync` in `src/storage.ts`)
- Committed: No (gitignored; use a separate `TOKEN_PULSE_DB` path for experiments)

**`dist/`:**

- Purpose: Build output
- Generated: Yes (`bun run build`)
- Committed: No (not a complete deployment alone — needs `public/` brand/assets and `node_modules/htmx.org` vendored file at runtime)

**`public/app.css`:**

- Purpose: Compiled Tailwind stylesheet served at `/assets/app.css`
- Generated: Yes (`bun run build:css` before `bun run dev`)
- Committed: No (gitignored; source is `src/styles.css`)

**`node_modules/htmx.org/dist/htmx.min.js`:**

- Purpose: Vendored HTMX served at `/assets/htmx.min.js` by `src/app.tsx`
- Generated: No (npm package)
- Committed: No (installed via `bun install`)

---

_Structure analysis: 2026-09-17_
