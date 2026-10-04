// Production entry: `npm run build`, then `npm start` (or the Docker image).
// Serves the built site from dist/ and the API under /api on one port.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import compression from "compression";
import express from "express";
import { createApi } from "./app.ts";
import { config } from "./config.ts";

// A crash should say why in the host's log. An unhandled rejection already
// ends the process (Node's default); this only makes sure the reason is logged.
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

const { app, db } = await createApi();

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

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void db.close().then(() => process.exit(0));
  });
}
