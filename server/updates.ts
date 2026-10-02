// Product news, by consent only. A visitor gives an address and ticks a box
// that says what they agree to; the address, the exact wording they agreed to
// and when are kept. Withdrawing marks the consent withdrawn. Nothing is sent
// from here: the team exports the list to write to people.

import express, { type Request } from "express";
import { publicUser, requireUser } from "./auth.ts";
import type { Database } from "./db.ts";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const MAX_TEXT = 600;
/** Where on the site the address was given: the product-news box, or the IdeaLens waitlist. */
const SOURCES = new Set(["landing", "waitlist"]);

const recent = new Map<string, number[]>();
/** At most 20 sign-ups an hour from one address, so the list cannot be flooded. */
function tooMany(req: Request): boolean {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter((time) => now - time < 60 * 60 * 1000);
  times.push(now);
  recent.set(key, times);
  return times.length > 20;
}

/** The address and the words agreed to, or the reason they cannot be kept. */
function readConsent(req: Request): { email: string; consentText: string } | { field: string; error: string } {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const consentText = String(req.body?.consentText ?? "").trim();
  if (!EMAIL.test(email)) return { field: "email", error: "Enter an email address, like name@example.org." };
  if (req.body?.consent !== true || !consentText || consentText.length > MAX_TEXT) {
    return { field: "consent", error: "Tick the box to agree to receive news about IdeaLens." };
  }
  return { email, consentText };
}

export function updateRoutes(db: Database) {
  const router = express.Router();

  router.post("/updates", async (req, res) => {
    const consent = readConsent(req);
    if ("error" in consent) return void res.status(400).json(consent);
    if (tooMany(req)) return void res.status(429).json({ error: "Too many attempts. Try again in an hour." });
    await db.updates.updateOne(
      { _id: consent.email },
      { $set: { consentText: consent.consentText, consentedAt: new Date(), withdrawnAt: null, source: SOURCES.has(req.body?.source) ? req.body.source : "landing" } },
      { upsert: true },
    );
    res.status(201).json({ ok: true });
  });

  // Signed in, the consent belongs to the account too, so IdeaLens stops asking.
  router.put("/me/news", requireUser, async (req, res) => {
    const consent = readConsent(req);
    if ("error" in consent) return void res.status(400).json(consent);
    const now = new Date();
    const user = req.user!;
    const news = { email: consent.email, consentText: consent.consentText, consentedAt: now };
    await db.users.updateOne({ _id: user._id }, { $set: { news } });
    await db.updates.updateOne(
      { _id: consent.email },
      { $set: { consentText: consent.consentText, consentedAt: now, withdrawnAt: null, source: "account", userId: user._id } },
      { upsert: true },
    );
    res.json({ user: publicUser({ ...user, news }) });
  });

  router.delete("/me/news", requireUser, async (req, res) => {
    const user = req.user!;
    if (user.news) await db.updates.updateOne({ _id: user.news.email }, { $set: { withdrawnAt: new Date() } });
    await db.users.updateOne({ _id: user._id }, { $set: { news: null } });
    res.json({ user: publicUser({ ...user, news: null }) });
  });

  router.delete("/updates", async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return void res.status(400).json({ field: "email", error: "Enter the email address you gave." });
    await db.updates.updateOne({ _id: email }, { $set: { withdrawnAt: new Date() } });
    // The same answer whether or not the address was on the list.
    res.json({ ok: true });
  });

  return router;
}
