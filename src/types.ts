export type StatusLevel = "ok" | "warning" | "critical" | "unknown";

export interface LimitWindow {
  kind: string;
  label: string;
  usedPercent: number;
  remainingPercent: number;
  resetAt: string | null;
}

export interface AccountState {
  label: string;
  windows: LimitWindow[];
  updatedAt: string | null;
}

export interface ProviderState {
  id: string;
  name: string;
  source: string;
  status: {
    level: StatusLevel;
    label: string;
    updatedAt: string | null;
  } | null;
  windows: LimitWindow[];
  accounts: AccountState[] | null;
  error: string | null;
  updatedAt: string | null;
}

export interface DailyUsage {
  provider: string;
  date: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheCreationTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
}

export interface NormalizedSnapshot {
  capturedAt: string;
  source: string;
  providers: ProviderState[];
  daily: DailyUsage[];
  degraded: boolean;
  message: string | null;
}

export interface UsageTotals {
  tokens: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  reasoningTokens: number;
}

export interface Subscription {
  name: string;
  monthlyUsd: number;
}

export interface DashboardData {
  capturedAt: string | null;
  source: string | null;
  providers: ProviderState[];
  subscriptions: Subscription[];
  subscriptionTotalUsd: number;
  today: UsageTotals;
  week: UsageTotals;
  month: UsageTotals;
  weekChange: number | null;
  monthChange: number | null;
  history7: Array<{ date: string; tokens: number; costUsd: number }>;
  history30: Array<{ date: string; tokens: number; costUsd: number }>;
  degraded: boolean;
  message: string | null;
}
