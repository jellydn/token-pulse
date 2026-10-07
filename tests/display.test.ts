import { describe, expect, test } from "bun:test";
import { toDisplayModel } from "../src/display";
import type { DashboardData } from "../src/types";

function baseDashboard(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    capturedAt: "2026-09-17T12:00:00.000Z",
    source: "test",
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
        accounts: null,
        error: null,
        updatedAt: "2026-09-17T11:59:45Z",
      },
    ],
    subscriptions: [{ name: "ChatGPT Plus", monthlyUsd: 20 }],
    subscriptionTotalUsd: 20,
    today: {
      tokens: 1200,
      costUsd: 0.031,
      inputTokens: 800,
      outputTokens: 200,
      cacheTokens: 200,
      reasoningTokens: 0,
    },
    week: {
      tokens: 700,
      costUsd: 7,
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      reasoningTokens: 0,
    },
    month: {
      tokens: 3000,
      costUsd: 30,
      inputTokens: 0,
      outputTokens: 0,
      cacheTokens: 0,
      reasoningTokens: 0,
    },
    weekChange: null,
    monthChange: null,
    history7: [],
    history30: [],
    degraded: false,
    message: null,
    ...overrides,
  };
}

describe("toDisplayModel", () => {
  test("returns a compact display-safe payload", () => {
    const model = toDisplayModel(baseDashboard());

    expect(model).toEqual({
      updatedAt: "2026-09-17T12:00:00.000Z",
      degraded: false,
      message: null,
      providers: [
        {
          name: "Codex",
          remainingPercent: 41,
          resetAt: "2026-09-20T17:00:00Z",
          statusLabel: "Operational",
          windows: [
            {
              label: "Session",
              remainingPercent: 72,
              resetAt: "2026-09-17T17:15:00Z",
            },
            {
              label: "Weekly",
              remainingPercent: 41,
              resetAt: "2026-09-20T17:00:00Z",
            },
          ],
          accounts: null,
        },
      ],
      today: { tokens: 1200, cost: 0.031 },
      topProject: null,
    });
  });

  test("omits dashboard history, subscriptions, and source fields", () => {
    const model = toDisplayModel(baseDashboard());
    const keys = Object.keys(model).sort();

    expect(keys).toEqual([
      "degraded",
      "message",
      "providers",
      "today",
      "topProject",
      "updatedAt",
    ]);
    expect(JSON.stringify(model)).not.toContain("ChatGPT Plus");
    expect(JSON.stringify(model)).not.toContain("history");
    expect(JSON.stringify(model)).not.toContain("subscription");
    expect(JSON.stringify(model)).not.toContain('"source"');
  });

  test("flattens multi-account providers into headline remaining percent", () => {
    const model = toDisplayModel(
      baseDashboard({
        providers: [
          {
            id: "codex",
            name: "Codex",
            source: "oauth",
            status: {
              level: "warning",
              label: "High usage",
              updatedAt: "2026-09-17T11:59:00Z",
            },
            windows: [],
            accounts: [
              {
                label: "d***@acx.net",
                windows: [
                  {
                    kind: "weekly",
                    label: "Weekly",
                    usedPercent: 93,
                    remainingPercent: 7,
                    resetAt: "2026-09-19T10:14:27Z",
                  },
                ],
                updatedAt: "2026-09-17T03:00:00Z",
              },
              {
                label: "d***@gmail.com",
                windows: [
                  {
                    kind: "weekly",
                    label: "Weekly",
                    usedPercent: 5,
                    remainingPercent: 95,
                    resetAt: "2026-09-22T07:38:47Z",
                  },
                ],
                updatedAt: "2026-09-17T03:00:00Z",
              },
            ],
            error: null,
            updatedAt: "2026-09-17T11:59:45Z",
          },
        ],
      }),
    );

    expect(model.providers[0]?.remainingPercent).toBe(7);
    expect(model.providers[0]?.resetAt).toBe("2026-09-19T10:14:27Z");
    expect(model.providers[0]?.windows).toEqual([]);
    expect(model.providers[0]?.accounts).toHaveLength(2);
    expect(model.providers[0]?.accounts?.[0]?.label).toBe("d***@acx.net");
  });

  test("keeps topProject null when project usage is unavailable", () => {
    const model = toDisplayModel(
      baseDashboard({ message: "Collection failed" }),
    );
    expect(model.topProject).toBeNull();
    expect(model.message).toBe("Collection failed");
  });

  test("clamps non-finite remaining percent values", () => {
    const model = toDisplayModel(
      baseDashboard({
        providers: [
          {
            id: "codex",
            name: "Codex",
            source: "oauth",
            status: null,
            windows: [
              {
                kind: "session",
                label: "Session",
                usedPercent: 0,
                remainingPercent: Number.NaN,
                resetAt: null,
              },
            ],
            accounts: null,
            error: "Provider offline",
            updatedAt: null,
          },
        ],
      }),
    );

    expect(model.providers[0]?.remainingPercent).toBe(0);
    expect(model.providers[0]?.statusLabel).toBe("Provider offline");
  });
});
