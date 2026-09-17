import { createApp } from "./app";
import { createCodexBarAdapter } from "./codexbar";
import { loadConfig } from "./config";
import { Storage } from "./storage";

const config = loadConfig();
const storage = new Storage(config.dbPath, config.subscriptions);
const adapter = createCodexBarAdapter(config);

let inFlight: Promise<void> | null = null;

async function collect(): Promise<void> {
  if (inFlight) return;
  const pending = (async () => {
    try {
      storage.save(await adapter.collect());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      storage.recordFailure(config.source, `Snapshot failed: ${message}`);
      console.error(`Token Pulse snapshot failed: ${message}`);
    }
  })();
  inFlight = pending;
  try {
    await pending;
  } finally {
    if (inFlight === pending) inFlight = null;
  }
}

await collect();
const timer = setInterval(collect, config.snapshotSeconds * 1_000);

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: createApp(storage).fetch,
});

async function shutdown(): Promise<void> {
  clearInterval(timer);
  if (inFlight) {
    await Promise.race([
      inFlight,
      new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
    ]);
  }
  server.stop();
  storage.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Token Pulse listening on ${server.url} (${config.source} source)`);

if (!["127.0.0.1", "localhost", "::1"].includes(config.host)) {
  console.warn(
    "WARNING: Token Pulse is bound to a non-loopback address and has no built-in authentication. " +
      "Expose it only behind authenticated access.",
  );
}
