import { afterEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { attachCodexAccounts, normalizeCodexBar } from "../src/codexbar";
import { Storage } from "../src/storage";
import {
  codexAccountsFixture,
  costFixture,
  dashboardFixture,
  storageFixture,
} from "./fixtures";

const stores: Storage[] = [];

function setup(): { storage: Storage; app: ReturnType<typeof createApp> } {
  const storage = new Storage(":memory:", [
    { name: "ChatGPT Plus", monthlyUsd: 20 },
  ]);
  stores.push(storage);
  storage.save(storageFixture());
  return { storage, app: createApp(storage) };
}

afterEach(() => {
  for (const storage of stores.splice(0)) storage.close();
});

describe("key routes", () => {
  test("renders the dashboard with HTMX refresh and current data", async () => {
    const { app } = setup();
    const response = await app.request("/");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('hx-trigger="every 60s"');
    expect(html).toContain("Last 30 days");
    expect(html).toContain("ChatGPT Plus");
    expect(html).toContain("All subscription costs");
  });

  test("renders one block per codex account with usage status", async () => {
    const storage = new Storage(":memory:");
    stores.push(storage);
    storage.save(
      attachCodexAccounts(
        normalizeCodexBar(dashboardFixture, costFixture, "fixture"),
        codexAccountsFixture,
      ),
    );
    const app = createApp(storage);
    const html = await (await app.request("/")).text();

    expect(html).toContain("d***@acx.net");
    expect(html).toContain("d***@gmail.com");
    expect(html).not.toContain("dung@acx.net");
    expect(html).not.toContain("dunghd.it@gmail.com");
    expect(html).toContain("High usage");
  });

  test("returns a partial without the page shell", async () => {
    const { app } = setup();
    const response = await app.request("/partials/dashboard");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Last 30 days");
    expect(html).not.toContain("<html");
  });

  test("renders the Kindle dashboard with lightweight partial refresh", async () => {
    const { app } = setup();
    const response = await app.request("/kindle");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Token Pulse · Kindle");
    expect(html).toContain('id="kindle-dashboard"');
    expect(html).toContain("Auto-refreshes every 10 minutes");
    expect(html).toContain("Tokens today");
    expect(html).toContain("Estimated cost");
    expect(html).toContain("Top project");
    expect(html).toContain('src="/assets/kindle.js"');
    expect(html).not.toContain("CODEXBAR_DASHBOARD_TOKEN");

    expect((await app.request("/assets/kindle.css")).status).toBe(200);
    expect((await app.request("/assets/kindle.js")).status).toBe(200);
  });

  test("returns a Kindle partial without the page shell", async () => {
    const { app } = setup();
    const response = await app.request("/partials/kindle");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(html).toContain("Tokens today");
    expect(html).toContain("Last updated:");
    expect(html).not.toContain("<html");
    expect(html).not.toContain("<script");
  });

  test("returns JSON data and health", async () => {
    const { app } = setup();
    const dashboard = await app.request("/api/dashboard");
    const health = await app.request("/healthz");

    expect((await dashboard.json()).history30).toHaveLength(30);
    expect(await health.json()).toEqual({ status: "ok" });
  });

  test("sets security headers", async () => {
    const { app } = setup();
    const response = await app.request("/");

    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("same-origin");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("serves brand assets and references them in the page", async () => {
    const { app } = setup();
    const page = await (await app.request("/")).text();

    expect(page).toContain('href="/assets/favicon.svg"');
    expect(page).toContain('href="/favicon.ico"');
    expect(page).toContain('src="/assets/logo.svg"');

    for (const path of [
      "/assets/logo.svg",
      "/assets/favicon.svg",
      "/favicon.ico",
      "/apple-touch-icon.png",
      "/icon-192.png",
      "/icon-512.png",
      "/site.webmanifest",
    ]) {
      expect((await app.request(path)).status).toBe(200);
    }
  });
});
