// Types shared by the server (server/) and the browser app (src/). Only plain
// JSON shapes live here; each side owns its own behaviour.

export type ThemeMode = "light" | "dark" | "system";

/**
 * The first-time tutorial, for this account. A new account starts at
 * "not_started", which starts it; accounts made before the tutorial existed
 * have no value and are never started automatically.
 */
export type TutorialState = "not_started" | "in_progress" | "completed" | "skipped";

export interface UserSettings {
  theme: ThemeMode;
  tutorial?: TutorialState;
  /** One-time notices this account has seen or dismissed, by id. */
  notices?: string[];
}

export interface PublicUser {
  id: string;
  username: string;
  settings: UserSettings;
  /** Consent to product news, if given; until it is, pyENA asks at sign-in. */
  news: { email: string } | null;
}

/** One code and what it means, from an uploaded coding schema. */
export interface SchemaEntry {
  code: string;
  meaning: string;
}

export interface CodingSchema {
  fileName: string;
  entries: SchemaEntry[];
  /** The columns the codes and meanings were read from; null when the file had no header. */
  codeColumn: string | null;
  meaningColumn: string | null;
}

export interface StoredSource {
  fileName: string;
  fileSize: number;
  options: { delimiter: string; header: boolean };
  columns: string[];
  rowCount: number;
  sampleId: string | null;
}

export interface StoredResult {
  summaryJson: string;
  units: { label: string; group: string | null }[];
  fileName: string;
  rowCount: number;
  finishedAt: string;
  /** The model configuration the result was computed with. */
  model: Record<string, unknown>;
}

export interface Interpretation {
  text: string;
  createdAt: string;
  /** "built-in" for the platform's own writer, otherwise the Claude model id. */
  author: string;
  /** finishedAt of the run it interprets. */
  resultAt: string;
}

export interface ProjectOutputs {
  svgs: Record<string, string>;
  plots3d: Record<string, string>;
  focusUnits: [string | null, string | null];
  /** The display style the figures were drawn in (src/engine/version.ts). */
  figureStyle?: number;
}

/**
 * What a connection conversation is about: a whole 2D figure, or one edge.
 * An edge is its two codes, sorted, so the same relationship is one
 * conversation whether it was opened from the 3D view or the Model tab.
 */
export type InterpretTarget = { kind: "figure"; figureId: string; title: string } | { kind: "edge"; codes: [string, string] };

export interface ThreadMessage {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  /** The model that wrote an answer; "example" for the tutorial's canned answer. */
  author?: string;
  /** The researcher added this answer to the analysis's notes. */
  noted?: boolean;
}

/** A saved conversation about one figure or edge of an analysis. */
export interface ConnectionThread {
  /** "figure:<id>" or "edge:<code>__<code>". */
  key: string;
  target: InterpretTarget;
  /** finishedAt of the run it was about; a later run marks it "from an earlier run". */
  resultAt: string;
  messages: ThreadMessage[];
  updatedAt: string;
}

/** One request for a connection analysis: the context the browser gathered, and the conversation so far. */
export interface ConnectionRequest {
  /** The figure or edge, in words, for the record. */
  label: string;
  /** Everything the model may use, gathered in the browser for this figure or edge only. */
  context: string;
  /** Alternating turns, starting and ending with the researcher's. */
  turns: { role: "user" | "assistant"; text: string }[];
}

/** A row in the analysis history. */
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "analysed";
  step: number;
  fileName: string | null;
  rowCount: number | null;
  codes: number;
  groups: [string | null, string | null];
  dimensions: number;
  hasSchema: boolean;
  /** Dimensions on which Welch's t test separates the two groups at p < .05, from the saved result. */
  separates: number[];
  interpretations: number;
  /** Conversations about figures and connections that hold at least one question. */
  conversations: number;
}

/** A full project: everything needed to reopen the analysis. */
export interface ProjectDetail {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  step: number;
  source: StoredSource | null;
  schema: CodingSchema | null;
  model: Record<string, unknown> | null;
  figures: Record<string, unknown> | null;
  result: StoredResult | null;
  outputs: ProjectOutputs | null;
  interpretations: Interpretation[];
  threads?: ConnectionThread[];
}

/** What the browser may change on a project. Absent fields stay as they are. */
export interface ProjectPatch {
  name?: string;
  step?: number;
  source?: StoredSource | null;
  /** The dataset itself, sent only when it changes. */
  csvText?: string;
  schema?: CodingSchema | null;
  model?: Record<string, unknown> | null;
  figures?: Record<string, unknown> | null;
  result?: StoredResult | null;
  outputs?: ProjectOutputs | null;
  interpretations?: Interpretation[];
  threads?: ConnectionThread[];
}

export interface InterpretRequest {
  summaryJson: string;
  schema: SchemaEntry[];
  context: {
    fileName: string;
    groupColumn: string;
    groups: [string, string];
    rotation: string;
    dimensions: number;
    window: string;
    excerpts: { group: string; codes: [string, string]; unit: string; text: string }[];
  };
}

export interface InterpretStatus {
  available: boolean;
  model: string | null;
  /** Who writes the AI reading: "Claude" or "OpenAI"; null when unavailable. */
  provider?: "Claude" | "OpenAI" | null;
}
