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

  test("preserves the last good data when collection fails", () => {
    const storage = store();
    storage.save(storageFixture());
    storage.recordFailure("test", "collector offline");

    const dashboard = storage.dashboard();
    expect(dashboard.capturedAt).not.toBeNull();
    expect(dashboard.degraded).toBe(true);
    expect(dashboard.message).toBe("collector offline");
  });

  test("falls back to the previous good snapshot when the latest payload is corrupt", () => {
    const storage = store();
    const good = {
      ...storageFixture(),
      capturedAt: "2026-09-16T12:00:00.000Z",
      providers: [
        {
          id: "codex",
          name: "Codex",
          source: "test",
          status: null,
          windows: [],
          accounts: null,
          error: null,
          updatedAt: null,
        },
      ],
    };
    storage.save(good);
    storage.save({
      ...storageFixture(),
      capturedAt: "2026-09-17T12:00:00.000Z",
      providers: [],
    });
    storage.db
      .query(
        "UPDATE snapshots SET payload_json = 'not-json{' WHERE id = (SELECT MAX(id) FROM snapshots)",
      )
      .run();

    const dashboard = storage.dashboard();
    expect(dashboard.providers).toEqual(good.providers);
    expect(dashboard.capturedAt).toBe(good.capturedAt);
  });

  test("serves degraded empty providers when no stored snapshot parses", () => {
    const storage = store();
    storage.save(storageFixture());
    storage.db.query("UPDATE snapshots SET payload_json = 'corrupt'").run();

    const dashboard = storage.dashboard();
    expect(dashboard.providers).toEqual([]);
    expect(dashboard.degraded).toBe(true);
    expect(dashboard.message).toBe("Stored snapshot is unreadable");
    expect(dashboard.today.tokens).toBe(100);
  });

  test("prunes snapshots to the newest 1000 rows without touching daily usage", () => {
    const storage = store();
    const insert = storage.db.query(
      "INSERT INTO snapshots (captured_at, source, degraded, message, payload_json) VALUES (?, ?, 0, NULL, ?)",
    );
    for (let index = 0; index < 1005; index += 1) {
      insert.run(
        `2026-01-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
        "seed",
        "{}",
      );
    }
    storage.save(storageFixture());

    expect(
      storage.db.query("SELECT count(*) count FROM snapshots").get(),
    ).toEqual({
      count: 1000,
    });
    expect(
      storage.db.query("SELECT count(*) count FROM daily_usage").get(),
    ).toEqual({ count: 60 });
    expect(
      storage.db.query("SELECT MIN(id) minId FROM snapshots").get(),
    ).toEqual({ minId: 7 });
  });
});
