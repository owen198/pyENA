// Host the platform from this machine: the production server, with this
// machine's own MongoDB (the same data as development, in .data/mongo), open
// to other devices on the network at http://<this machine>:8787.
//
//   npm run host
//
// For a real host with its own database, use `npm start` with MONGODB_URI.

import { mkdirSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";

if (!process.env.MONGODB_URI) {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const dbPath = resolve(process.cwd(), process.env.PYENA_DATA_DIR || ".data/mongo");
  mkdirSync(dbPath, { recursive: true });
  const mongo = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: "wiredTiger" } }).catch((error: Error) => {
    // Only one server can hold the local database: usually IdeaLens (or `npm run dev`) is already running.
    if (/DBPathInUse/.test(String(error?.message))) {
      console.error(
        `The local database in ${dbPath} is already in use: IdeaLens (npm run host) or the dev server (npm run dev) ` +
          `is probably running already. Open http://localhost:${process.env.PORT || 8787} (or :5173 for dev), or stop that one first.`,
      );
      process.exit(1);
    }
    throw error;
  });
  process.env.MONGODB_URI = mongo.getUri();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => void mongo.stop({ doCleanup: false }));
  }
  console.log(`Local database in ${dbPath}`);
}

await import("./start.ts");

const port = Number(process.env.PORT || 8787);
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
  .map((entry) => `http://${entry!.address}:${port}`);
console.log(`On this machine: http://localhost:${port}`);
if (addresses.length) console.log(`On the same network: ${addresses.join("  ")}`);
