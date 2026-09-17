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
  },
];

export const codexAccountsFixture = [
  {
    account: "dung@acx.net",
    usage: {
      accountEmail: "dung@acx.net",
      updatedAt: "2026-09-17T03:00:00Z",
      primary: null,
      secondary: {
        usedPercent: 93,
        windowMinutes: 10080,
        resetsAt: "2026-09-19T10:14:27Z",
        resetDescription: "Sep 19 at 6:14 PM",
      },
      tertiary: null,
      extraRateWindows: [
        {
          id: "codex-spark",
          title: "Codex Spark 5-hour",
          window: {
            usedPercent: 0,
            windowMinutes: 300,
            resetsAt: "2026-09-17T08:00:47Z",
            resetDescription: "4:00 PM",
          },
        },
      ],
    },
  },
  {
    account: "dunghd.it@gmail.com",
    usage: {
      accountEmail: "dunghd.it@gmail.com",
      updatedAt: "2026-09-17T03:00:00Z",
      primary: {
        usedPercent: 0,
        windowMinutes: 300,
        resetsAt: "2026-09-17T08:02:52Z",
        resetDescription: "4:02 PM",
      },
      secondary: {
        usedPercent: 95,
        windowMinutes: 10080,
        resetsAt: "2026-09-22T07:38:47Z",
        resetDescription: "Sep 22 at 3:38 PM",
      },
      tertiary: null,
    },
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
    degraded: false,
    message: null,
  };
}
