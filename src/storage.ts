import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  DashboardData,
  NormalizedSnapshot,
  Subscription,
  UsageTotals,
} from "./types";

const EMPTY_TOTALS: UsageTotals = {
  tokens: 0,
  costUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheTokens: 0,
  reasoningTokens: 0,
};

interface DailyRow {
  date: string;
  total_tokens: number | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  reasoning_tokens: number | null;
}

interface SnapshotRow {
  captured_at: string;
  source: string;
  degraded: number;
  message: string | null;
  payload_json: string | null;
}

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function totalRows(rows: DailyRow[]): UsageTotals {
  return rows.reduce<UsageTotals>(
    (total, row) => ({
      tokens: total.tokens + (row.total_tokens ?? 0),
      costUsd: total.costUsd + (row.cost_usd ?? 0),
      inputTokens: total.inputTokens + (row.input_tokens ?? 0),
      outputTokens: total.outputTokens + (row.output_tokens ?? 0),
      cacheTokens:
        total.cacheTokens +
        (row.cache_read_tokens ?? 0) +
        (row.cache_creation_tokens ?? 0),
      reasoningTokens: total.reasoningTokens + (row.reasoning_tokens ?? 0),
    }),
    { ...EMPTY_TOTALS },
  );
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export class Storage {
  readonly db: Database;
  private readonly subscriptions: Subscription[];

  constructor(path: string, subscriptions: Subscription[] = []) {
    this.subscriptions = subscriptions.map((subscription) => ({
      ...subscription,
    }));
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY,
        captured_at TEXT NOT NULL,
        source TEXT NOT NULL,
        degraded INTEGER NOT NULL DEFAULT 0,
        message TEXT,
        payload_json TEXT
      );
      CREATE TABLE IF NOT EXISTS daily_usage (
        provider TEXT NOT NULL,
        date TEXT NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_read_tokens INTEGER,
        cache_creation_tokens INTEGER,
        reasoning_tokens INTEGER,
        total_tokens INTEGER,
        cost_usd REAL,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (provider, date)
      );
      CREATE INDEX IF NOT EXISTS snapshots_captured_at ON snapshots(captured_at DESC);
      CREATE INDEX IF NOT EXISTS daily_usage_date ON daily_usage(date);
    `);
  }

  save(snapshot: NormalizedSnapshot): void {
    const transaction = this.db.transaction(() => {
      this.db
        .query(
          "INSERT INTO snapshots (captured_at, source, degraded, message, payload_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          snapshot.capturedAt,
          snapshot.source,
          snapshot.degraded ? 1 : 0,
          snapshot.message,
          JSON.stringify(snapshot),
        );
      const dailyStatement = this.db.query(`
        INSERT INTO daily_usage
          (provider, date, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, reasoning_tokens, total_tokens, cost_usd, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, date) DO UPDATE SET
          input_tokens=excluded.input_tokens, output_tokens=excluded.output_tokens,
          cache_read_tokens=excluded.cache_read_tokens, cache_creation_tokens=excluded.cache_creation_tokens,
          reasoning_tokens=excluded.reasoning_tokens, total_tokens=excluded.total_tokens,
          cost_usd=excluded.cost_usd, observed_at=excluded.observed_at
      `);
      for (const day of snapshot.daily) {
        dailyStatement.run(
          day.provider,
          day.date,
          day.inputTokens,
          day.outputTokens,
          day.cacheReadTokens,
          day.cacheCreationTokens,
          day.reasoningTokens,
          day.totalTokens,
          day.costUsd,
          snapshot.capturedAt,
        );
      }
      this.db
        .query(
          "DELETE FROM snapshots WHERE id < (SELECT COALESCE(MAX(id) - 999, 0) FROM snapshots)",
        )
        .run();
    });
    transaction();
  }

  recordFailure(source: string, message: string): void {
    this.db
      .query(
        "INSERT INTO snapshots (captured_at, source, degraded, message, payload_json) VALUES (?, ?, 1, ?, NULL)",
      )
      .run(new Date().toISOString(), source, message);
  }

  dashboard(): DashboardData {
    const latestEvent = this.db
      .query<SnapshotRow, []>(
        "SELECT captured_at, source, degraded, message, payload_json FROM snapshots ORDER BY id DESC LIMIT 1",
      )
      .get();
    const latestSuccessRows = this.db
      .query<SnapshotRow, []>(
        "SELECT captured_at, source, degraded, message, payload_json FROM snapshots WHERE payload_json IS NOT NULL ORDER BY id DESC",
      )
      .all();
    let snapshot: NormalizedSnapshot | null = null;
    let snapshotRow: SnapshotRow | null = null;
    for (const row of latestSuccessRows) {
      if (!row.payload_json) continue;
      try {
        snapshot = JSON.parse(row.payload_json) as NormalizedSnapshot;
        snapshotRow = row;
        break;
      } catch {}
    }
    const unreadable = latestSuccessRows.length > 0 && snapshotRow === null;
    const rows = this.db
      .query<DailyRow, [string]>(`SELECT date,
        SUM(total_tokens) total_tokens, SUM(cost_usd) cost_usd, SUM(input_tokens) input_tokens,
        SUM(output_tokens) output_tokens, SUM(cache_read_tokens) cache_read_tokens,
        SUM(cache_creation_tokens) cache_creation_tokens, SUM(reasoning_tokens) reasoning_tokens
        FROM daily_usage WHERE date >= ? GROUP BY date ORDER BY date`)
      .all(dateDaysAgo(59));
    const byDate = new Map(rows.map((row) => [row.date, row]));
    const range = (start: number, end: number) =>
      Array.from({ length: end - start + 1 }, (_, index) =>
        byDate.get(dateDaysAgo(start + index)),
      ).filter((row): row is DailyRow => row !== undefined);
    const history = (days: number) =>
      Array.from({ length: days }, (_, index) => {
        const date = dateDaysAgo(days - index - 1);
        const row = byDate.get(date);
        return {
          date,
          tokens: row?.total_tokens ?? 0,
          costUsd: row?.cost_usd ?? 0,
        };
      });
    const week = totalRows(range(0, 6));
    const priorWeek = totalRows(range(7, 13));
    const month = totalRows(range(0, 29));
    const priorMonth = totalRows(range(30, 59));
    return {
      capturedAt: snapshotRow?.captured_at ?? null,
      source: snapshotRow?.source ?? null,
      providers: snapshot?.providers ?? [],
      subscriptions: this.subscriptions.map((subscription) => ({
        ...subscription,
      })),
      subscriptionTotalUsd: this.subscriptions.reduce(
        (total, subscription) => total + subscription.monthlyUsd,
        0,
      ),
      today: totalRows(range(0, 0)),
      week,
      month,
      weekChange: percentChange(week.tokens, priorWeek.tokens),
      monthChange: percentChange(month.tokens, priorMonth.tokens),
      history7: history(7),
      history30: history(30),
      degraded: unreadable ? true : latestEvent?.degraded === 1,
      message: unreadable
        ? "Stored snapshot is unreadable"
        : (latestEvent?.message ?? null),
    };
  }

  close(): void {
    this.db.close();
  }
}
