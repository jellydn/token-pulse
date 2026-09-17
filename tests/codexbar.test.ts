import { describe, expect, test } from "bun:test";
import { normalizeCodexBar } from "../src/codexbar";
import { loadConfig } from "../src/config";
import { costFixture, dashboardFixture } from "./fixtures";

describe("CodexBar normalization", () => {
  test("keeps limits, token mix, costs, and project activity", () => {
    const snapshot = normalizeCodexBar(
      dashboardFixture,
      costFixture,
      "fixture",
    );

    expect(
      snapshot.providers[0]?.windows.map((window) => window.remainingPercent),
    ).toEqual([72, 41]);
    expect(snapshot.daily[0]).toMatchObject({
      inputTokens: 800,
      outputTokens: 200,
      cacheReadTokens: 170,
      cacheCreationTokens: 30,
      costUsd: 0.031,
    });
    expect(snapshot.projects[0]).toMatchObject({
      name: "token-pulse",
      totalTokens: 7000,
      sessions: null,
      lastActivityAt: "2026-09-17T23:59:59Z",
    });
  });

  test("rejects an unknown major dashboard schema", () => {
    expect(() =>
      normalizeCodexBar(
        { ...dashboardFixture, schemaVersion: 2 },
        [],
        "fixture",
      ),
    ).toThrow("Unsupported CodexBar dashboard schema");
  });

  test("rejects a non-loopback CodexBar URL", () => {
    expect(() =>
      loadConfig({
        TOKEN_PULSE_SOURCE: "http",
        CODEXBAR_URL: "https://collector.example.com",
      }),
    ).toThrow("loopback host");
  });
});
