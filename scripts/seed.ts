import { createDemoSnapshot } from "../src/codexbar";
import { loadConfig } from "../src/config";
import { Storage } from "../src/storage";

const storage = new Storage(loadConfig().dbPath);
storage.save(createDemoSnapshot());
storage.close();
console.log("Seeded representative demo usage.");
