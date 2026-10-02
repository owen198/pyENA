// The API end to end against a throwaway local MongoDB: accounts, sessions,
// projects with their dataset in GridFS, and that one account can never reach
// another's analyses.

import { rmSync } from "node:fs";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "./db.ts";

// Set before the server modules load: never a real database or a real key.
process.env.MONGODB_URI = "";
process.env.MONGODB_DB = "pyena-test";
process.env.PYENA_DATA_DIR = ".data/mongo-test";
process.env.ANTHROPIC_API_KEY = "";
process.env.ANTHROPIC_AUTH_TOKEN = "";
process.env.OPENAI_API_KEY = "";

let server: Server;
let db: Database;
let base = "";
const jar = new Map<string, string>();

async function call(who: string, method: string, path: string, body?: unknown) {
  const cookie = jar.get(who);
  const res = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) jar.set(who, set.split(";")[0]);
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text };
}

const source = (fileName: string, rowCount: number) => ({
  fileName,
  fileSize: 20,
  options: { delimiter: ",", header: true },
  columns: ["a", "b"],
  rowCount,
  sampleId: null,
});

beforeAll(async () => {
  rmSync(".data/mongo-test", { recursive: true, force: true });
  const { createApi } = await import("./app.ts");
  const api = await createApi();
  db = api.db;
  server = api.app.listen(0);
  base = `http://localhost:${(server.address() as { port: number }).port}/api`;
}, 120_000);

afterAll(async () => {
  server?.close();
  await db?.db.dropDatabase();
  await db?.close();
  rmSync(".data/mongo-test", { recursive: true, force: true });
});

describe("health", () => {
  it("answers when the server and the database are up", async () => {
    expect((await call("x", "GET", "/health")).body).toEqual({ ok: true });
  });
});

describe("accounts", () => {
  it("rejects bad names, short passwords and taken names", async () => {
    expect((await call("x", "GET", "/auth/me")).body.user).toBeNull();
    expect((await call("x", "POST", "/auth/register", { username: "A!", password: "longenough" })).body.field).toBe("username");
    expect((await call("x", "POST", "/auth/register", { username: "nhi", password: "short" })).body.field).toBe("password");
    const made = await call("a", "POST", "/auth/register", { username: "Nhi", password: "correct horse" });
    expect(made.status).toBe(201);
    expect(made.body.user.username).toBe("nhi");
    expect((await call("x", "POST", "/auth/register", { username: "nhi", password: "whatever12" })).status).toBe(409);
  });

  it("keeps a session in an httpOnly cookie and stores only hashes", async () => {
    const me = await call("a", "GET", "/auth/me");
    expect(me.body.user.settings.theme).toBe("light");
    const user = await db.users.findOne({ username: "nhi" });
    expect(user!.passwordHash).toMatch(/^scrypt\$/);
    expect(user!.passwordHash).not.toContain("correct horse");
    const token = decodeURIComponent(jar.get("a")!.split("=")[1]);
    expect(await db.sessions.countDocuments({ _id: token })).toBe(0);
    expect(await db.sessions.countDocuments({ userId: user!._id })).toBe(1);
  });

  it("signs in case-insensitively, signs out, and refuses a wrong password", async () => {
    expect((await call("c", "POST", "/auth/login", { username: "nhi", password: "wrong password" })).status).toBe(401);
    const login = await call("c", "POST", "/auth/login", { username: "NHI", password: "correct horse" });
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect((await call("c", "POST", "/auth/logout", {})).status).toBe(200);
    expect((await call("c", "GET", "/auth/me")).body.user).toBeNull();
  });

  it("saves the theme setting and changes the password", async () => {
    expect((await call("a", "PUT", "/me/settings", { theme: "purple" })).status).toBe(400);
    expect((await call("a", "PUT", "/me/settings", { theme: "dark" })).status).toBe(200);
    expect((await call("a", "GET", "/auth/me")).body.user.settings.theme).toBe("dark");
    expect((await call("a", "PUT", "/me/password", { current: "nope", next: "new password" })).status).toBe(400);
    expect((await call("a", "PUT", "/me/password", { current: "correct horse", next: "new password" })).status).toBe(200);
    expect((await call("d", "POST", "/auth/login", { username: "nhi", password: "new password" })).status).toBe(200);
  });

  it("slows down repeated wrong passwords", async () => {
    await call("e", "POST", "/auth/register", { username: "target", password: "the real one" });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await call("f", "POST", "/auth/login", { username: "target", password: `guess ${i}` })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });

  it("refuses mutations that are not JSON", async () => {
    const res = await fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "username=nhi&password=x",
    });
    expect(res.status).toBe(415);
    expect((await fetch(`${base}/projects/000000000000000000000000`, { method: "DELETE" })).status).toBe(415);
  });
});

