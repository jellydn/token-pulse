import type { Subscription } from "./types";

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
  subscriptions: Subscription[];
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

function subscriptions(value: string | undefined): Subscription[] {
  if (value === undefined || value.trim() === "") return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("TOKEN_PULSE_SUBSCRIPTIONS must be valid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("TOKEN_PULSE_SUBSCRIPTIONS must be a JSON array");
  }

  return parsed.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(
        `TOKEN_PULSE_SUBSCRIPTIONS entry ${index + 1} must be an object`,
      );
    }
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const monthlyUsd = record.monthlyUsd;
    if (
      !name ||
      typeof monthlyUsd !== "number" ||
      !Number.isFinite(monthlyUsd) ||
      monthlyUsd < 0
    ) {
      throw new Error(
        `TOKEN_PULSE_SUBSCRIPTIONS entry ${index + 1} needs a name and non-negative monthlyUsd`,
      );
    }
    return { name, monthlyUsd };
  });
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
    subscriptions: subscriptions(env.TOKEN_PULSE_SUBSCRIPTIONS),
  };
}
