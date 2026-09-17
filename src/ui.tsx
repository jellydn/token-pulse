import type { FC } from "hono/jsx";
import type {
  AccountState,
  DashboardData,
  ProviderState,
  UsageTotals,
} from "./types";

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function duration(until: string | null): string {
  if (!until) return "Reset unknown";
  const parsed = new Date(until).getTime();
  if (Number.isNaN(parsed)) return "Reset unknown";
  const milliseconds = parsed - Date.now();
  if (milliseconds <= 0) return "Reset due";
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  if (hours >= 24) return `Resets in ${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `Resets in ${hours}h ${minutes}m`;
}

export function relative(value: string | null): string {
  if (!value) return "Unknown";
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return "Unknown";
  const days = Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function change(value: number | null): string {
  if (value === null) return "No prior data";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}% vs prior`;
}

export function clampPercent(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(1, value));
}

function usageLevel(
  windows: Array<{ usedPercent: number }>,
): "critical" | "warning" | "ok" | null {
  if (windows.length === 0) return null;
  const worst = Math.max(
    ...windows.map((window) =>
      Number.isFinite(window.usedPercent) ? window.usedPercent : 0,
    ),
  );
  if (worst >= 100) return "critical";
  if (worst >= 80) return "warning";
  return "ok";
}

function usageLabel(windows: Array<{ usedPercent: number }>): string | null {
  const level = usageLevel(windows);
  if (!level) return null;
  if (level === "critical") return "Limit reached";
  if (level === "warning") return "High usage";
  return "Ready";
}

