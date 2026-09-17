import { afterEach, describe, expect, test } from "bun:test";
import { Storage } from "../src/storage";
import { storageFixture } from "./fixtures";

const stores: Storage[] = [];

function store(): Storage {
  const storage = new Storage(":memory:");
  stores.push(storage);
  return storage;
}

afterEach(() => {
  for (const storage of stores.splice(0)) storage.close();
});

describe("SQLite storage and aggregates", () => {
  test("persists snapshots but replaces cumulative daily observations", () => {
    const storage = store();
    const fixture = storageFixture();
    storage.save(fixture);
    storage.save({
      ...fixture,
      capturedAt: new Date(Date.now() + 1000).toISOString(),
    });

    expect(
      storage.db.query("SELECT count(*) count FROM snapshots").get(),
    ).toEqual({ count: 2 });
    expect(
      storage.db.query("SELECT count(*) count FROM daily_usage").get(),
    ).toEqual({ count: 60 });
    expect(storage.dashboard().today.tokens).toBe(100);
  });

  test("calculates current and prior periods independently", () => {
    const storage = store();
    storage.save(storageFixture());
    const dashboard = storage.dashboard();

    expect(dashboard.week.tokens).toBe(700);
    expect(dashboard.weekChange).toBe(100);
    expect(dashboard.month.tokens).toBe(1850);
    expect(dashboard.history7).toHaveLength(7);
    expect(dashboard.history30).toHaveLength(30);
  });

  test("sorts projects by tokens, cost, and recent activity", () => {
    const storage = store();
    storage.save(storageFixture());

    expect(storage.dashboard("tokens").projects[0]?.name).toBe("large-old");
    expect(storage.dashboard("cost").projects[0]?.name).toBe("small-recent");
    expect(storage.dashboard("recent").projects[0]?.name).toBe("small-recent");
  });

  test("preserves the last good data when collection fails", () => {
    const storage = store();
    storage.save(storageFixture());
    storage.recordFailure("test", "collector offline");

    const dashboard = storage.dashboard();
    expect(dashboard.capturedAt).not.toBeNull();
    expect(dashboard.degraded).toBe(true);
    expect(dashboard.message).toBe("collector offline");
  });
});
