import type { Config } from "./config";
import type {
  DailyUsage,
  NormalizedSnapshot,
  ProjectUsage,
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
    windows: array(provider.windows).flatMap((value) => {
      const window = record(value);
      const used = number(window.usedPercent);
      const remaining = number(window.remainingPercent);
      if (used === null && remaining === null) return [];
      return [
        {
          kind: text(window.kind) ?? "limit",
          label: text(window.label) ?? "Limit",
          usedPercent: used ?? 100 - (remaining ?? 100),
          remainingPercent: remaining ?? 100 - (used ?? 0),
          resetAt: text(window.resetAt),
        },
      ];
    }),
    error: text(rawError.message),
    updatedAt: text(provider.updatedAt),
  };
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

function normalizeProject(
  providerId: string,
  value: unknown,
): ProjectUsage | null {
  const project = record(value);
  const name = text(project.name);
  if (!name) return null;
  const latestDate = array(project.daily)
    .map((item) => text(record(item).date))
    .filter((date): date is string => date !== null)
    .sort()
    .at(-1);
  return {
    provider: providerId,
    name,
    path: text(project.path),
    totalTokens: number(project.totalTokens),
    costUsd: number(project.totalCost),
    sessions: null,
    lastActivityAt: latestDate ? `${latestDate}T23:59:59Z` : null,
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
  const projects: ProjectUsage[] = [];
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
    projects.push(
      ...array(cost.projects).flatMap((value) => {
        const item = normalizeProject(providerId, value);
        return item ? [item] : [];
      }),
    );
  }

  return {
    capturedAt: text(dashboard.generatedAt) ?? new Date().toISOString(),
    source,
    providers,
    daily,
    projects,
    degraded: providers.some((provider) => provider.error !== null),
    message:
      providers.length === 0 ? "CodexBar returned no enabled providers." : null,
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
    const [dashboardResult, costResult] = await Promise.allSettled([
      fetch(`${base}/dashboard/v1/snapshot`, { headers }),
      fetch(`${base}/cost?provider=all`),
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
    return normalized;
  }
}

async function runJson(command: string[]): Promise<unknown> {
  const process = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  const [output, error, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0)
    throw new Error(error.trim() || `${command[0]} exited with ${exitCode}`);
  return JSON.parse(output);
}

class CliAdapter implements CodexBarAdapter {
  constructor(private readonly config: Config) {}

  async collect(): Promise<NormalizedSnapshot> {
    const [dashboard, cost] = await Promise.all([
      runJson([this.config.codexBarBin, "dashboard"]),
      runJson([
        this.config.codexBarBin,
        "cost",
        "--provider",
        "all",
        "--format",
        "json",
      ]),
    ]);
    return normalizeCodexBar(dashboard, cost, "codexbar-cli");
  }
}

export function createCodexBarAdapter(config: Config): CodexBarAdapter {
  if (config.source === "http") return new HttpAdapter(config);
  if (config.source === "cli") return new CliAdapter(config);
  return { collect: () => Promise.resolve(createDemoSnapshot()) };
}

function isoDate(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function createDemoSnapshot(): NormalizedSnapshot {
  const now = new Date();
  const daily = Array.from({ length: 45 }, (_, index) => {
    const age = 44 - index;
    const total = 180_000 + ((index * 97_531) % 1_150_000);
    return {
      provider: index % 3 === 0 ? "claude" : "codex",
      date: isoDate(age),
      inputTokens: Math.round(total * 0.54),
      outputTokens: Math.round(total * 0.23),
      cacheReadTokens: Math.round(total * 0.19),
      cacheCreationTokens: Math.round(total * 0.04),
      reasoningTokens: null,
      totalTokens: total,
      costUsd: Number((total * 0.0000042).toFixed(2)),
    };
  });
  return {
    capturedAt: now.toISOString(),
    source: "demo",
    providers: [
      {
        id: "codex",
        name: "Codex",
        source: "oauth",
        status: {
          level: "ok",
          label: "Operational",
          updatedAt: now.toISOString(),
        },
        windows: [
          {
            kind: "session",
            label: "Session",
            usedPercent: 38,
            remainingPercent: 62,
            resetAt: new Date(now.getTime() + 2.6 * 3_600_000).toISOString(),
          },
          {
            kind: "weekly",
            label: "Weekly",
            usedPercent: 64,
            remainingPercent: 36,
            resetAt: new Date(now.getTime() + 3.2 * 86_400_000).toISOString(),
          },
        ],
        error: null,
        updatedAt: now.toISOString(),
      },
      {
        id: "claude",
        name: "Claude",
        source: "oauth",
        status: {
          level: "warning",
          label: "Elevated latency",
          updatedAt: now.toISOString(),
        },
        windows: [
          {
            kind: "session",
            label: "Session",
            usedPercent: 21,
            remainingPercent: 79,
            resetAt: new Date(now.getTime() + 4.1 * 3_600_000).toISOString(),
          },
          {
            kind: "weekly",
            label: "Weekly",
            usedPercent: 45,
            remainingPercent: 55,
            resetAt: new Date(now.getTime() + 5.4 * 86_400_000).toISOString(),
          },
        ],
        error: null,
        updatedAt: now.toISOString(),
      },
    ],
    daily,
    projects: [
      {
        provider: "codex",
        name: "token-pulse",
        path: "/work/token-pulse",
        totalTokens: 4_820_300,
        costUsd: 21.84,
        sessions: null,
        lastActivityAt: now.toISOString(),
      },
      {
        provider: "codex",
        name: "api-platform",
        path: "/work/api-platform",
        totalTokens: 3_190_880,
        costUsd: 14.17,
        sessions: null,
        lastActivityAt: new Date(now.getTime() - 86_400_000).toISOString(),
      },
      {
        provider: "codex",
        name: "docs-site",
        path: "/work/docs-site",
        totalTokens: 1_740_200,
        costUsd: 7.92,
        sessions: null,
        lastActivityAt: new Date(now.getTime() - 4 * 86_400_000).toISOString(),
      },
    ],
    degraded: false,
    message: "Demo data is active. Configure CodexBar to use live usage.",
  };
}
