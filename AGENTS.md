# Agent instructions

## Run and verify

- Use Bun 1.2+ and `bun install`. Runtime code uses `bun:sqlite` and `Bun.serve`; tests use `bun:test`, not a Node test runner.
- Before `bun run dev`, run `bun run build:css`. The hot-reload command does not rebuild CSS; rerun the CSS build after Tailwind class or stylesheet changes.
- Verify with `bun run lint`, `bun run typecheck`, `bun test`, and `bun run build`. `bun run format` writes formatting changes; lint also checks formatting.
- Focus a test file with `bun test tests/storage.test.ts` or `bun test tests/routes.test.tsx`.
- Run from the repository root. Static assets use relative paths: `public/` brand files served at site root (`/favicon.ico`, `/apple-touch-icon.png`, `/icon-*.png`, `/site.webmanifest`) and under `/assets/` (`app.css`, `logo.svg`, `favicon.svg`, `htmx.min.js` vendored in `public/`); production runs `bun dist/index.js` from the install root with those present, so `dist/` alone is not a complete deployment. CSS is generated and ignored by Git.

## Execution and data

- This is server-rendered Hono JSX, not React: `tsconfig.json` uses `hono/jsx`. HTMX replaces `/partials/dashboard`; there is no client application bundle or hydration step.
- `src/index.tsx` opens storage, collects once before serving, then schedules collection. Tests should use `createApp(storage)` from `src/app.tsx` and `app.request()`, not import the process entrypoint.
- `TOKEN_PULSE_SOURCE` selects `http` (default) or `cli`. Starting the app collects and writes data.
- `TOKEN_PULSE_DB` defaults to `./data/token-pulse.db`. Use a separate path for manual experiments; route tests use `new Storage(":memory:")` and close stores after each test.
- CodexBar daily values are cumulative: storage replaces rows keyed by `(provider, date)` rather than adding each poll. Collection failures must preserve the last good snapshot.
- Preserve unknown token/cost fields at ingestion. Do not invent session counts or apply another pricing model. Reporting periods use UTC calendar days; see `docs/architecture.md` for aggregate definitions.

## Trust boundary

- CodexBar owns provider credentials. Token Pulse consumes JSON only; HTTP mode restricts `CODEXBAR_URL` to loopback hosts.
- Token Pulse has no built-in user authentication. Never publish or tunnel CodexBar port 8080. Remote access must expose only Token Pulse behind authenticated access; see `docs/security-deployment.md` before changing deployment or access controls.
