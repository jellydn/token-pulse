import { clampPercent } from "./percent";
import type {
  AccountState,
  DashboardData,
  LimitWindow,
  ProviderState,
} from "./types";

/** Compact monochrome-display payload shared by Kindle-oriented clients and ESP32. */
export interface DisplayWindow {
  label: string;
  remainingPercent: number;
  resetAt: string | null;
}

export interface DisplayAccount {
  label: string;
  windows: DisplayWindow[];
}

export interface DisplayProvider {
  name: string;
  /** Headline remaining % for small screens (lowest remaining among windows). */
  remainingPercent: number | null;
  resetAt: string | null;
  statusLabel: string | null;
  windows: DisplayWindow[];
  accounts: DisplayAccount[] | null;
}

export interface DisplayModel {
  updatedAt: string | null;
  degraded: boolean;
  message: string | null;
  providers: DisplayProvider[];
  today: {
    tokens: number;
    /** Estimated cost in USD (dashboard `costUsd`). */
    cost: number;
  };
  /** Null until the normalized feed reports project aggregation. */
  topProject: null;
}

function mapWindow(window: LimitWindow): DisplayWindow {
  return {
    label: window.label,
    remainingPercent: clampPercent(window.remainingPercent),
    resetAt: window.resetAt,
  };
}

function mapAccount(account: AccountState): DisplayAccount {
  return {
    // Labels are already masked at CodexBar ingestion (emails); non-email labels pass through.
    label: account.label,
    windows: account.windows.map(mapWindow),
  };
}

/** Prefer the tightest remaining window as the provider headline metric. */
function headlineFromWindows(windows: DisplayWindow[]): {
  remainingPercent: number | null;
  resetAt: string | null;
} {
  if (windows.length === 0) {
    return { remainingPercent: null, resetAt: null };
  }
  let lowest = windows[0];
  for (const window of windows.slice(1)) {
    if (window.remainingPercent < lowest.remainingPercent) lowest = window;
  }
  return {
    remainingPercent: lowest.remainingPercent,
    resetAt: lowest.resetAt,
  };
}

function mapProvider(provider: ProviderState): DisplayProvider {
  const sourceAccounts = provider.accounts ?? [];
  const hasAccounts = sourceAccounts.length > 0;
  const accounts = hasAccounts ? sourceAccounts.map(mapAccount) : null;
  const windows = hasAccounts ? [] : provider.windows.map(mapWindow);
  const headlineWindows =
    accounts !== null
      ? accounts.flatMap((account) => account.windows)
      : windows;
  const headline = headlineFromWindows(headlineWindows);
  return {
    name: provider.name,
    remainingPercent: headline.remainingPercent,
    resetAt: headline.resetAt,
    statusLabel: provider.error ?? provider.status?.label ?? null,
    windows,
    accounts,
  };
}

/**
 * Build a display-safe subset of dashboard data.
 * Omits history, subscriptions, source mode, and any credential-bearing fields.
 */
export function toDisplayModel(data: DashboardData): DisplayModel {
  return {
    updatedAt: data.capturedAt,
    degraded: data.degraded,
    message: data.message,
    providers: data.providers.map(mapProvider),
    today: {
      tokens: data.today.tokens,
      cost: data.today.costUsd,
    },
    topProject: null,
  };
}
