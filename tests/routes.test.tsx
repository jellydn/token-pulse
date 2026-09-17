import { afterEach, describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { Storage } from "../src/storage";
import { storageFixture } from "./fixtures";

const stores: Storage[] = [];

function setup(): { storage: Storage; app: ReturnType<typeof createApp> } {
  const storage = new Storage(":memory:");
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
    expect(html).toContain("Project usage");
    expect(html).toContain("Last 30 days");
  });

  test("returns a sortable partial", async () => {
    const { app } = setup();
    const response = await app.request("/partials/dashboard?sort=cost");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html.indexOf("small-recent")).toBeLessThan(
      html.indexOf("large-old"),
    );
    expect(html).not.toContain("<html");
  });

  test("returns JSON data and health", async () => {
    const { app } = setup();
    const dashboard = await app.request("/api/dashboard");
    const health = await app.request("/healthz");

    expect((await dashboard.json()).history30).toHaveLength(30);
    expect(await health.json()).toEqual({ status: "ok" });
  });
});
