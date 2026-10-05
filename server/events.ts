// What happens in the browser, reported to the server's log: pyENA runs in
// the visitor's browser (Pyodide), so without this the log would never show
// an analysis finishing or failing. Only counts, timings and the error
// message travel; never the dataset.

import express, { type Request } from "express";
import { log } from "./log.ts";

const TYPES = new Set(["analysis.done", "analysis.failed", "engine.failed"]);

const recent = new Map<string, number[]>();
/** At most 120 reports an hour from one address, so the log cannot be flooded. */
function tooMany(req: Request): boolean {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  for (const [address, list] of recent) if (list.every((time) => now - time >= 60 * 60 * 1000)) recent.delete(address);
  const times = (recent.get(key) ?? []).filter((time) => now - time < 60 * 60 * 1000);
  times.push(now);
  recent.set(key, times);
  return times.length > 120;
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined);
const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) || undefined : undefined;

export function eventRoutes() {
  const router = express.Router();

  router.post("/events", (req, res) => {
    const type = req.body?.type;
    if (typeof type !== "string" || !TYPES.has(type)) return void res.status(400).json({ error: "Unknown event." });
    if (tooMany(req)) return void res.status(429).json({ error: "Too many reports." });
    log(type, {
      user: req.user?.username ?? "guest",
      ms: count(req.body.ms),
      rows: count(req.body.rows),
      codes: count(req.body.codes),
      figures: count(req.body.figures),
      kind: text(req.body.kind, 40),
      error: text(req.body.error, 300),
    });
    res.json({ ok: true });
  });

  return router;
}
