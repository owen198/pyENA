import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Runs the API (server/app.ts) inside the Vite dev server, so `npm run dev`
 * is the only command: the site and /api share one origin, as in production.
 */
function api(): Plugin {
  return {
    name: "pyena-api",
    // Only for `npm run dev`; Vitest also runs in serve mode but needs no API.
    apply: (_config, env) => env.command === "serve" && !process.env.VITEST,
    async configureServer(server) {
      const { createApi } = await import("./server/app.ts");
      const { app, db } = await createApi();
      server.middlewares.use(app);
      server.httpServer?.once("close", () => void db.close());
    },
  };
}

// base "/": the app has real paths (/projects/…, /login), served from the
// domain root by server/start.ts in production.
export default defineConfig({
  base: "/",
  plugins: [react(), api()],
  worker: { format: "es" },
  test: { environment: "node" },
});
