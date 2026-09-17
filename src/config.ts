export type SourceMode = "http" | "cli";

export interface Config {
  source: SourceMode;
  dbPath: string;
  host: string;
  port: number;
  snapshotSeconds: number;
  codexBarUrl: string;
  codexBarToken: string | undefined;
  codexBarBin: string;
}

function integer(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadConfig(
  env: Record<string, string | undefined> = Bun.env,
): Config {
  const source = env.TOKEN_PULSE_SOURCE ?? "http";
  if (!(["http", "cli"] as const).includes(source as SourceMode)) {
    throw new Error("TOKEN_PULSE_SOURCE must be http or cli");
  }

  const codexBarUrl = env.CODEXBAR_URL ?? "http://127.0.0.1:8080";
  if (source === "http") {
    const url = new URL(codexBarUrl);
    if (url.protocol !== "http:") {
      throw new Error("CODEXBAR_URL must use http: with a loopback host");
    }
    if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
      throw new Error(
        "CODEXBAR_URL must use a loopback host; never expose CodexBar publicly",
      );
    }
  }

  return {
    source: source as SourceMode,
    dbPath: env.TOKEN_PULSE_DB ?? "./data/token-pulse.db",
    host: env.TOKEN_PULSE_HOST ?? "127.0.0.1",
    port: integer(env.TOKEN_PULSE_PORT, 3000, "TOKEN_PULSE_PORT"),
    snapshotSeconds: integer(
      env.TOKEN_PULSE_SNAPSHOT_SECONDS,
      300,
      "TOKEN_PULSE_SNAPSHOT_SECONDS",
    ),
    codexBarUrl,
    codexBarToken: env.CODEXBAR_DASHBOARD_TOKEN || undefined,
    codexBarBin: env.CODEXBAR_BIN ?? "codexbar",
  };
}
