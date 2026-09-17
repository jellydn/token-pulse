import type { NormalizedSnapshot } from "../src/types";

export const dashboardFixture = {
  schemaVersion: 1,
  generatedAt: "2026-09-17T12:00:00Z",
  providers: [
    {
      id: "codex",
      name: "Codex",
      source: "oauth",
      status: {
        level: "ok",
        label: "Operational",
        updatedAt: "2026-09-17T11:59:00Z",
      },
      windows: [
        {
          kind: "session",
          label: "Session",
          usedPercent: 28,
          remainingPercent: 72,
          resetAt: "2026-09-17T17:15:00Z",
        },
        {
          kind: "weekly",
          label: "Weekly",
          usedPercent: 59,
          remainingPercent: 41,
          resetAt: "2026-09-20T17:00:00Z",
        },
      ],
      error: null,
      updatedAt: "2026-09-17T11:59:45Z",
    },
  ],
};

export const costFixture = [
  {
    provider: "codex",
    daily: [
      {
        date: "2026-09-17",
        inputTokens: 800,
        outputTokens: 200,
        cacheReadTokens: 170,
        cacheCreationTokens: 30,
        reasoningTokens: null,
        totalTokens: 1200,
        totalCost: 0.031,
      },
    ],
    projects: [
      {
        name: "token-pulse",
        path: "/work/token-pulse",
        totalTokens: 7000,
        totalCost: 0.18,
        daily: [{ date: "2026-09-17" }],
      },
    ],
  },
];

function date(daysAgo: number): string {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() - daysAgo);
  return value.toISOString().slice(0, 10);
}

export function storageFixture(): NormalizedSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    source: "test",
    providers: [],
    daily: Array.from({ length: 60 }, (_, daysAgo) => ({
      provider: "codex",
      date: date(daysAgo),
      inputTokens: daysAgo < 7 ? 60 : 30,
      outputTokens: daysAgo < 7 ? 20 : 10,
      cacheReadTokens: daysAgo < 7 ? 15 : 5,
      cacheCreationTokens: daysAgo < 7 ? 5 : 5,
      reasoningTokens: null,
      totalTokens: daysAgo < 7 ? 100 : 50,
      costUsd: daysAgo < 7 ? 1 : 0.5,
    })),
    projects: [
      {
        provider: "codex",
        name: "small-recent",
        path: null,
        totalTokens: 10,
        costUsd: 9,
        sessions: null,
        lastActivityAt: new Date().toISOString(),
      },
      {
        provider: "codex",
        name: "large-old",
        path: null,
        totalTokens: 100,
        costUsd: 1,
        sessions: null,
        lastActivityAt: new Date(Date.now() - 86_400_000).toISOString(),
      },
    ],
    degraded: false,
    message: null,
  };
}