describe("projects", () => {
  let id = "";

  it("creates a project with its dataset", async () => {
    const created = await call("a", "POST", "/projects", {
      name: "RS test",
      source: source("RS.csv", 2),
      csvText: "a,b\n1,0\n0,1\n",
      model: { codes: ["a", "b"], groups: ["X", "Y"], dimensions: 3 },
    });
    expect(created.status).toBe(201);
    id = created.body.project.id;
    expect(created.body.project).toMatchObject({ name: "RS test", status: "draft", step: 1, fileName: "RS.csv", codes: 2, dimensions: 3 });
    expect((await call("a", "GET", `/projects/${id}/data`)).body).toBe("a,b\n1,0\n0,1\n");
  });

  it("saves results, figures and the coding schema", async () => {
    await call("a", "PATCH", `/projects/${id}`, {
      step: 9,
      result: { summaryJson: "{}", units: [], finishedAt: new Date().toISOString(), model: {} },
      outputs: { svgs: { network: "<svg/>" }, plots3d: {}, focusUnits: [null, null] },
      schema: { fileName: "codebook.csv", entries: [{ code: "a", meaning: "A code" }] },
      interpretations: Array.from({ length: 12 }, (_, i) => ({ text: `v${i}`, createdAt: new Date().toISOString(), author: "built-in" })),
    });
    const { project } = (await call("a", "GET", `/projects/${id}`)).body;
    expect(project.step).toBe(5);
    expect(project.result).not.toBeNull();
    expect(project.outputs.svgs.network).toBe("<svg/>");
    await call("a", "PATCH", `/projects/${id}`, { outputs: { svgs: { network: "<svg id='2'/>" }, plots3d: {}, focusUnits: [null, null] } });
    expect((await call("a", "GET", `/projects/${id}`)).body.project.outputs.svgs.network).toBe("<svg id='2'/>");
    expect(await db.db.collection("outputs.files").countDocuments()).toBe(1);
    expect(project.schema.entries[0].meaning).toBe("A code");
    expect(project.interpretations.map((i: { text: string }) => i.text)).toEqual(Array.from({ length: 10 }, (_, i) => `v${i + 2}`));
    const list = (await call("a", "GET", "/projects")).body.projects;
    expect(list[0]).toMatchObject({ id, status: "analysed", hasSchema: true, separates: [], interpretations: 10 });
  });

  it("replaces the dataset without leaving the old file behind", async () => {
    await call("a", "PATCH", `/projects/${id}`, { source: source("v2.csv", 1), csvText: "a,b\n9,9\n" });
    expect((await call("a", "GET", `/projects/${id}/data`)).body).toBe("a,b\n9,9\n");
    expect(await db.db.collection("datasets.files").countDocuments()).toBe(1);
  });

  it("duplicates with its own copy of the data and figures", async () => {
    const dup = (await call("a", "POST", `/projects/${id}/duplicate`, {})).body.project;
    expect(dup.name).toBe("RS test (copy)");
    expect((await call("a", "GET", `/projects/${dup.id}/data`)).body).toBe("a,b\n9,9\n");
    expect((await call("a", "GET", `/projects/${dup.id}`)).body.project.outputs.svgs.network).toBe("<svg id='2'/>");
    expect((await call("a", "DELETE", `/projects/${dup.id}`)).status).toBe(200);
    expect((await call("a", "GET", `/projects/${id}/data`)).body).toBe("a,b\n9,9\n");
    expect(await db.db.collection("datasets.files").countDocuments()).toBe(1);
    expect(await db.db.collection("outputs.files").countDocuments()).toBe(1);
  });

  it("never shows one account's analyses to another", async () => {
    await call("b", "POST", "/auth/register", { username: "other", password: "another pass" });
    expect((await call("b", "GET", "/projects")).body.projects).toEqual([]);
    expect((await call("b", "GET", `/projects/${id}`)).status).toBe(404);
    expect((await call("b", "GET", `/projects/${id}/data`)).status).toBe(404);
    expect((await call("b", "PATCH", `/projects/${id}`, { name: "mine" })).status).toBe(404);
    expect((await call("b", "DELETE", `/projects/${id}`)).status).toBe(404);
    expect((await call("b", "GET", "/projects/not-an-id")).status).toBe(404);
    expect((await call("a", "GET", `/projects/${id}`)).body.project.name).toBe("RS test");
  });

  it("deletes a project with its data and figures", async () => {
    expect((await call("a", "DELETE", `/projects/${id}`)).status).toBe(200);
    expect((await call("a", "GET", "/projects")).body.projects).toEqual([]);
    expect(await db.db.collection("datasets.files").countDocuments()).toBe(0);
    expect(await db.db.collection("outputs.files").countDocuments()).toBe(0);
  });

  it("needs a signed-in user", async () => {
    expect((await call("nobody", "GET", "/projects")).status).toBe(401);
  });
});

