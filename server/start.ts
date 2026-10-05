// Production entry: `npm run build`, then `npm start` (or the Docker image).
// Serves the built site from dist/ and the API under /api on one port.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import compression from "compression";
import express from "express";
import { createApi } from "./app.ts";
import { config } from "./config.ts";
import { installTimestamps, log, mb } from "./log.ts";

installTimestamps();

/** The container's memory limit (cgroup v2), when there is one: a stop with no error near it is often this. */
function memoryLimit(): string {
  try {
    const raw = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    return raw === "max" ? "none" : `${mb(Number(raw))}MB`;
  } catch {
    return "unknown";
  }
}
log("server.starting", { node: process.version, pid: process.pid, memoryLimit: memoryLimit() });
process.on("exit", (code) => log("server.exit", { code, uptimeMin: Math.round(process.uptime() / 60) }));

// Problems should say why in the host's log. With this handler an unhandled
// rejection is logged and the server keeps running; an uncaught exception
// still ends it.
process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

const dist = resolve(process.cwd(), "dist");
if (!existsSync(resolve(dist, "index.html"))) {
  console.error("dist/ is missing. Run `npm run build` first.");
  process.exit(1);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// The server listens at once and connects to the database behind it. Waiting
// for the database before listening meant a wrong MONGODB_URI, a changed
// password or an Atlas IP list without this host left nothing on the port:
// the process exited, Docker restarted it, and every visitor got a 502. Now
// the site loads, /api answers 503, and the log says what the database said.
let api: Awaited<ReturnType<typeof createApi>> | null = null;
app.use((req, res, next) => {
  if (req.path !== "/api" && !req.path.startsWith("/api/")) return next();
  if (api) return api.app(req, res, next);
  res.status(503).json({ ok: false, error: "The database is not connected yet. Try again in a minute." });
});

async function connectApi() {
  for (let attempt = 1; ; attempt++) {
    try {
      api = await createApi();
      log("db.connected", { database: config.mongoDb, attempt });
      return;
    } catch (error) {
      log("db.failed", { attempt, error: (error as Error)?.message ?? String(error), retryIn: "10s" });
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }
}
void connectApi();

// Headers every response carries. The platform frames only itself (the
// landing page's tour), so other sites may not frame it.
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (config.cookieSecure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

// The page, its data files (the tour's figures, the examples) and the
// bundles are text; compressed, they are a fraction of the size.
app.use(compression());

app.use(
  express.static(dist, {
    index: false,
    // /tour is a page and tour/ a folder of data: no redirect from one to the other.
    redirect: false,
    setHeaders(res, path) {
      // Built bundles carry a content hash in their name: they never change.
      if (path.includes(`${resolve(dist, "assets")}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      // Everything else (examples, the vendored pyENA, fonts, the tour's figures) for a day.
      else res.setHeader("Cache-Control", "public, max-age=86400");
    },
  }),
);

// Client-side routes (/projects/…, /login, …) all load the same page, which is
// never cached, so a new release reaches everyone at once.
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(resolve(dist, "index.html"));
});

const server = app.listen(config.port, () => {
  console.log(`IdeaLens on port ${config.port} (database ${config.mongoDb})`);
  if (!config.cookieSecure) {
    console.warn("COOKIE_SECURE is not true: sign-in cookies are also sent over plain HTTP. Set it on an HTTPS host.");
  }
  if (config.anthropicConfigured) console.log(`AI interpretation: Claude (${config.anthropicModel}).`);
  else if (config.openaiConfigured) console.log(`AI interpretation: OpenAI (${config.openaiModel}).`);
  else console.log("No AI key is set (ANTHROPIC_API_KEY or OPENAI_API_KEY): only the built-in interpretation is offered.");
});

// Every 10 minutes: still alive, and how much memory it holds. The last
// heartbeat before a silent stop says whether memory was climbing.
setInterval(() => {
  const memory = process.memoryUsage();
  log("heartbeat", { uptimeMin: Math.round(process.uptime() / 60), rssMB: mb(memory.rss), heapMB: mb(memory.heapUsed), db: api ? "up" : "waiting" });
}, 10 * 60 * 1000).unref();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    // Docker sends SIGTERM on `docker compose down`, `restart` or a redeploy.
    log("server.stopping", { signal });
    server.close();
    void (api?.db.close() ?? Promise.resolve()).then(() => process.exit(0));
  });
}
