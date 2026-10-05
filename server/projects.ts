// Analysis history: each project stores the uploaded data (GridFS), the
// coding schema, the settings, the results, the figures and interpretations.
// Every query is scoped to the signed-in user.

import express, { type Request, type Response } from "express";
import { ObjectId } from "mongodb";
import type { ProjectDetail, ProjectOutputs, ProjectPatch, ProjectSummary } from "../shared/api.ts";
import { requireUser } from "./auth.ts";
import { readText, removeFile, writeText, type Database, type ProjectDoc } from "./db.ts";
import { log, mb } from "./log.ts";

const MAX_NAME = 120;

function projectId(req: Request, res: Response): ObjectId | null {
  const raw = req.params.id;
  if (typeof raw !== "string" || !ObjectId.isValid(raw)) {
    res.status(404).json({ error: "There is no such analysis." });
    return null;
  }
  return new ObjectId(raw);
}

/** The dimensions Welch's t test separates the groups on, read from pyENA's saved summary. */
function separates(summaryJson: string | undefined): number[] {
  if (!summaryJson) return [];
  try {
    // pyENA writes NaN where scipy returns it; JSON has no NaN.
    const summary = JSON.parse(summaryJson.replace(/\bNaN\b|-?Infinity\b/g, "null"));
    const tests = summary?.statistics?.welch_t_test ?? {};
    return [1, 2].filter((dimension) => {
      const p = tests[`dimension_${dimension}`]?.p_value;
      return typeof p === "number" && p < 0.05;
    });
  } catch {
    return [];
  }
}

function summarize(doc: ProjectDoc): ProjectSummary {
  const model = (doc.model ?? {}) as { codes?: string[]; groups?: [string | null, string | null]; dimensions?: number };
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    status: doc.result ? "analysed" : "draft",
    step: doc.step,
    fileName: doc.source?.fileName ?? null,
    rowCount: doc.source?.rowCount ?? null,
    codes: model.codes?.length ?? 0,
    groups: model.groups ?? [null, null],
    dimensions: model.dimensions ?? 2,
    hasSchema: Boolean(doc.schema?.entries.length),
    separates: separates(doc.result?.summaryJson),
    interpretations: doc.interpretations?.length ?? 0,
    conversations: (doc.threads ?? []).filter((thread) => (thread.messages ?? []).some((message) => message.role === "user")).length,
  };
}

/** Apply the fields the browser sent; anything absent is left as it was. */
async function applyPatch(db: Database, doc: ProjectDoc, patch: ProjectPatch) {
  const set: Partial<ProjectDoc> = { updatedAt: new Date() };
  if (typeof patch.name === "string") set.name = patch.name.trim().slice(0, MAX_NAME) || doc.name;
  if (typeof patch.step === "number") set.step = Math.min(5, Math.max(1, Math.round(patch.step)));
  if (patch.source !== undefined) set.source = patch.source;
  if (patch.schema !== undefined) set.schema = patch.schema;
  if (patch.model !== undefined) set.model = patch.model;
  if (patch.figures !== undefined) set.figures = patch.figures;
  if (patch.result !== undefined) set.result = patch.result;
  if (patch.interpretations !== undefined) set.interpretations = patch.interpretations.slice(-10);
  // Conversations about figures and edges: the 60 most recent, each its last 40 messages.
  if (Array.isArray(patch.threads)) {
    set.threads = patch.threads.slice(-60).map((thread) => ({ ...thread, messages: (thread.messages ?? []).slice(-40) }));
  }

  // New files are written before the old ones are removed, so a failure part
  // way leaves the previous version in place rather than nothing.
  if (typeof patch.csvText === "string") {
    const name = patch.source?.fileName ?? doc.source?.fileName ?? "data.csv";
    set.dataFileId = await writeText(db.datasets, name, patch.csvText, doc._id);
  } else if (patch.source === null) {
    set.dataFileId = null;
  }
  const outputsText = patch.outputs ? JSON.stringify(patch.outputs) : null;
  if (patch.outputs !== undefined) {
    set.outputsFileId = outputsText ? await writeText(db.outputs, "outputs.json", outputsText, doc._id) : null;
  }

  await db.projects.updateOne({ _id: doc._id }, { $set: set });
  if (set.dataFileId !== undefined) await removeFile(db.datasets, doc.dataFileId);
  if (set.outputsFileId !== undefined) await removeFile(db.outputs, doc.outputsFileId ?? null);
  // What was saved and how big: large datasets and figure sets are the
  // heaviest work this server does.
  const fields = Object.keys(set).filter((key) => key !== "updatedAt");
  if (fields.length) {
    log(patch.result ? "analysis.saved" : "project.saved", {
      project: doc._id.toHexString(),
      fields: fields.join(","),
      csvMB: typeof patch.csvText === "string" ? mb(Buffer.byteLength(patch.csvText)) : undefined,
      rows: patch.result ? patch.result.rowCount : undefined,
      outputsMB: outputsText ? mb(Buffer.byteLength(outputsText)) : undefined,
    });
  }
}

