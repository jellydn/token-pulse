import { describe, expect, test } from "bun:test";
import {
  attachCodexAccounts,
  normalizeCodexAccounts,
  normalizeCodexBar,
  runJson,
} from "../src/codexbar";
import { loadConfig } from "../src/config";
import {
  codexAccountsFixture,
  costFixture,
  dashboardFixture,
} from "./fixtures";

describe("CodexBar normalization", () => {
  test("keeps limits, token mix, and costs", () => {
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
    expect(snapshot.providers[0]?.accounts).toBeNull();
  });

  test("normalizes codex multi-account windows from CLI usage", () => {
    const accounts = normalizeCodexAccounts(codexAccountsFixture);

    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toMatchObject({
      label: "d***@acx.net",
    });
    expect(accounts[0]?.windows.map((window) => window.label)).toEqual([
      "Weekly",
      "Codex Spark 5-hour",
    ]);
    expect(accounts[1]?.windows.map((window) => window.label)).toEqual([
      "5-hour",
      "Weekly",
    ]);
  });

  test("attaches codex accounts to the codex provider only", () => {
    const snapshot = attachCodexAccounts(
      normalizeCodexBar(dashboardFixture, costFixture, "fixture"),
      codexAccountsFixture,
    );

    expect(snapshot.providers[0]?.accounts).toHaveLength(2);
  });

  test("redacts account emails to first letter plus domain", () => {
    const accounts = normalizeCodexAccounts([
      { account: "dung@acx.net", usage: { primary: { usedPercent: 10 } } },
      {
        usage: {
          accountEmail: "someone@example.com",
          primary: { usedPercent: 10 },
        },
      },
      { account: "local-only", usage: { primary: { usedPercent: 10 } } },
    ]);

    expect(accounts.map((account) => account.label)).toEqual([
      "d***@acx.net",
      "s***@example.com",
      "local-only",
    ]);
  });

  test("clamps window percentages to 0..100", () => {
    const provider = dashboardFixture.providers[0] as Record<string, unknown>;
    const snapshot = normalizeCodexBar(
      {
        ...dashboardFixture,
        providers: [
          {
            ...provider,
            windows: [
              { kind: "session", label: "Over", usedPercent: 150 },
              { kind: "weekly", label: "Under", remainingPercent: 150 },
              {
                kind: "limit",
                label: "Negative",
                usedPercent: -20,
                remainingPercent: -10,
              },
            ],
          },
        ],
      },
      [],
      "fixture",
    );

    const windows = snapshot.providers[0]?.windows ?? [];
    expect(windows.map((window) => window.usedPercent)).toEqual([100, 0, 0]);
    expect(windows.map((window) => window.remainingPercent)).toEqual([
      0, 100, 0,
    ]);
    for (const window of windows) {
      expect(window.usedPercent).toBeGreaterThanOrEqual(0);
      expect(window.usedPercent).toBeLessThanOrEqual(100);
      expect(window.remainingPercent).toBeGreaterThanOrEqual(0);
      expect(window.remainingPercent).toBeLessThanOrEqual(100);
    }
  });

  test("runJson names the command and output on non-JSON stdout", async () => {
    const error = await runJson(["echo", "not-json"]).catch(
      (cause: unknown) => cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("echo");
    expect((error as Error).message).toContain("not-json");
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

  test("rejects a present-but-invalid port", () => {
    for (const port of ["abc", "0", "-5"]) {
      expect(() => loadConfig({ TOKEN_PULSE_PORT: port })).toThrow(
        "TOKEN_PULSE_PORT",
      );
    }
  });

  test("rejects present-but-invalid snapshot seconds", () => {
    for (const seconds of ["abc", "0", "-5"]) {
      expect(() =>
        loadConfig({ TOKEN_PULSE_SNAPSHOT_SECONDS: seconds }),
      ).toThrow("TOKEN_PULSE_SNAPSHOT_SECONDS");
    }
  });

  test("rejects a non-http CodexBar URL scheme", () => {
    expect(() =>
      loadConfig({
        TOKEN_PULSE_SOURCE: "http",
        CODEXBAR_URL: "file:///etc/passwd",
      }),
    ).toThrow("http:");
  });
});
