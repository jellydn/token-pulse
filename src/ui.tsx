import type { FC } from "hono/jsx";
import type {
  DashboardData,
  ProjectUsage,
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

function duration(until: string | null): string {
  if (!until) return "Reset unknown";
  const milliseconds = new Date(until).getTime() - Date.now();
  if (milliseconds <= 0) return "Reset due";
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  if (hours >= 24) return `Resets in ${Math.floor(hours / 24)}d ${hours % 24}h`;
  return `Resets in ${hours}h ${minutes}m`;
}

function relative(value: string | null): string {
  if (!value) return "Unknown";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

function change(value: number | null): string {
  if (value === null) return "No prior data";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}% vs prior`;
}

const StatusDot: FC<{ provider: ProviderState }> = ({ provider }) => {
  const level = provider.error
    ? "critical"
    : (provider.status?.level ?? "unknown");
  const color = {
    ok: "bg-emerald-400",
    warning: "bg-amber-400",
    critical: "bg-rose-400",
    unknown: "bg-slate-500",
  }[level];
  return (
    <span class="inline-flex items-center gap-2 text-xs text-slate-400">
      <span class={`h-2 w-2 rounded-full ${color}`} />
      {provider.error ?? provider.status?.label ?? "Status unknown"}
    </span>
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
    {provider.windows.length === 0 ? (
      <p class="rounded-xl bg-white/3 p-4 text-sm text-slate-400">
        No limit windows reported.
      </p>
    ) : (
      <div class="space-y-5">
        {provider.windows.map((window) => (
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
                {Math.round(window.remainingPercent)}%
                <span class="ml-1 text-[0.65rem] font-normal text-slate-500">
                  LEFT
                </span>
              </span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                class={`h-full rounded-full ${window.remainingPercent < 20 ? "bg-rose-400" : "bg-teal-400"}`}
                style={`width:${Math.max(1, window.remainingPercent)}%`}
              />
            </div>
          </div>
        ))}
      </div>
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

const SortLink: FC<{ sort: string; label: string; active: boolean }> = ({
  sort,
  label,
  active,
}) => (
  <a
    href={`/?sort=${sort}`}
    hx-get={`/partials/dashboard?sort=${sort}`}
    hx-target="#dashboard"
    hx-push-url={`/?sort=${sort}`}
    class={`rounded-lg px-3 py-1.5 text-xs transition ${active ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-200"}`}
  >
    {label}
  </a>
);

const Projects: FC<{ projects: ProjectUsage[]; sort: string }> = ({
  projects,
  sort,
}) => (
  <section class="panel overflow-hidden">
    <div class="flex flex-col gap-4 border-b border-white/8 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p class="metric-label">Attribution</p>
        <h2 class="mt-1 text-lg font-semibold text-white">Project usage</h2>
      </div>
      <nav class="flex rounded-xl bg-black/20 p-1" aria-label="Sort projects">
        <SortLink sort="tokens" label="Tokens" active={sort === "tokens"} />
        <SortLink sort="cost" label="Cost" active={sort === "cost"} />
        <SortLink sort="recent" label="Recent" active={sort === "recent"} />
      </nav>
    </div>
    {projects.length === 0 ? (
      <p class="p-8 text-center text-sm text-slate-500">
        Project attribution is not available from the configured provider.
      </p>
    ) : (
      <>
        <div class="divide-y divide-white/5 sm:hidden">
          {projects.map((project) => (
            <article class="p-5">
              <div class="flex items-start justify-between gap-4">
                <div class="min-w-0">
                  <p class="truncate font-medium text-slate-200">
                    {project.name}
                  </p>
                  <p class="mt-1 truncate font-mono text-[0.65rem] text-slate-600">
                    {project.provider} · {project.path ?? "path unavailable"}
                  </p>
                </div>
                <span class="shrink-0 text-xs text-slate-500">
                  {relative(project.lastActivityAt)}
                </span>
              </div>
              <dl class="mt-4 grid grid-cols-3 gap-3">
                <div>
                  <dt class="metric-label">Tokens</dt>
                  <dd class="mt-1 font-mono text-sm text-slate-300">
                    {project.totalTokens === null
                      ? "—"
                      : compact.format(project.totalTokens)}
                  </dd>
                </div>
                <div>
                  <dt class="metric-label">Est. cost</dt>
                  <dd class="mt-1 font-mono text-sm text-teal-300">
                    {project.costUsd === null
                      ? "—"
                      : dollars.format(project.costUsd)}
                  </dd>
                </div>
                <div>
                  <dt class="metric-label">Sessions</dt>
                  <dd class="mt-1 text-sm text-slate-500">
                    {project.sessions ?? "—"}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        <div class="hidden overflow-x-auto sm:block">
          <table class="w-full min-w-[42rem] text-left text-sm">
            <thead class="text-[0.65rem] tracking-widest text-slate-600 uppercase">
              <tr>
                <th class="px-6 py-3 font-medium">Project</th>
                <th class="px-4 py-3 text-right font-medium">Tokens</th>
                <th class="px-4 py-3 text-right font-medium">Est. cost</th>
                <th class="px-4 py-3 text-right font-medium">Sessions</th>
                <th class="px-6 py-3 text-right font-medium">Activity</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              {projects.map((project) => (
                <tr class="hover:bg-white/3">
                  <td class="px-6 py-4">
                    <p class="font-medium text-slate-200">{project.name}</p>
                    <p class="mt-0.5 max-w-xs truncate font-mono text-[0.65rem] text-slate-600">
                      {project.provider} · {project.path ?? "path unavailable"}
                    </p>
                  </td>
                  <td class="px-4 py-4 text-right font-mono text-slate-300">
                    {project.totalTokens === null
                      ? "—"
                      : compact.format(project.totalTokens)}
                  </td>
                  <td class="px-4 py-4 text-right font-mono text-teal-300">
                    {project.costUsd === null
                      ? "—"
                      : dollars.format(project.costUsd)}
                  </td>
                  <td class="px-4 py-4 text-right text-slate-500">
                    {project.sessions ?? "—"}
                  </td>
                  <td class="px-6 py-4 text-right text-slate-500">
                    {relative(project.lastActivityAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    )}
  </section>
);

export const Dashboard: FC<{ data: DashboardData; sort: string }> = ({
  data,
  sort,
}) => {
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
      <Projects projects={data.projects} sort={sort} />
    </div>
  );
};

export const Page: FC<{ children: unknown }> = ({ children }) => (
  <html lang="en" class="bg-[#080d18]">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark" />
      <title>Token Pulse</title>
      <link rel="stylesheet" href="/assets/app.css" />
      <script src="/assets/htmx.min.js" defer />
    </head>
    <body class="min-h-screen font-sans text-slate-300 antialiased">
      <header class="border-b border-white/6">
        <div class="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div class="flex items-center gap-3">
            <div class="grid h-9 w-9 place-items-center rounded-xl border border-teal-300/20 bg-teal-400/10 font-mono text-sm font-bold text-teal-300">
              TP
            </div>
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
