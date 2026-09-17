import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  DashboardData,
  NormalizedSnapshot,
  ProjectUsage,
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

  constructor(path: string) {
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
      CREATE TABLE IF NOT EXISTS project_usage (
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        path TEXT,
        total_tokens INTEGER,
        cost_usd REAL,
        sessions INTEGER,
        last_activity_at TEXT,
        observed_at TEXT NOT NULL,
        PRIMARY KEY (provider, name)
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
        INSERT INTO daily_usage VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      const projectStatement = this.db.query(`
        INSERT INTO project_usage VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, name) DO UPDATE SET
          path=excluded.path, total_tokens=excluded.total_tokens, cost_usd=excluded.cost_usd,
          sessions=excluded.sessions, last_activity_at=excluded.last_activity_at, observed_at=excluded.observed_at
      `);
      for (const project of snapshot.projects) {
        projectStatement.run(
          project.provider,
          project.name,
          project.path,
          project.totalTokens,
          project.costUsd,
          project.sessions,
          project.lastActivityAt,
          snapshot.capturedAt,
        );
      }
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

  dashboard(sort: "tokens" | "cost" | "recent" = "tokens"): DashboardData {
    const latestEvent = this.db
      .query<SnapshotRow, []>(
        "SELECT captured_at, source, degraded, message, payload_json FROM snapshots ORDER BY id DESC LIMIT 1",
      )
      .get();
    const latestSuccess = this.db
      .query<SnapshotRow, []>(
        "SELECT captured_at, source, degraded, message, payload_json FROM snapshots WHERE payload_json IS NOT NULL ORDER BY id DESC LIMIT 1",
      )
      .get();
    const snapshot = latestSuccess?.payload_json
      ? (JSON.parse(latestSuccess.payload_json) as NormalizedSnapshot)
      : null;
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
    const order =
      sort === "cost"
        ? "cost_usd DESC"
        : sort === "recent"
          ? "last_activity_at DESC"
          : "total_tokens DESC";
    const projects = this.db
      .query<
        ProjectUsage,
        []
      >(`SELECT provider, name, path, total_tokens totalTokens,
        cost_usd costUsd, sessions, last_activity_at lastActivityAt FROM project_usage ORDER BY ${order}`)
      .all();

    return {
      capturedAt: latestSuccess?.captured_at ?? null,
      source: latestSuccess?.source ?? null,
      providers: snapshot?.providers ?? [],
      today: totalRows(range(0, 0)),
      week,
      month,
      weekChange: percentChange(week.tokens, priorWeek.tokens),
      monthChange: percentChange(month.tokens, priorMonth.tokens),
      history7: history(7),
      history30: history(30),
      projects,
      degraded: latestEvent?.degraded === 1,
      message: latestEvent?.message ?? null,
    };
  }

  close(): void {
    this.db.close();
  }
}