describe("history findings", () => {
  it("names the dimensions Welch's t separates the groups on, NaN and all", async () => {
    const { readFileSync } = await import("node:fs");
    const summaryJson = readFileSync("src/interpret/fixtures/gender-case1.summary.json", "utf8");
    expect(summaryJson).toContain("NaN");
    const made = await call("a", "POST", "/projects", {
      name: "Gender",
      result: { summaryJson, units: [], fileName: "g.csv", rowCount: 200, finishedAt: new Date().toISOString(), model: {} },
    });
    expect(made.body.project).toMatchObject({ status: "analysed", separates: [1] });
    await call("a", "DELETE", `/projects/${made.body.project.id}`);
  });
});

describe("the first-time tutorial", () => {
  it("starts for a new account, and remembers where the account left it", async () => {
    await call("t", "POST", "/auth/register", { username: "tutorial-new", password: "a-long-password" });
    expect((await call("t", "GET", "/auth/me")).body.user.settings.tutorial).toBe("not_started");
    expect((await call("t", "PUT", "/me/tutorial", { state: "finished-ish" })).status).toBe(400);
    expect((await call("t", "PUT", "/me/tutorial", { state: "skipped" })).status).toBe(200);
    expect((await call("t", "GET", "/auth/me")).body.user.settings.tutorial).toBe("skipped");
    expect((await call("nobody", "PUT", "/me/tutorial", { state: "completed" })).status).toBe(401);
  });

  it("remembers a one-time notice once it is seen", async () => {
    expect((await call("t", "PUT", "/me/notices", { id: "Not valid!" })).status).toBe(400);
    expect((await call("t", "PUT", "/me/notices", { id: "figure-interpretation" })).status).toBe(200);
    expect((await call("t", "PUT", "/me/notices", { id: "figure-interpretation" })).status).toBe(200);
    expect((await call("t", "GET", "/auth/me")).body.user.settings.notices).toEqual(["figure-interpretation"]);
  });
});

describe("connection analysis", () => {
  it("says plainly when the AI is not set up, and needs a signed-in account", async () => {
    const body = { label: "A ↔ B", context: "counts", turns: [{ role: "user", text: "Why are these connected?" }] };
    expect((await call("nobody", "POST", "/interpret/connection", body)).status).toBe(401);
    const answer = await call("a", "POST", "/interpret/connection", body);
    expect(answer.status).toBe(503);
    expect(answer.body.error).toContain("not set up");
  });

  it("keeps a figure's or edge's conversation with the analysis", async () => {
    const created = await call("a", "POST", "/projects", { name: "Threads" });
    const id = created.body.project.id;
    const thread = {
      key: "edge:A__B",
      target: { kind: "edge", codes: ["A", "B"] },
      resultAt: "2026-10-02T00:00:00.000Z",
      messages: [{ role: "user", text: "Why are these connected?", createdAt: "2026-10-02T00:00:00.000Z" }],
      updatedAt: "2026-10-02T00:00:00.000Z",
    };
    expect((await call("a", "PATCH", `/projects/${id}`, { threads: [thread] })).status).toBe(200);
    expect((await call("a", "GET", `/projects/${id}`)).body.project.threads).toEqual([thread]);
  });
});

