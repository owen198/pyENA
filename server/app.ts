// The API, mounted under /api. In development Vite runs it inside the dev
// server (vite.config.ts); in production server/start.ts serves it beside the
// built site.

import express, { type NextFunction, type Request, type Response } from "express";
import { authRoutes, sessionMiddleware } from "./auth.ts";
import { connect, type Database } from "./db.ts";
import { interpretRoutes } from "./interpret.ts";
import { projectRoutes } from "./projects.ts";
import { updateRoutes } from "./updates.ts";

export async function createApi(): Promise<{ app: express.Express; db: Database }> {
  const db = await connect();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  const api = express.Router();
  // A 50 MB CSV travels as JSON text; allow for the encoding overhead.
  api.use(express.json({ limit: "60mb" }));
  // Mutations must come from this app's own scripts: a cross-site page cannot
  // declare application/json without a CORS preflight (which this API never
  // answers), and cookies are SameSite=Lax. Checked on the header itself, so
  // a bodyless DELETE must declare it too.
  api.use((req, res, next) => {
    const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && type !== "application/json") {
      return void res.status(415).json({ error: "Send JSON." });
    }
    next();
  });
  // For the host's health checks: the server is up and the database answers.
  api.get("/health", async (_req, res) => {
    try {
      await db.db.command({ ping: 1 });
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false, error: "The database is not answering." });
    }
  });
  api.use(sessionMiddleware(db));
  api.use(authRoutes(db));
  api.use(projectRoutes(db));
  api.use(interpretRoutes());
  api.use(updateRoutes(db));
  api.use((_req, res) => void res.status(404).json({ error: "No such endpoint." }));
  api.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    if ((error as { type?: string }).type === "entity.too.large") {
      return void res.status(413).json({ error: "The file is too large to save. The limit is 50 MB." });
    }
    res.status(500).json({ error: "The server hit an error. Try again." });
  });

  app.use("/api", api);
  return { app, db };
}
