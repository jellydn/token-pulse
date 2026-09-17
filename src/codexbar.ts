import type { Config } from "./config";
import type {
  AccountState,
  DailyUsage,
  LimitWindow,
  NormalizedSnapshot,
  ProviderState,
  StatusLevel,
} from "./types";

type JsonRecord = Record<string, unknown>;

export interface CodexBarAdapter {
  collect(): Promise<NormalizedSnapshot>;
}

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function redactAccount(value: string): string {
  const separator = value.indexOf("@");
  if (separator <= 0) return value;
  return `${value.slice(0, 1)}***@${value.slice(separator + 1)}`;
}

function normalizeProvider(value: unknown): ProviderState | null {
  const provider = record(value);
  const id = text(provider.id);
  if (!id) return null;
  const rawStatus = record(provider.status);
  const rawError = record(provider.error);
  const statusLevel = text(rawStatus.level);

  return {
    id,
    name: text(provider.name) ?? id,
    source: text(provider.source) ?? "unknown",
    status:
      Object.keys(rawStatus).length > 0
        ? {
            level: (["ok", "warning", "critical", "unknown"].includes(
              statusLevel ?? "",
            )
              ? statusLevel
              : "unknown") as StatusLevel,
            label: text(rawStatus.label) ?? "Unknown",
            updatedAt: text(rawStatus.updatedAt),
          }
        : null,
    windows: normalizeWindows(array(provider.windows)),
    error: text(rawError.message),
    accounts: null,
    updatedAt: text(provider.updatedAt),
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function normalizeWindows(values: unknown[]): LimitWindow[] {
  return values.flatMap((value) => {
    const window = record(value);
    const used = number(window.usedPercent);
    const remaining = number(window.remainingPercent);
    if (used === null && remaining === null) return [];
    return [
      {
        kind: text(window.kind) ?? "limit",
        label: text(window.label) ?? "Limit",
        usedPercent: clampPercent(used ?? 100 - (remaining ?? 100)),
        remainingPercent: clampPercent(remaining ?? 100 - (used ?? 0)),
        resetAt: text(window.resetAt) ?? text(window.resetsAt),
      },
    ];
  });
}

function normalizeUsageWindow(value: unknown): LimitWindow | null {
  const window = record(value);
  const windows = normalizeWindows([window]);
  return windows[0] ?? null;
}

function normalizeAccount(value: unknown): AccountState | null {
  const entry = record(value);
  const usage = record(entry.usage);
  const accountEmail =
    text(entry.account) ?? text(usage.accountEmail) ?? "Account";
  const windows: LimitWindow[] = [];
  const primary = normalizeUsageWindow(usage.primary);
  if (primary) windows.push({ ...primary, label: "5-hour" });
  const secondary = normalizeUsageWindow(usage.secondary);
  if (secondary) windows.push({ ...secondary, label: "Weekly" });
  const tertiary = normalizeUsageWindow(usage.tertiary);
  if (tertiary) windows.push({ ...tertiary, label: tertiary.label });
  for (const extra of array(usage.extraRateWindows)) {
    const item = record(extra);
    const window = normalizeUsageWindow(item.window);
    if (!window) continue;
    windows.push({ ...window, label: text(item.title) ?? window.label });
  }
  if (windows.length === 0) return null;
  return {
    label: redactAccount(accountEmail),
    windows,
    updatedAt: text(usage.updatedAt),
  };
}

export function normalizeCodexAccounts(value: unknown): AccountState[] {
  return array(value).flatMap((entry) => {
    const account = normalizeAccount(entry);
    return account ? [account] : [];
  });
}

function normalizeDaily(providerId: string, value: unknown): DailyUsage | null {
  const daily = record(value);
  const date = text(daily.date);
  if (!date) return null;
  return {
    provider: providerId,
    date,
    inputTokens: number(daily.inputTokens),
    outputTokens: number(daily.outputTokens),
    cacheReadTokens: number(daily.cacheReadTokens),
    cacheCreationTokens: number(daily.cacheCreationTokens),
    reasoningTokens: number(daily.reasoningTokens),
    totalTokens: number(daily.totalTokens),
    costUsd: number(daily.totalCost),
  };
}

export function normalizeCodexBar(
  dashboardValue: unknown,
  costValue: unknown,
  source: string,
): NormalizedSnapshot {
  const dashboard = record(dashboardValue);
  if (number(dashboard.schemaVersion) !== 1) {
    throw new Error(
      `Unsupported CodexBar dashboard schema: ${String(dashboard.schemaVersion)}`,
    );
  }

  const providers = array(dashboard.providers).flatMap((value) => {
    const provider = normalizeProvider(value);
    return provider ? [provider] : [];
  });
  const costs = array(costValue);
  const daily: DailyUsage[] = [];
  for (const value of costs) {
    const cost = record(value);
    const providerId = text(cost.provider);
    if (!providerId) continue;
    daily.push(
      ...array(cost.daily).flatMap((value) => {
        const item = normalizeDaily(providerId, value);
        return item ? [item] : [];
      }),
    );
  }

  return {
    capturedAt: text(dashboard.generatedAt) ?? new Date().toISOString(),
    source,
    providers,
    daily,
    degraded: providers.some((provider) => provider.error !== null),
    message:
      providers.length === 0 ? "CodexBar returned no enabled providers." : null,
  };
}

export function attachCodexAccounts(
  snapshot: NormalizedSnapshot,
  usageValue: unknown,
): NormalizedSnapshot {
  const accounts = normalizeCodexAccounts(usageValue);
  if (accounts.length === 0) return snapshot;
  return {
    ...snapshot,
    providers: snapshot.providers.map((provider) =>
      provider.id === "codex" ? { ...provider, accounts } : provider,
    ),
  };
}

async function responseJson(
  response: Response,
  endpoint: string,
): Promise<unknown> {
  if (!response.ok)
    throw new Error(`CodexBar ${endpoint} returned HTTP ${response.status}`);
  return response.json();
}

class HttpAdapter implements CodexBarAdapter {
  constructor(private readonly config: Config) {}

  async collect(): Promise<NormalizedSnapshot> {
    const base = this.config.codexBarUrl.replace(/\/$/, "");
    const headers = this.config.codexBarToken
      ? { Authorization: `Bearer ${this.config.codexBarToken}` }
      : undefined;
    const [dashboardResult, costResult, codexAccountsResult] =
      await Promise.allSettled([
        fetch(`${base}/dashboard/v1/snapshot`, {
          headers,
          signal: AbortSignal.timeout(30_000),
        }),
        fetch(`${base}/cost?provider=all`, {
          headers,
          signal: AbortSignal.timeout(30_000),
        }),
        runJson([
          this.config.codexBarBin,
          "usage",
          "--provider",
          "codex",
          "--all-accounts",
          "--format",
          "json",
        ]),
      ]);
    if (dashboardResult.status === "rejected") throw dashboardResult.reason;
    const dashboard = await responseJson(
      dashboardResult.value,
      "dashboard endpoint",
    );
    let cost: unknown = [];
    let costError: string | null = null;
    if (costResult.status === "fulfilled") {
      try {
        cost = await responseJson(costResult.value, "cost endpoint");
      } catch (error) {
        costError = error instanceof Error ? error.message : String(error);
      }
    } else {
      costError =
        costResult.reason instanceof Error
          ? costResult.reason.message
          : String(costResult.reason);
    }
    const normalized = normalizeCodexBar(dashboard, cost, "codexbar-http");
    if (costError) {
      normalized.degraded = true;
      normalized.message = `Limits are current, but cost usage is unavailable: ${costError}`;
    }
    if (codexAccountsResult.status === "fulfilled") {
      return attachCodexAccounts(normalized, codexAccountsResult.value);
    }
    return normalized;
  }
}

export async function runJson(command: string[]): Promise<unknown> {
  const process = Bun.spawn(command, {
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(30_000),
  });
  const [output, error, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0)
    throw new Error(error.trim() || `${command[0]} exited with ${exitCode}`);
  try {
    return JSON.parse(output);
  } catch {
    const snippet = output.trim().slice(0, 200);
    throw new Error(
      `${command[0]} returned non-JSON output: ${snippet || "(empty stdout)"}`,
    );
  }
}

class CliAdapter implements CodexBarAdapter {
  constructor(private readonly config: Config) {}

  async collect(): Promise<NormalizedSnapshot> {
    const [dashboard, cost, codexAccounts] = await Promise.all([
      runJson([this.config.codexBarBin, "dashboard"]),
      runJson([
        this.config.codexBarBin,
        "cost",
        "--provider",
        "all",
        "--format",
        "json",
      ]),
      runJson([
        this.config.codexBarBin,
        "usage",
        "--provider",
        "codex",
        "--all-accounts",
        "--format",
        "json",
      ]),
    ]);
    return attachCodexAccounts(
      normalizeCodexBar(dashboard, cost, "codexbar-cli"),
      codexAccounts,
    );
  }
}

export function createCodexBarAdapter(config: Config): CodexBarAdapter {
  if (config.source === "cli") return new CliAdapter(config);
  return new HttpAdapter(config);
}
