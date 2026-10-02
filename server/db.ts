// MongoDB: the requester's database in production (MONGODB_URI), or a local
// one for development that keeps its data in .data/mongo between restarts.

import { GridFSBucket, MongoClient, type Collection, type Db, type ObjectId } from "mongodb";
import type { CodingSchema, ConnectionThread, Interpretation, StoredResult, StoredSource, UserSettings } from "../shared/api.ts";
import { config } from "./config.ts";

export interface UserDoc {
  _id: ObjectId;
  username: string;
  passwordHash: string;
  createdAt: Date;
  settings: UserSettings;
  /** Consent to product news, when given: the address and the words agreed to. */
  news?: { email: string; consentText: string; consentedAt: Date } | null;
}

export interface SessionDoc {
  _id: string; // sha-256 of the cookie token; the token itself is never stored
  userId: ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

export interface ProjectDoc {
  _id: ObjectId;
  userId: ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  step: number;
  source: StoredSource | null;
  /** The dataset lives in GridFS: a CSV can outgrow a 16 MB document. */
  dataFileId: ObjectId | null;
  /** Figures and 3D plots (ProjectOutputs as JSON), also in GridFS: several MB per run. */
  outputsFileId: ObjectId | null;
  schema: CodingSchema | null;
  model: Record<string, unknown> | null;
  figures: Record<string, unknown> | null;
  result: StoredResult | null;
  interpretations: Interpretation[];
  threads?: ConnectionThread[];
}

/** Consent to product news: the address, the words agreed to, and when. */
export interface UpdatesDoc {
  _id: string; // the email address, lowercased
  consentText: string;
  consentedAt: Date;
  withdrawnAt: Date | null;
  source: string;
  /** The account that gave it, when it was given signed in. */
  userId?: ObjectId;
}

export interface Database {
  db: Db;
  users: Collection<UserDoc>;
  sessions: Collection<SessionDoc>;
  projects: Collection<ProjectDoc>;
  updates: Collection<UpdatesDoc>;
  datasets: GridFSBucket;
  outputs: GridFSBucket;
  close(): Promise<void>;
}

async function localUri(): Promise<{ uri: string; stop: () => Promise<void> }> {
  if (config.production) {
    throw new Error("MONGODB_URI is not set. The deployed server needs the MongoDB connection string.");
  }
  // Loaded only in development; the package is a dev dependency.
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(config.localDataDir, { recursive: true });
  const server = await MongoMemoryServer.create({
    instance: { dbPath: config.localDataDir, storageEngine: "wiredTiger" },
  });
  return { uri: server.getUri(), stop: async () => void (await server.stop({ doCleanup: false })) };
}

/** Store text as a GridFS file. */
export function writeText(bucket: GridFSBucket, name: string, text: string, projectId: ObjectId): Promise<ObjectId> {
  return new Promise((resolve, reject) => {
    const upload = bucket.openUploadStream(name, { metadata: { projectId } });
    upload.once("finish", () => resolve(upload.id as ObjectId));
    upload.once("error", reject);
    upload.end(Buffer.from(text, "utf8"));
  });
}

export async function readText(bucket: GridFSBucket, id: ObjectId): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of bucket.openDownloadStream(id)) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export async function removeFile(bucket: GridFSBucket, id: ObjectId | null) {
  if (!id) return;
  try {
    await bucket.delete(id);
  } catch {
    // Already gone; nothing to remove.
  }
}

export async function connect(): Promise<Database> {
  const local = config.mongoUri ? null : await localUri();
  const client = await MongoClient.connect(config.mongoUri ?? local!.uri);
  const db = client.db(config.mongoDb);

  const users = db.collection<UserDoc>("users");
  const sessions = db.collection<SessionDoc>("sessions");
  const projects = db.collection<ProjectDoc>("projects");
  await Promise.all([
    users.createIndex({ username: 1 }, { unique: true }),
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    projects.createIndex({ userId: 1, updatedAt: -1 }),
  ]);

  return {
    db,
    users,
    sessions,
    projects,
    updates: db.collection<UpdatesDoc>("updates"),
    datasets: new GridFSBucket(db, { bucketName: "datasets" }),
    outputs: new GridFSBucket(db, { bucketName: "outputs" }),
    async close() {
      await client.close();
      await local?.stop();
    },
  };
}
