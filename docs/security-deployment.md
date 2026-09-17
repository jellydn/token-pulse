# Security and deployment

## Trust boundary

CodexBar is the credential boundary. It reads provider sessions, cookies, OAuth state, and API keys. Token Pulse receives only usage JSON and stores no provider credential.

Keep `codexbar serve` on `127.0.0.1`. Do not publish, tunnel, reverse-proxy, or port-forward its port. Use a high-entropy `CODEXBAR_DASHBOARD_TOKEN`; pass it to both processes through protected environment configuration. Token Pulse rejects a non-loopback CodexBar URL.

Token Pulse also binds to `127.0.0.1` by default. For remote access, expose **only Token Pulse** through one of these authenticated paths:

1. **Tailscale:** keep both services on loopback and use `tailscale serve http://127.0.0.1:3000`. Limit access with tailnet ACLs.
2. **Cloudflare Tunnel + Access:** point `cloudflared` at `http://127.0.0.1:3000`, then require an Access application and identity policy. Never point the tunnel at port 8080 or the CodexBar process.

Token Pulse has no built-in user authentication. Do not bind it to a public interface without an authenticated proxy. The dashboard contains project paths and usage details that can be sensitive.

## Production process model

A small host runs two required foreground services and one optional access service:

```text
codexbar serve --host 127.0.0.1 --port 8080
token-dashboard (bun /opt/token-pulse/dist/index.js)
cloudflared tunnel run token-pulse    # optional; or use Tailscale Serve
```

Use systemd, launchd, or another supervisor. Give CodexBar access to its own user profile and credentials. Run Token Pulse as the same user only when CLI mode requires that profile; HTTP mode can use a separate restricted user with read/write access only to its SQLite directory.

Example environment for the Token Pulse process:

```sh
NODE_ENV=production
TOKEN_PULSE_SOURCE=http
TOKEN_PULSE_HOST=127.0.0.1
TOKEN_PULSE_PORT=3000
TOKEN_PULSE_DB=/var/lib/token-pulse/token-pulse.db
TOKEN_PULSE_SNAPSHOT_SECONDS=300
CODEXBAR_URL=http://127.0.0.1:8080
CODEXBAR_DASHBOARD_TOKEN=<read from a protected secret store>
```

Set the environment file to mode `0600` and the database directory to mode `0700`. Back up the SQLite database with a SQLite-aware backup command while the service is running. Keep CodexBar and Token Pulse current, and verify `/healthz` after upgrades.

## Cloudflare example

The tunnel ingress target is Token Pulse only:

```yaml
ingress:
  - hostname: tokens.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Configure Cloudflare Access for `tokens.example.com` before enabling the public hostname. A tunnel by itself is transport, not authorization.
