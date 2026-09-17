import { createApp } from "./app";
import { createCodexBarAdapter } from "./codexbar";
import { loadConfig } from "./config";
import { Storage } from "./storage";

const config = loadConfig();
const storage = new Storage(config.dbPath);
const adapter = createCodexBarAdapter(config);

async function collect(): Promise<void> {
  try {
    storage.save(await adapter.collect());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    storage.recordFailure(config.source, `Snapshot failed: ${message}`);
    console.error(`Token Pulse snapshot failed: ${message}`);
  }
}

await collect();
const timer = setInterval(collect, config.snapshotSeconds * 1_000);

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: createApp(storage).fetch,
});

function shutdown(): void {
  clearInterval(timer);
  server.stop();
  storage.close();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log(`Token Pulse listening on ${server.url} (${config.source} source)`);
