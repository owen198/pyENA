// Username and password accounts (no single sign-on in this version).
// Passwords are hashed with scrypt; sessions are random tokens in an httpOnly
// cookie, stored only as their SHA-256 hash.

import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ObjectId } from "mongodb";
import type { PublicUser, ThemeMode, TutorialState } from "../shared/api.ts";
import { config } from "./config.ts";
import type { Database, UserDoc } from "./db.ts";
import { log } from "./log.ts";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export const COOKIE = "pyena_session";
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const THEMES: ThemeMode[] = ["light", "dark", "system"];
const TUTORIAL: TutorialState[] = ["not_started", "in_progress", "completed", "skipped"];

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltText, keyText] = stored.split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltText, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function publicUser(user: UserDoc): PublicUser {
  return {
    id: user._id.toHexString(),
    username: user.username,
    settings: user.settings,
    news: user.news ? { email: user.news.email } : null,
  };
}

function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function setSessionCookie(res: Response, token: string, maxAgeSeconds: number) {
  const parts = [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config.cookieSecure) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

declare module "express-serve-static-core" {
  interface Request {
    user?: UserDoc;
  }
}

/** Attach the signed-in user, if any. */
export function sessionMiddleware(db: Database) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = readCookie(req, COOKIE);
    if (token) {
      const session = await db.sessions.findOne({ _id: hashToken(token), expiresAt: { $gt: new Date() } });
      if (session) req.user = (await db.users.findOne({ _id: session.userId })) ?? undefined;
    }
    next();
  };
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  next();
}

/** A small guard against password guessing: 10 failed attempts per 15 minutes per address and name. */
const failures = new Map<string, { count: number; until: number }>();
function tooManyAttempts(key: string): boolean {
  const entry = failures.get(key);
  return entry !== undefined && entry.count >= 10 && entry.until > Date.now();
}
function recordFailure(key: string) {
  const now = Date.now();
  for (const [name, item] of failures) if (item.until <= now) failures.delete(name);
  const entry = failures.get(key);
  const until = Date.now() + 15 * 60 * 1000;
  failures.set(key, { count: entry && entry.until > Date.now() ? entry.count + 1 : 1, until });
}

export function authRoutes(db: Database) {
  const router = express.Router();

  const startSession = async (res: Response, userId: ObjectId) => {
    const token = randomBytes(32).toString("base64url");
    const maxAge = config.sessionDays * 24 * 60 * 60;
    await db.sessions.insertOne({
      _id: hashToken(token),
      userId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + maxAge * 1000),
    });
    setSessionCookie(res, token, maxAge);
  };

  const readCredentials = (req: Request) => ({
    username: String(req.body?.username ?? "").trim().toLowerCase(),
    password: String(req.body?.password ?? ""),
  });

  // Signed out is an ordinary answer here, not an error.
  router.get("/auth/me", (req, res) => {
    res.json({ user: req.user ? publicUser(req.user) : null, signupOpen: config.allowSignup });
  });

  router.get("/auth/options", (_req, res) => {
    res.json({ signupOpen: config.allowSignup });
  });

  router.post("/auth/register", async (req, res) => {
    if (!config.allowSignup) return void res.status(403).json({ error: "New accounts are not open on this server." });
    const { username, password } = readCredentials(req);
    if (!USERNAME.test(username)) {
      return void res.status(400).json({
        field: "username",
        error: "Use 3 to 32 characters: lowercase letters, numbers, dots, dashes or underscores, starting with a letter or number.",
      });
    }
    if (password.length < 8) {
      return void res.status(400).json({ field: "password", error: "Use at least 8 characters for the password." });
    }
    if (await db.users.findOne({ username })) {
      return void res.status(409).json({ field: "username", error: `The name ${username} is already taken.` });
    }
    const user: Omit<UserDoc, "_id"> = {
      username,
      passwordHash: await hashPassword(password),
      createdAt: new Date(),
      // A new account is a first-time user: the tutorial starts for it.
      settings: { theme: THEMES.includes(req.body?.theme) ? req.body.theme : "light", tutorial: "not_started" },
    };
    const { insertedId } = await db.users.insertOne(user as UserDoc);
    await startSession(res, insertedId);
    log("register.ok", { user: username });
    res.status(201).json({ user: publicUser({ ...user, _id: insertedId } as UserDoc) });
  });

  router.post("/auth/login", async (req, res) => {
    const { username, password } = readCredentials(req);
    const key = `${req.ip}|${username}`;
    if (tooManyAttempts(key)) {
      log("login.blocked", { user: username, ip: req.ip });
      return void res.status(429).json({ error: "Too many attempts. Wait 15 minutes and try again." });
    }
    const user = await db.users.findOne({ username });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      recordFailure(key);
      log("login.failed", { user: username, reason: user ? "wrong password" : "no such account", ip: req.ip });
      return void res.status(401).json({ error: "That username and password do not match an account." });
    }
    failures.delete(key);
    await startSession(res, user._id);
    log("login.ok", { user: username });
    res.json({ user: publicUser(user) });
  });

  router.post("/auth/logout", async (req, res) => {
    const token = readCookie(req, COOKIE);
    if (token) await db.sessions.deleteOne({ _id: hashToken(token) });
    if (req.user) log("logout", { user: req.user.username });
    setSessionCookie(res, "", 0);
    res.json({ ok: true });
  });

  router.put("/me/settings", requireUser, async (req, res) => {
    const theme = req.body?.theme;
    if (!THEMES.includes(theme)) return void res.status(400).json({ error: "Theme must be light, dark or system." });
    await db.users.updateOne({ _id: req.user!._id }, { $set: { "settings.theme": theme } });
    res.json({ settings: { ...req.user!.settings, theme } });
  });

  // Where the account is in the first-time tutorial, so it is not started again once done or skipped.
  router.put("/me/tutorial", requireUser, async (req, res) => {
    const state = req.body?.state;
    if (!TUTORIAL.includes(state)) return void res.status(400).json({ error: "Unknown tutorial state." });
    await db.users.updateOne({ _id: req.user!._id }, { $set: { "settings.tutorial": state } });
    res.json({ settings: { ...req.user!.settings, tutorial: state } });
  });

  // One-time notices (a new feature, say): once seen or dismissed, not shown again.
  router.put("/me/notices", requireUser, async (req, res) => {
    const id = req.body?.id;
    if (typeof id !== "string" || !/^[a-z0-9-]{1,40}$/.test(id)) return void res.status(400).json({ error: "Unknown notice." });
    await db.users.updateOne({ _id: req.user!._id }, { $addToSet: { "settings.notices": id } });
    const notices = [...new Set([...(req.user!.settings.notices ?? []), id])];
    res.json({ settings: { ...req.user!.settings, notices } });
  });

  router.put("/me/password", requireUser, async (req, res) => {
    const current = String(req.body?.current ?? "");
    const next = String(req.body?.next ?? "");
    if (!(await verifyPassword(current, req.user!.passwordHash))) {
      return void res.status(400).json({ field: "current", error: "The current password is not right." });
    }
    if (next.length < 8) return void res.status(400).json({ field: "next", error: "Use at least 8 characters." });
    await db.users.updateOne({ _id: req.user!._id }, { $set: { passwordHash: await hashPassword(next) } });
    log("password.changed", { user: req.user!.username });
    res.json({ ok: true });
  });

  return router;
}