export function projectRoutes(db: Database) {
  const router = express.Router();
  router.use("/projects", requireUser);

  const own = async (req: Request, res: Response): Promise<ProjectDoc | null> => {
    const id = projectId(req, res);
    if (!id) return null;
    const doc = await db.projects.findOne({ _id: id, userId: req.user!._id });
    if (!doc) res.status(404).json({ error: "There is no such analysis." });
    return doc;
  };

  router.get("/projects", async (req, res) => {
    const docs = await db.projects.find({ userId: req.user!._id }).sort({ updatedAt: -1 }).toArray();
    res.json({ projects: docs.map(summarize) });
  });

  router.post("/projects", async (req, res) => {
    const patch = (req.body ?? {}) as ProjectPatch;
    const now = new Date();
    const doc: ProjectDoc = {
      _id: new ObjectId(),
      userId: req.user!._id,
      name: (patch.name ?? "").trim().slice(0, MAX_NAME) || "Untitled analysis",
      createdAt: now,
      updatedAt: now,
      step: 1,
      source: null,
      dataFileId: null,
      outputsFileId: null,
      schema: null,
      model: null,
      figures: null,
      result: null,
      interpretations: [],
    };
    await db.projects.insertOne(doc);
    log("project.created", { user: req.user!.username, project: doc._id.toHexString() });
    await applyPatch(db, doc, patch);
    const saved = await db.projects.findOne({ _id: doc._id });
    res.status(201).json({ project: summarize(saved!) });
  });

  router.get("/projects/:id", async (req, res) => {
    const doc = await own(req, res);
    if (!doc) return;
    const outputs = doc.outputsFileId ? (JSON.parse(await readText(db.outputs, doc.outputsFileId)) as ProjectOutputs) : null;
    const detail: ProjectDetail = {
      id: doc._id.toHexString(),
      name: doc.name,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      step: doc.step,
      source: doc.source,
      schema: doc.schema,
      model: doc.model,
      figures: doc.figures,
      result: doc.result,
      outputs,
      interpretations: doc.interpretations ?? [],
      threads: doc.threads ?? [],
    };
    res.json({ project: detail });
  });

  router.get("/projects/:id/data", async (req, res) => {
    const doc = await own(req, res);
    if (!doc) return;
    if (!doc.dataFileId) return void res.status(404).json({ error: "This analysis has no dataset yet." });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    db.datasets
      .openDownloadStream(doc.dataFileId)
      .on("error", () => res.status(404).end())
      .pipe(res);
  });

  router.patch("/projects/:id", async (req, res) => {
    const doc = await own(req, res);
    if (!doc) return;
    await applyPatch(db, doc, (req.body ?? {}) as ProjectPatch);
    const saved = await db.projects.findOne({ _id: doc._id });
    res.json({ project: summarize(saved!) });
  });

  router.post("/projects/:id/duplicate", async (req, res) => {
    const doc = await own(req, res);
    if (!doc) return;
    const now = new Date();
    const id = new ObjectId();
    const copy: ProjectDoc = {
      ...doc,
      _id: id,
      name: `${doc.name} (copy)`.slice(0, MAX_NAME),
      createdAt: now,
      updatedAt: now,
      dataFileId: doc.dataFileId
        ? await writeText(db.datasets, doc.source?.fileName ?? "data.csv", await readText(db.datasets, doc.dataFileId), id)
        : null,
      outputsFileId: doc.outputsFileId
        ? await writeText(db.outputs, "outputs.json", await readText(db.outputs, doc.outputsFileId), id)
        : null,
    };
    await db.projects.insertOne(copy);
    log("project.duplicated", { user: req.user!.username, from: doc._id.toHexString(), project: id.toHexString() });
    res.status(201).json({ project: summarize(copy) });
  });

  router.delete("/projects/:id", async (req, res) => {
    const doc = await own(req, res);
    if (!doc) return;
    await db.projects.deleteOne({ _id: doc._id });
    await removeFile(db.datasets, doc.dataFileId);
    await removeFile(db.outputs, doc.outputsFileId ?? null);
    log("project.deleted", { user: req.user!.username, project: doc._id.toHexString() });
    res.json({ ok: true });
  });

  return router;
}