describe("product news", () => {
  const consentText = "Yes, email me news about IdeaLens.";

  it("keeps an address only with consent, and the words agreed to", async () => {
    expect((await call("v", "POST", "/updates", { email: "not an address", consent: true, consentText })).body.field).toBe("email");
    expect((await call("v", "POST", "/updates", { email: "visitor@example.org", consent: false, consentText })).body.field).toBe("consent");
    expect((await call("v", "POST", "/updates", { email: "visitor@example.org", consentText })).status).toBe(400);
    expect(await db.updates.countDocuments()).toBe(0);

    expect((await call("v", "POST", "/updates", { email: " Visitor@Example.org ", consent: true, consentText })).status).toBe(201);
    const saved = await db.updates.findOne({ _id: "visitor@example.org" });
    expect(saved).toMatchObject({ consentText, withdrawnAt: null });
    expect(saved!.consentedAt).toBeInstanceOf(Date);
  });

  it("keeps an account's consent on the account, so IdeaLens stops asking, and withdraws it", async () => {
    expect((await call("a", "GET", "/auth/me")).body.user.news).toBeNull();
    expect((await call("nobody", "PUT", "/me/news", { email: "nhi@example.org", consent: true, consentText })).status).toBe(401);
    expect((await call("a", "PUT", "/me/news", { email: "nhi@example.org", consent: false, consentText })).status).toBe(400);
    const given = await call("a", "PUT", "/me/news", { email: "Nhi@Example.org", consent: true, consentText });
    expect(given.body.user.news).toEqual({ email: "nhi@example.org" });
    expect((await call("a", "GET", "/auth/me")).body.user.news).toEqual({ email: "nhi@example.org" });
    expect(await db.updates.findOne({ _id: "nhi@example.org" })).toMatchObject({ source: "account", withdrawnAt: null });

    expect((await call("a", "DELETE", "/me/news")).body.user.news).toBeNull();
    expect((await db.updates.findOne({ _id: "nhi@example.org" }))!.withdrawnAt).toBeInstanceOf(Date);
    expect((await call("a", "GET", "/auth/me")).body.user.news).toBeNull();
  });

  it("records a withdrawal, and answers the same for an unknown address", async () => {
    expect((await call("v", "DELETE", "/updates", { email: "visitor@example.org" })).status).toBe(200);
    expect((await db.updates.findOne({ _id: "visitor@example.org" }))!.withdrawnAt).toBeInstanceOf(Date);
    expect((await call("v", "DELETE", "/updates", { email: "stranger@example.org" })).status).toBe(200);
    expect(await db.updates.countDocuments()).toBe(2);
  });

  it("marks a waitlist sign-up as the waitlist's, and nothing else can name its source", async () => {
    const waitlistText = "Add me to the IdeaLens waitlist.";
    expect((await call("v", "POST", "/updates", { email: "early@example.org", consent: true, consentText: waitlistText, source: "waitlist" })).status).toBe(201);
    expect(await db.updates.findOne({ _id: "early@example.org" })).toMatchObject({ source: "waitlist", consentText: waitlistText, withdrawnAt: null });
    expect((await call("v", "POST", "/updates", { email: "other@example.org", consent: true, consentText, source: "admin" })).status).toBe(201);
    expect(await db.updates.findOne({ _id: "other@example.org" })).toMatchObject({ source: "landing" });
  });
});

describe("interpretation", () => {
  it("reports the AI as unavailable without server credentials", async () => {
    expect((await call("a", "GET", "/interpret/status")).body).toEqual({ available: false, model: null, provider: null });
    expect((await call("a", "POST", "/interpret", { summaryJson: "{}", schema: [], context: {} })).status).toBe(503);
  });
});