const StatusDot: FC<{ provider: ProviderState }> = ({ provider }) => {
  if (provider.error) {
    return (
      <span class="inline-flex items-center gap-2 text-xs text-slate-400">
        <span class="h-2 w-2 rounded-full bg-rose-400" />
        {provider.error}
      </span>
    );
  }
  if (provider.status) {
    const color = {
      ok: "bg-emerald-400",
      warning: "bg-amber-400",
      critical: "bg-rose-400",
      unknown: "bg-slate-500",
    }[provider.status.level];
    return (
      <span class="inline-flex items-center gap-2 text-xs text-slate-400">
        <span class={`h-2 w-2 rounded-full ${color}`} />
        {provider.status.label}
      </span>
    );
  }
  const label = usageLabel(provider.windows);
  if (!label) return null;
  const color = {
    Ready: "bg-emerald-400",
    "High usage": "bg-amber-400",
    "Limit reached": "bg-rose-400",
  }[label];
  return (
    <span class="inline-flex items-center gap-2 text-xs text-slate-400">
      <span class={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
};

const WindowBars: FC<{ windows: AccountState["windows"] }> = ({ windows }) =>
  windows.length === 0 ? (
    <p class="rounded-xl bg-white/3 p-4 text-sm text-slate-400">
      No limit windows reported.
    </p>
  ) : (
    <div class="space-y-5">
      {windows.map((window) => (
        <div>
          <div class="mb-2 flex items-end justify-between">
            <div>
              <span class="text-sm font-medium text-slate-200">
                {window.label}
              </span>
              <p class="mt-0.5 text-xs text-slate-500">
                {duration(window.resetAt)}
              </p>
            </div>
            <span class="font-mono text-lg font-semibold text-teal-300">
              {Number.isFinite(window.remainingPercent)
                ? Math.round(window.remainingPercent)
                : 0}
              %
              <span class="ml-1 text-[0.65rem] font-normal text-slate-500">
                LEFT
              </span>
            </span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              class={`h-full rounded-full ${window.remainingPercent < 20 ? "bg-rose-400" : "bg-teal-400"}`}
              style={`width:${clampPercent(window.remainingPercent)}%`}
            />
          </div>
        </div>
      ))}
    </div>
  );

const AccountBlock: FC<{ account: AccountState }> = ({ account }) => {
  const label = usageLabel(account.windows);
  const color =
    label === "Limit reached"
      ? "bg-rose-400"
      : label === "High usage"
        ? "bg-amber-400"
        : "bg-emerald-400";
  return (
    <div class="rounded-xl bg-white/3 p-4">
      <div class="mb-4 flex items-center justify-between gap-4">
        <p class="truncate text-sm font-medium text-slate-200">
          {account.label}
        </p>
        {label && (
          <span class="inline-flex shrink-0 items-center gap-2 text-xs text-slate-400">
            <span class={`h-2 w-2 rounded-full ${color}`} />
            {label}
          </span>
        )}
      </div>
      <WindowBars windows={account.windows} />
    </div>
  );
};

const ProviderCard: FC<{ provider: ProviderState }> = ({ provider }) => (
  <article class="panel p-5 sm:p-6">
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <p class="metric-label">Provider</p>
        <h2 class="mt-1 text-xl font-semibold text-white">{provider.name}</h2>
      </div>
      <StatusDot provider={provider} />
    </div>
    {provider.accounts && provider.accounts.length > 0 ? (
      <div class="space-y-4">
        {provider.accounts.map((account) => (
          <AccountBlock account={account} />
        ))}
      </div>
    ) : (
      <WindowBars windows={provider.windows} />
    )}
  </article>
);

const MetricCard: FC<{
  label: string;
  totals: UsageTotals;
  note?: string;
  emphasis?: boolean;
}> = ({ label, totals, note, emphasis }) => (
  <article
    class={`panel p-5 ${emphasis ? "border-teal-400/20 bg-teal-400/5" : ""}`}
  >
    <p class="metric-label">{label}</p>
    <div class="mt-3 flex items-end justify-between gap-3">
      <strong class="font-mono text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        {compact.format(totals.tokens)}
      </strong>
      <span class="mb-1 font-mono text-sm text-teal-300">
        {dollars.format(totals.costUsd)}
      </span>
    </div>
    <p class="mt-2 text-xs text-slate-500">
      {note ?? "tokens · estimated cost"}
    </p>
  </article>
);

const SubscriptionCard: FC<{
  subscriptions: DashboardData["subscriptions"];
  totalUsd: number;
}> = ({ subscriptions, totalUsd }) => (
  <article class="panel p-5 sm:p-6">
    <div class="flex items-start justify-between gap-4">
      <div>
        <p class="metric-label">Monthly subscriptions</p>
        <h2 class="mt-1 text-base font-semibold text-white">
          All subscription costs
        </h2>
      </div>
      <strong class="font-mono text-2xl font-semibold tracking-tight text-teal-300">
        {dollars.format(totalUsd)}
      </strong>
    </div>
    {subscriptions.length > 0 ? (
      <ul class="mt-5 divide-y divide-white/6 border-t border-white/6">
        {subscriptions.map((subscription) => (
          <li class="flex items-center justify-between gap-4 py-3 text-sm">
            <span class="text-slate-300">{subscription.name}</span>
            <span class="font-mono text-slate-400">
              {dollars.format(subscription.monthlyUsd)}
            </span>
          </li>
        ))}
      </ul>
    ) : (
      <p class="mt-4 text-sm text-slate-500">
        Add subscriptions with TOKEN_PULSE_SUBSCRIPTIONS to track monthly costs.
      </p>
    )}
  </article>
);

const BurnChart: FC<{
  title: string;
  unit: "tokens" | "cost";
  data: DashboardData["history30"];
}> = ({ title, unit, data }) => {
  const values = data.map((day) =>
    unit === "tokens" ? day.tokens : day.costUsd,
  );
  const maximum = Math.max(...values, 1);
  return (
    <article class="panel p-5 sm:p-6">
      <div class="mb-5 flex items-baseline justify-between">
        <div>
          <p class="metric-label">Daily burn</p>
          <h2 class="mt-1 text-base font-semibold text-white">{title}</h2>
        </div>
        <span class="text-xs text-slate-500">{data.length} days</span>
      </div>
      <div
        class="flex h-32 items-end gap-1"
        role="img"
        aria-label={`${title} bar chart`}
      >
        {values.map((value, index) => (
          <div
            class="group relative min-w-0 flex-1 rounded-t-sm bg-teal-400/70 transition hover:bg-teal-300"
            style={`height:${Math.max(3, (value / maximum) * 100)}%`}
            title={`${data[index]?.date}: ${unit === "tokens" ? compact.format(value) : dollars.format(value)}`}
          />
        ))}
      </div>
      <div class="mt-2 flex justify-between font-mono text-[0.65rem] text-slate-600">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data.at(-1)?.date.slice(5)}</span>
      </div>
    </article>
  );
};

const Breakdown: FC<{ totals: UsageTotals }> = ({ totals }) => {
  const parts = [
    ["Input", totals.inputTokens, "bg-sky-400"],
    ["Output", totals.outputTokens, "bg-violet-400"],
    ["Cache", totals.cacheTokens, "bg-teal-400"],
    ["Reasoning", totals.reasoningTokens, "bg-amber-400"],
  ] as const;
  const denominator = Math.max(
    parts.reduce((sum, [, value]) => sum + value, 0),
    1,
  );
  return (
    <article class="panel p-5 sm:p-6">
      <p class="metric-label">This month</p>
      <h2 class="mt-1 text-base font-semibold text-white">Token breakdown</h2>
      <div class="mt-6 flex h-3 overflow-hidden rounded-full bg-slate-800">
        {parts.map(([, value, color]) => (
          <div class={color} style={`width:${(value / denominator) * 100}%`} />
        ))}
      </div>
      <div class="mt-6 grid grid-cols-2 gap-4">
        {parts.map(([label, value, color]) => (
          <div>
            <p class="flex items-center gap-2 text-xs text-slate-500">
              <span class={`h-2 w-2 rounded-full ${color}`} /> {label}
            </p>
            <p class="mt-1 font-mono text-sm text-slate-200">
              {compact.format(value)}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
};

export const Dashboard: FC<{ data: DashboardData }> = ({ data }) => {
  if (!data.capturedAt) {
    return (
      <div class="panel p-12 text-center">
        <div class="mx-auto mb-4 h-3 w-3 animate-pulse rounded-full bg-teal-400" />
        <h2 class="text-lg font-semibold text-white">
          Waiting for the first snapshot
        </h2>
        <p class="mt-2 text-sm text-slate-500">
          Token Pulse will retry automatically.
        </p>
      </div>
    );
  }

  return (
    <div class="space-y-6">
      {data.message && (
        <div
          class={`rounded-xl border px-4 py-3 text-sm ${data.degraded ? "border-amber-400/20 bg-amber-400/8 text-amber-200" : "border-sky-400/20 bg-sky-400/8 text-sky-200"}`}
          role="status"
        >
          {data.message}
        </div>
      )}
      <section class="grid gap-4 lg:grid-cols-2">
        {data.providers.map((provider) => (
          <ProviderCard provider={provider} />
        ))}
      </section>
      <section class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Today" totals={data.today} emphasis />
        <MetricCard
          label="Last 7 days"
          totals={data.week}
          note={change(data.weekChange)}
        />
        <MetricCard
          label="Last 30 days"
          totals={data.month}
          note={change(data.monthChange)}
        />
      </section>
      <SubscriptionCard
        subscriptions={data.subscriptions}
        totalUsd={data.subscriptionTotalUsd}
      />
      <section class="grid gap-4 lg:grid-cols-3">
        <div class="lg:col-span-2">
          <BurnChart
            title="Token volume · 30 days"
            unit="tokens"
            data={data.history30}
          />
        </div>
        <Breakdown totals={data.month} />
      </section>
      <section class="grid gap-4 lg:grid-cols-2">
        <BurnChart
          title="Estimated cost · 7 days"
          unit="cost"
          data={data.history7}
        />
        <div class="panel flex flex-col justify-between p-5 sm:p-6">
          <div>
            <p class="metric-label">Coverage</p>
            <h2 class="mt-1 text-base font-semibold text-white">
              Local, durable history
            </h2>
            <p class="mt-3 max-w-lg text-sm leading-6 text-slate-400">
              Snapshots stay in local SQLite. Token Pulse does not read or store
              provider credentials.
            </p>
          </div>
          <div class="mt-8 flex items-center justify-between border-t border-white/8 pt-4 text-xs text-slate-500">
            <span>{data.source}</span>
            <span>Updated {relative(data.capturedAt)}</span>
          </div>
        </div>
      </section>
    </div>
  );
};

function kindleTimestamp(value: string | null): string {
  if (!value) return "Waiting for data";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Update time unknown";
  return `${parsed.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const KindleWindows: FC<{ windows: AccountState["windows"] }> = ({
  windows,
}) =>
  windows.length === 0 ? (
    <p class="kindle-empty">No limit windows reported</p>
  ) : (
    <div class="kindle-windows">
      {windows.map((window) => (
        <div class="kindle-window">
          <div class="kindle-window-heading">
            <strong>{window.label}</strong>
            <strong class="kindle-percent">
              {Number.isFinite(window.remainingPercent)
                ? Math.round(window.remainingPercent)
                : 0}
              % left
            </strong>
          </div>
          <div class="kindle-meter" aria-hidden="true">
            <span
              class="kindle-meter-fill"
              style={`width:${clampPercent(window.remainingPercent)}%`}
            />
          </div>
          <p class="kindle-reset">{duration(window.resetAt)}</p>
        </div>
      ))}
    </div>
  );

const KindleProvider: FC<{ provider: ProviderState }> = ({ provider }) => (
  <section class="kindle-section kindle-provider">
    <div class="kindle-section-heading">
      <h2>{provider.name}</h2>
      <span>{provider.error ?? provider.status?.label ?? "Usage limits"}</span>
    </div>
    {provider.accounts && provider.accounts.length > 0 ? (
      <div>
        {provider.accounts.map((account) => (
          <div class="kindle-account">
            <h3>{account.label}</h3>
            <KindleWindows windows={account.windows} />
          </div>
        ))}
      </div>
    ) : (
      <KindleWindows windows={provider.windows} />
    )}
  </section>
);

export const KindleDashboard: FC<{ data: DashboardData }> = ({ data }) => {
  if (!data.capturedAt) {
    return (
      <section class="kindle-section kindle-empty-state">
        <h2>Waiting for the first snapshot</h2>
        <p>Token Pulse will retry automatically.</p>
      </section>
    );
  }

  return (
    <div>
      {data.message && (
        <p class="kindle-notice" role="status">
          {data.message}
        </p>
      )}
      {data.providers.length > 0 ? (
        data.providers.map((provider) => <KindleProvider provider={provider} />)
      ) : (
        <section class="kindle-section kindle-empty-state">
          <h2>No providers available</h2>
          <p>Check the CodexBar connection on the Token Pulse host.</p>
        </section>
      )}
      <section class="kindle-summary" aria-label="Today's usage summary">
        <div class="kindle-stat">
          <span>Tokens today</span>
          <strong>{compact.format(data.today.tokens)}</strong>
        </div>
        <div class="kindle-stat">
          <span>Estimated cost</span>
          <strong>{dollars.format(data.today.costUsd)}</strong>
        </div>
        <div class="kindle-stat kindle-stat-wide">
          <span>Top project</span>
          <strong>Not reported</strong>
          <small>Project usage is not available in the normalized feed.</small>
        </div>
      </section>
      <p class="kindle-updated">
        Last updated:{" "}
        <time datetime={data.capturedAt}>
          {kindleTimestamp(data.capturedAt)}
        </time>
      </p>
    </div>
  );
};

export const KindlePage: FC<{ data: DashboardData }> = ({ data }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light" />
      <meta name="theme-color" content="#ffffff" />
      <title>Token Pulse · Kindle</title>
      <link rel="icon" type="image/x-icon" href="/favicon.ico" />
      <link rel="stylesheet" href="/assets/kindle.css" />
    </head>
    <body>
      <div class="kindle-shell">
        <header class="kindle-header">
          <div>
            <h1>Token Pulse</h1>
            <p>E-ink usage dashboard</p>
          </div>
          <button id="kindle-refresh" type="button">
            Refresh
          </button>
        </header>
        <p
          id="kindle-refresh-status"
          class="kindle-refresh-status"
          aria-live="polite"
        >
          Auto-refreshes every 10 minutes
        </p>
        <main id="kindle-dashboard">
          <KindleDashboard data={data} />
        </main>
        <noscript>
          <p class="kindle-noscript">
            Automatic updates need JavaScript. <a href="/kindle">Reload data</a>
            .
          </p>
        </noscript>
      </div>
      <script src="/assets/kindle.js" />
    </body>
  </html>
);

export const Page: FC<{ children: unknown }> = ({ children }) => (
  <html lang="en" class="bg-[#080d18]">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark" />
      <title>Token Pulse</title>
      <meta name="theme-color" content="#080d18" />
      <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
      <link rel="icon" type="image/x-icon" href="/favicon.ico" />
      <link
        rel="apple-touch-icon"
        sizes="180x180"
        href="/apple-touch-icon.png"
      />
      <link rel="manifest" href="/site.webmanifest" />
      <link rel="stylesheet" href="/assets/app.css" />
      <script src="/assets/htmx.min.js" defer />
    </head>
    <body class="min-h-screen font-sans text-slate-300 antialiased">
      <header class="border-b border-white/6">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div class="flex items-center gap-3">
            <img
              src="/assets/logo.svg"
              alt="Token Pulse logo"
              class="h-9 w-9"
            />
            <div>
              <h1 class="text-base font-semibold tracking-tight text-white">
                Token Pulse
              </h1>
              <p class="text-[0.65rem] tracking-widest text-slate-600 uppercase">
                Usage dashboard
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-500">
            <span class="h-2 w-2 rounded-full bg-emerald-400" /> Local collector
          </div>
        </div>
      </header>
      <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {children as never}
      </main>
      <footer class="mx-auto max-w-7xl px-4 pb-10 text-center text-xs text-slate-700">
        Credentials remain in CodexBar · Data remains in local SQLite
      </footer>
    </body>
  </html>
);
