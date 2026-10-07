# Security and deployment

## Trust boundary

CodexBar is a privileged internal data source. It reads provider sessions, cookies, OAuth state, API keys, local usage logs, and account metadata. Its HTTP output can contain provider and account usage, limits, costs, project paths, and identity fields. Token Pulse receives only the usage data needed for its dashboard and stores no provider credential.

Run CodexBar with a high-entropy dashboard token and a loopback listener:

```sh
export CODEXBAR_DASHBOARD_TOKEN="$(openssl rand -hex 32)"
codexbar serve \
  --host 127.0.0.1 \
  --port 8080 \
  --refresh-interval 60 \
  --identity redacted
```

Pass the same token to Token Pulse through protected environment configuration. Token Pulse rejects a non-loopback `CODEXBAR_URL`.

### Why CodexBar must remain internal

`--host 127.0.0.1` prevents another machine from connecting directly to port 8080 over the LAN or public Internet. It does **not** prevent software on the same host from forwarding that port. Tailscale Serve, Cloudflare Tunnel, a reverse proxy, or an SSH port forward connects to the loopback listener locally and can then publish it to another network.

Therefore, a loopback bind does not make this safe:

```sh
# UNSAFE: publishes CodexBar directly to the tailnet.
tailscale serve http://127.0.0.1:8080

# UNSAFE: publishes CodexBar directly through a Cloudflare Tunnel.
cloudflared tunnel --url http://127.0.0.1:8080
```

These examples bypass Token Pulse's intended presentation and security boundary. CodexBar routes can expose different data and can have different authentication behavior. A `CODEXBAR_DASHBOARD_TOKEN` protects the dashboard snapshot route, but it must not be treated as a security wrapper for every CodexBar route.

`--identity redacted` controls how much identity information CodexBar returns. It does not authenticate a caller, authorize access, stop a tunnel, or hide provider/account usage. It is a privacy reduction, not access control.

The supported topology has one public or tailnet-facing service:

```text
Provider credentials and logs
            │
            ▼
CodexBar 127.0.0.1:8080
            │ server-side loopback only
            ▼
Token Pulse 127.0.0.1:3000
            │
            ├── Tailscale authentication and ACLs
            └── Cloudflare Tunnel + Access policy
```

Safe Tailscale access publishes Token Pulse, not CodexBar:

```sh
tailscale serve http://127.0.0.1:3000
```

Safe Cloudflare access uses an authenticated Access application and sends the tunnel only to Token Pulse:

```yaml
ingress:
  - hostname: tokens.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Token Pulse also binds to `127.0.0.1` by default. For remote access, expose **only Token Pulse** through one of these authenticated paths:

1. **Tailscale:** keep both services on loopback and use `tailscale serve http://127.0.0.1:3000`. Limit access with tailnet ACLs.
2. **Cloudflare Tunnel + Access:** point `cloudflared` at `http://127.0.0.1:3000`, then require an Access application and identity policy. Never point the tunnel at port 8080 or the CodexBar process.

Token Pulse has no built-in user authentication. Do not bind it to a public interface without an authenticated proxy. The dashboard contains project paths and usage details that can be sensitive.

The `/kindle` view follows the same boundary. It fetches a rendered fragment from Token Pulse and never calls CodexBar, so the dashboard bearer token is not sent to the device. A Kindle on the LAN or Internet must still reach Token Pulse through Tailscale policy or Cloudflare Access; the e-ink layout is not an authentication mechanism.

`GET /api/display` is the machine-readable form of that boundary. It returns only the compact display model (limits, today's totals, status text). It must not include `CODEXBAR_DASHBOARD_TOKEN`, Authorization headers, SQLite paths, or other host secrets. ESP32 firmware should store only Wi-Fi credentials and the Token Pulse display URL, talk solely to the published Token Pulse origin, and treat temporary fetch failures by keeping the last painted frame rather than clearing the panel. An e-paper device is not an authentication mechanism; put Tailscale ACLs or Cloudflare Access in front of port `3000` the same way you would for `/kindle`.

## Production process model

A small host runs two required foreground services and one optional access service:

```text
codexbar serve --host 127.0.0.1 --port 8080 --refresh-interval 60 --identity redacted
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

## Cloudflare configuration

The tunnel ingress target is Token Pulse only, as shown above. Before starting `cloudflared tunnel run token-pulse`, configure Cloudflare Access for `tokens.example.com` with an identity policy.

A tunnel by itself is transport, not authorization. Cloudflare Access supplies the required authentication boundary. Never add `http://127.0.0.1:8080` as an ingress service.
