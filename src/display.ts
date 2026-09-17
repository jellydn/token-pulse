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

export interface DisplayProject {
  name: string;
  tokens: number;
}

export interface DisplayModel {
  updatedAt: string | null;
  degraded: boolean;
  message: string | null;
  providers: DisplayProvider[];
  today: {
    tokens: number;
    cost: number;
  };
  /** Always null while the normalized CodexBar feed omits project aggregation. */
  topProject: DisplayProject | null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
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

function collectProviderWindows(provider: ProviderState): DisplayWindow[] {
  if (provider.accounts && provider.accounts.length > 0) {
    return provider.accounts.flatMap((account) =>
      account.windows.map(mapWindow),
    );
  }
  return provider.windows.map(mapWindow);
}

function mapProvider(provider: ProviderState): DisplayProvider {
  const windows = collectProviderWindows(provider);
  const headline = headlineFromWindows(windows);
  return {
    name: provider.name,
    remainingPercent: headline.remainingPercent,
    resetAt: headline.resetAt,
    statusLabel: provider.error ?? provider.status?.label ?? null,
    windows:
      provider.accounts && provider.accounts.length > 0
        ? []
        : provider.windows.map(mapWindow),
    accounts:
      provider.accounts && provider.accounts.length > 0
        ? provider.accounts.map(mapAccount)
        : null,
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
