# Technology Stack

**Analysis Date:** 2026-09-17

## Languages

**Primary:**

- TypeScript `^5.9.2` - all runtime, UI, and test code in `src/*.ts`, `src/*.tsx`, `scripts/*.ts`, `tests/*.ts(x)` (see `package.json`, `tsconfig.json`)
- TSX via `hono/jsx` - server-rendered JSX in `src/app.tsx`, `src/index.tsx`, `src/ui.tsx` (see `tsconfig.json`, `src/ui.tsx`)

**Secondary:**

- CSS with Tailwind directives - styling in `src/styles.css`, compiled output in `public/app.css` (see `src/styles.css`, `package.json`)
- SQL (SQLite dialect) - inline DDL/DML in `src/storage.ts` (`snapshots`, `daily_usage`, `project_usage`)

## Runtime

**Environment:**

- Bun `1.2+` - runtime, server (`Bun.serve` in `src/index.tsx`), SQLite driver (`bun:sqlite` in `src/storage.ts`), subprocess (`Bun.spawn` in `src/codexbar.ts`), env (`Bun.env` in `src/config.ts`) (see `README.md`, `AGENTS.md`, `src/index.tsx`, `src/storage.ts`, `src/codexbar.ts`, `src/config.ts`)

**Package Manager:**

- Bun (`bun install`) - only manager used (see `README.md`, `AGENTS.md`, `package.json`)
- Lockfile: present at `bun.lock`

## Frameworks

**Core:**

- Hono `^4.9.7` - HTTP routing, `hono/jsx` server rendering, `hono/bun` `serveStatic` in `src/app.tsx` and `src/index.tsx` (see `package.json`, `src/app.tsx`, `src/index.tsx`)
- HTMX `^2.0.7` - dashboard auto-refresh/sorting without client bundle, `hx-get="/partials/dashboard"` + `hx-trigger="every 60s"` in `src/app.tsx`, vendored at `node_modules/htmx.org/dist/htmx.min.js` served as `/assets/htmx.min.js` (see `package.json`, `src/app.tsx`)
- Tailwind CSS `^4.1.13` - utility styling via `@import "tailwindcss"` in `src/styles.css` (see `package.json`, `src/styles.css`)

**Testing:**

- `bun:test` - no Node test runner, in-memory SQLite in `tests/storage.test.ts`, `tests/codexbar.test.ts`, `tests/routes.test.tsx` via `createApp(storage)` + `app.request()` (see `package.json`, `AGENTS.md`, `README.md`)

**Build/Dev:**

- `@tailwindcss/cli` `^4.1.13` - `bunx @tailwindcss/cli -i src/styles.css -o public/app.css --minify` as `build:css` in `package.json` (see `package.json`, `src/styles.css`)
- TypeScript `^5.9.2` (`tsc --noEmit`) - `typecheck` in `package.json`, config in `tsconfig.json` (`target: ESNext`, `moduleResolution: Bundler`, `jsx: react-jsx`, `jsxImportSource: hono/jsx`)
- Biome `^2.2.4` - `format` / `lint` (`biome check .`) in `package.json`, config in `biome.json`
- Bun build - `bun build src/index.tsx --target bun --outdir dist` as `build` in `package.json`, output in `dist/index.js`
- `prek` - local pre-commit hooks (`biome`, `typecheck`, `test`) in `prek.toml`

## Key Dependencies

**Critical:**

- `hono` `^4.9.7` - all routing/rendering in `src/app.tsx` (see `package.json`, `src/app.tsx`)
- `htmx.org` `^2.0.7` - partial replacement of `/partials/dashboard`, no hydration step (see `package.json`, `src/app.tsx`, `AGENTS.md`)
- `bun:sqlite` (Bun builtin) - `Database` in `src/storage.ts` with `PRAGMA journal_mode = WAL` (see `src/storage.ts`, `README.md`, `AGENTS.md`)

**Infrastructure:**

- `@types/bun` `^1.2.21` - Bun types for `Bun.env`/`Bun.serve`/`Bun.spawn` (see `package.json`, `src/config.ts`, `src/index.tsx`, `src/codexbar.ts`)
- `hono/bun` - `serveStatic` for `public/*` and vendored HTMX in `src/app.tsx` (see `src/app.tsx`)
- `node:fs` (`mkdirSync`) + `node:path` (`dirname`) - DB directory creation in `src/storage.ts` (see `src/storage.ts`)
- `tailwindcss` `^4.1.13` + `@tailwindcss/cli` `^4.1.13` - CSS pipeline in `src/styles.css` and `package.json` (see `package.json`, `src/styles.css`)

## Configuration

**Environment:**

- Code-driven via `loadConfig(Bun.env)` in `src/config.ts` (see `src/config.ts`)
- Example in `.env.example`, loaded as `TOKEN_PULSE_SOURCE`, `TOKEN_PULSE_DB`, `TOKEN_PULSE_HOST`, `TOKEN_PULSE_PORT`, `TOKEN_PULSE_SNAPSHOT_SECONDS`, `CODEXBAR_URL`, `CODEXBAR_DASHBOARD_TOKEN`, `CODEXBAR_BIN` (see `.env.example`, `src/config.ts`, `README.md`)
- Defaults: `demo` / `./data/token-pulse.db` / `127.0.0.1:3000` / `300s` / `http://127.0.0.1:8080` / `codexbar` (see `src/config.ts`)

**Build:**

- `package.json` scripts: `dev` (`bun --hot src/index.tsx`), `build:css`, `build`, `start` (`bun dist/index.js`), `seed` (`bun scripts/seed.ts`), `format`, `lint`, `typecheck`, `test` (see `package.json`)
- `tsconfig.json` (`include: src, scripts, tests`), `biome.json` (ignores `dist`, `public/app.css`, `node_modules`, `data`), `prek.toml` (see `tsconfig.json`, `biome.json`, `prek.toml`)
- Seeding via `scripts/seed.ts` (`createDemoSnapshot()` from `src/codexbar.ts`) (see `scripts/seed.ts`, `src/codexbar.ts`)

## Platform Requirements

**Development:**

- Bun `1.2+` + `bun install` (see `README.md`, `AGENTS.md`)
- Run `bun run build:css` before `bun run dev`; rerun after Tailwind/stylesheet changes (see `AGENTS.md`, `README.md`)
- Verify with `bun run lint`, `bun run typecheck`, `bun test`, `bun run build` from repo root (see `AGENTS.md`, `README.md`)
- Use separate `TOKEN_PULSE_DB` path for manual experiments; route tests use `new Storage(":memory:")` (see `AGENTS.md`, `README.md`)

**Production:**

- `bun dist/index.js` from install root with `public/` assets (`/favicon.ico`, `/apple-touch-icon.png`, `/icon-*.png`, `/site.webmanifest`, `/assets/app.css`, `/assets/logo.svg`, `/assets/favicon.svg`, vendored HTMX); `dist/` alone is incomplete (see `AGENTS.md`, `src/app.tsx`, `package.json`)
- Listens on `TOKEN_PULSE_HOST:TOKEN_PULSE_PORT` (default `127.0.0.1:3000`) via `Bun.serve` in `src/index.tsx`; collects once at boot then `setInterval(collect)` (see `src/index.tsx`, `src/config.ts`)
- Local SQLite file at `TOKEN_PULSE_DB` (default `./data/token-pulse.db`) + WAL artifacts in `data/` (see `src/config.ts`, `src/storage.ts`, `README.md`)

---

_Stack analysis: 2026-09-17_
