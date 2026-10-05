// The platform's state machine (plan §6). The step a researcher is on, the
// source, the configuration, and the run are separate pieces of state; the
// plan's named states (idle, parsing, previewReady, configuring, ready,
// running, succeeded, failed) are derived from them in `machineState`.

import { create } from "zustand";
import type { CodingSchema, ConnectionThread, Interpretation, ProjectDetail } from "../../shared/api";
import { report } from "../api/client";
import { CancelledError, engine, EngineRequestError, type EngineStatus } from "../engine/client";
import type { EngineError, RunPhase } from "../engine/protocol";
import { FIGURE_STYLE, PYENA_COMMIT } from "../engine/version";
import { formatBytes, parseInWorker, sizeProblem } from "../data/load";
import { headerHash, type ParsedTable, type ParseOptions } from "../data/parse";
import { fetchSample, fetchSampleSchema, SAMPLES } from "../data/samples";
import { parseSchema } from "../data/schema";
import {
  absentCodes,
  censusGroups,
  DEFAULT_MODEL,
  defaultFigureOptions,
  pruneToColumns,
  readConfigFile,
  referencedColumns,
  toFigureInput,
  toModelInput,
  validate,
  type FigureOptions,
  type FocusUnits,
  type ModelConfig,
} from "../model/config";
import { FIGURE_IDS, INDIVIDUAL_FIGURES, type FigureId } from "../results/figures";
import { parseSummary, type Summary } from "../results/summary";

export type Step = 1 | 2 | 3 | 4 | 5;

/** The name a new analysis has until its first dataset names it (server/projects.ts). */
export const UNTITLED = "Untitled analysis";

export interface Source {
  fileName: string;
  fileSize: number;
  text: string;
  options: ParseOptions;
  table: ParsedTable;
  hash: string;
  sizeNote: string | null;
  sampleId: string | null;
}

export interface RunResult {
  summary: Summary;
  summaryJson: string;
  units: { label: string; group: string | null }[];
  model: ModelConfig;
  fileName: string;
  rowCount: number;
  finishedAt: Date;
}

export interface Notice {
  tone: "info" | "flag";
  text: string;
}

export interface Offer {
  kind: "preset" | "restore";
  text: string;
  model: ModelConfig;
  figures: FigureOptions | null;
  focus: FocusUnits | null;
}

interface RunState {
  status: "idle" | "running" | "succeeded" | "failed";
  phase: RunPhase | null;
  error: EngineError | null;
}

interface State {
  source: Source | null;
  parsing: { status: "idle" | "parsing" | "error"; message: string | null; fileName: string | null };
  step: Step;
  model: ModelConfig;
  figures: FigureOptions;
  run: RunState;
  result: RunResult | null;
  svgs: Partial<Record<FigureId, string>>;
  /** plotly figure JSON for the 3D networks of a three-dimensional model. */
  plots3d: Record<string, string>;
  plots3dError: string | null;
  /** The individual comparison: one unit from each group (pyENA's focus_unit_a / focus_unit_b). */
  focusUnits: FocusUnits;
  redraw: { status: "idle" | "drawing" | "error"; message: string | null };
  /** Figures being redrawn right now, so each can show it is loading. */
  redrawing: FigureId[];
  /** The 3D networks are being redrawn. */
  redrawing3d: boolean;
  /** Set when figure options changed but the engine no longer holds the model to redraw from. */
  figuresStale: boolean;
  offer: Offer | null;
  notice: Notice | null;
  engine: EngineStatus;
  /** A file is being dragged over the page. */
  dragActive: boolean;
  /** A file waiting for the researcher to confirm it replaces results. */
  pendingFile: File | null;
  /** An example waiting for the same confirmation. */
  pendingSample: string | null;
  /** The coding schema: what each code means. Optional, and never part of the analysis itself. */
  schema: CodingSchema | null;
  schemaStatus: { status: "idle" | "reading" | "error"; message: string | null; fileName: string | null };
  /** Written interpretations of the results, newest last. */
  interpretations: Interpretation[];
  /** Conversations about single figures and edges, one per figure or edge (src/interpret/connection). */
  threads: ConnectionThread[];
  /** The saved analysis this session belongs to. */
  project: { id: string; name: string } | null;

  setDragActive(active: boolean): void;
  /** Every file from a picker or a drop comes through here. */
  requestFile(files: FileList | File[]): void;
  confirmPendingFile(): void;
  cancelPendingFile(): void;
  loadFile(file: File, sampleId?: string | null): Promise<void>;
  loadSample(sampleId: string): Promise<void>;
  reparse(options: Partial<ParseOptions>): Promise<void>;
  deleteSource(): void;
  setStep(step: Step): void;
  updateModel(patch: Partial<ModelConfig>): void;
  updateFigures(patch: Partial<FigureOptions>): void;
  applyOffer(): void;
  dismissOffer(): void;
  dismissNotice(): void;
  loadConfigText(text: string): void;
  runAnalysis(): Promise<void>;
  cancelRun(): void;
  setFocusUnit(side: 0 | 1, label: string): void;
  /** Draw these figures again from the model in the engine (a retry). */
  redrawFigure(ids: FigureId[]): void;
  /** Draw the 3D networks again (a retry). */
  redraw3d(): void;
  retryEngine(): void;
  loadSchemaFile(file: File): Promise<void>;
  removeSchema(): void;
  addInterpretation(entry: Interpretation): void;
  /** Keep a figure's or edge's conversation, replacing the earlier copy of it. */
  saveThread(thread: ConnectionThread): void;
  renameProject(name: string): void;
  /** Open a saved analysis as it was saved. */
  hydrate(detail: ProjectDetail, csvText: string | null): Promise<void>;
  /** Clear everything before another analysis opens. */
  reset(): void;
}

const IDLE_RUN: RunState = { status: "idle", phase: null, error: null };
const STORAGE_PREFIX = "pyena-platform:config:";

function saveConfig(hash: string, model: ModelConfig, figures: FigureOptions, step: Step) {
  try {
    localStorage.setItem(STORAGE_PREFIX + hash, JSON.stringify({ model, figures, step, savedAt: Date.now() }));
  } catch {
    // Storage can be unavailable (private windows); persistence is a convenience.
  }
}

function loadSavedConfig(hash: string): { model: ModelConfig; figures: FigureOptions } | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + hash);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.model || referencedColumns({ ...DEFAULT_MODEL, ...saved.model }).length === 0) return null;
    return { model: { ...DEFAULT_MODEL, ...saved.model }, figures: saved.figures ?? null };
  } catch {
    return null;
  }
}

const READABLE = /\.(csv|tsv|txt)$/i;
const SCHEMA_LIMIT = 2 * 1024 * 1024;

/** Why a file cannot be read as a source, or null when it can. */
export function unreadableReason(file: File): string | null {
  if (READABLE.test(file.name) || file.type === "text/csv" || file.type === "text/tab-separated-values") return null;
  if (/\.(xlsx|xls|xlsm|ods|numbers)$/i.test(file.name)) {
    return `${file.name} is a spreadsheet workbook. Save it as CSV (in Excel: File, Save As, CSV) and drop the CSV here.`;
  }
  return `${file.name} is not a CSV file. The platform reads comma-, tab- or semicolon-separated text.`;
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

let redrawTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<State>((set, get) => {
  const persist = () => {
    const { source, model, figures, step } = get();
    if (source) saveConfig(source.hash, model, figures, step);
  };

  /** A new table for the session: from a new file, a replaced file, or a re-parse. */
  const adoptTable = (
    base: Omit<Source, "table" | "hash">,
    table: ParsedTable,
    reason: "new" | "replace" | "reparse",
  ) => {
    const hash = headerHash(table.columns);
    let model = get().model;
    let figures = get().figures;
    let notice: Notice | null = base.sizeNote ? { tone: "flag", text: base.sizeNote } : null;
    let offer: Offer | null = null;

    if (reason === "new") {
      model = DEFAULT_MODEL;
      figures = defaultFigureOptions();
    } else {
      const referenced = referencedColumns(model);
      const missing = referenced.filter((column) => !table.columns.includes(column));
      if (missing.length > 0) {
        model = DEFAULT_MODEL;
        notice = {
          tone: "flag",
          text: `Configuration cleared: ${list(missing)} ${missing.length === 1 ? "is" : "are"} not in ${base.fileName}.`,
        };
      } else if (referenced.length > 0) {
        notice = { tone: "info", text: `Configuration kept: every selected column is in ${base.fileName}.` };
      }
    }

    const configEmpty = referencedColumns(model).length === 0;
    const sample = SAMPLES.find((entry) => entry.id === base.sampleId);
    // An example always offers its own configuration, even when the columns of
    // the current one also fit (RS.data and RS.data in 3D share a file).
    const presetDiffers =
      sample !== undefined && JSON.stringify(pruneToColumns(sample.preset, table.columns)) !== JSON.stringify(model);
    if (sample && presetDiffers) {
      offer = {
        kind: "preset",
        text: `This dataset ships with the configuration from ${sample.script}.`,
        model: sample.preset,
        figures: null,
        focus: sample.focus ?? null,
      };
    } else if (configEmpty) {
      const saved = loadSavedConfig(hash);
      if (saved) {
        offer = {
          kind: "restore",
          text: "A configuration for a file with these same columns was saved in this browser.",
          model: saved.model,
          figures: saved.figures,
          focus: null,
        };
      }
    }

    // A new dataset stays on Upload, so the coding schema can be added beside
    // it; replacing one from a later step goes back to Preview to check it.
    const step: Step = reason === "reparse" ? get().step : (Math.min(get().step, 2) as Step);
    const project = get().project;
    const named =
      project && project.name === UNTITLED && reason !== "reparse"
        ? { ...project, name: sample?.name ?? base.fileName.replace(/\.(csv|tsv|txt)$/i, "") }
        : project;

    set({
      source: { ...base, table, hash },
      parsing: { status: "idle", message: null, fileName: null },
      step,
      project: named,
      model,
      figures,
      run: IDLE_RUN,
      result: null,
      svgs: {},
      plots3d: {},
      plots3dError: null,
      focusUnits: [null, null],
      redraw: { status: "idle", message: null },
      figuresStale: false,
      offer,
      notice,
    });
  };

  // The newest request per figure: an older request finishing never clears a
  // figure a newer one is still drawing.
  const latestRequest = new Map<FigureId, number>();
  let requestCount = 0;

  // A reopened analysis shows its saved figures, but the engine holds no model
  // until something needs drawing. Then the saved run is repeated quietly, from
  // the same rows and the same configuration, so figures can be redrawn.
  let rebuilding: Promise<boolean> | null = null;
  const ensureModel = (): Promise<boolean> => {
    if (engine.hasModel) return Promise.resolve(true);
    const { source, result, figures, focusUnits } = get();
    if (!source || !result || source.fileName !== result.fileName || source.table.rows.length !== result.rowCount) {
      return Promise.resolve(false);
    }
    rebuilding ??= engine
      .run(JSON.stringify(source.table.rows), toModelInput(result.model), toFigureInput(figures, focusUnits), [], () => undefined, false)
      .then(() => get().result === result)
      .catch(() => false)
      .finally(() => {
        rebuilding = null;
      });
    return rebuilding;
  };

  const redrawFigures = (ids: FigureId[]) => {
    const { result, figures, focusUnits } = get();
    if (!result) return;
    if (!engine.hasModel) {
      set((state) => ({ redrawing: [...new Set([...state.redrawing, ...ids])] }));
      void ensureModel().then((ready) => {
        if (ready && engine.hasModel) redrawFigures(ids);
        else set((state) => ({ figuresStale: true, redrawing: state.redrawing.filter((id) => !ids.includes(id)) }));
      });
      return;
    }
    const request = ++requestCount;
    ids.forEach((id) => latestRequest.set(id, request));
    const settle = (state: State) => {
      const finished = ids.filter((id) => latestRequest.get(id) === request);
      return state.redrawing.filter((id) => !finished.includes(id));
    };
    set((state) => ({
      redraw: { status: "drawing", message: null },
      redrawing: [...new Set([...state.redrawing, ...ids])],
    }));
    engine
      .render(ids, toFigureInput(figures, focusUnits))
      .then((rendered) =>
        set((state) => ({
          svgs: { ...state.svgs, ...rendered.figures },
          focusUnits: rendered.focus,
          redraw: { status: "idle", message: null },
          redrawing: settle(state),
        })),
      )
      .catch((error) => {
        if (error instanceof CancelledError) return;
        if (error instanceof EngineRequestError && error.error.kind === "no_state") {
          set((state) => ({ figuresStale: true, redraw: { status: "idle", message: null }, redrawing: settle(state) }));
          return;
        }
        set((state) => ({ redraw: { status: "error", message: (error as Error).message }, redrawing: settle(state) }));
      });
  };

  const redrawPlots3d = () => {
    const { figures, focusUnits } = get();
    if (!engine.hasModel) {
      set({ redrawing3d: true });
      void ensureModel().then((ready) => {
        if (ready && engine.hasModel) redrawPlots3d();
        else set({ redrawing3d: false, figuresStale: true });
      });
      return;
    }
    set({ redrawing3d: true });
    engine
      .render3d(toFigureInput(figures, focusUnits))
      .then((plots3d) => set({ plots3d, plots3dError: null, redrawing3d: false }))
      .catch((error) => {
        if (error instanceof CancelledError) return;
        set({ plots3dError: (error as Error).message, redrawing3d: false });
      });
  };

  engine.subscribe((status) => {
    set({ engine: status });
    if (status.state === "failed") report({ type: "engine.failed", error: status.message });
  });

  return {
    source: null,
    parsing: { status: "idle", message: null, fileName: null },
    step: 1,
    model: DEFAULT_MODEL,
    figures: defaultFigureOptions(),
    run: IDLE_RUN,
    result: null,
    svgs: {},
    plots3d: {},
    plots3dError: null,
    focusUnits: [null, null],
    redraw: { status: "idle", message: null },
    redrawing: [],
    redrawing3d: false,
    figuresStale: false,
    offer: null,
    notice: null,
    engine: engine.status,
    dragActive: false,
    pendingFile: null,
    pendingSample: null,
    schema: null,
    schemaStatus: { status: "idle", message: null, fileName: null },
    interpretations: [],
    threads: [],
    project: null,

    setDragActive(active) {
      if (get().dragActive !== active) set({ dragActive: active });
    },

    requestFile(files) {
      const all = [...files];
      const file = all[0];
      if (!file) return;
      const reason = unreadableReason(file);
      if (reason) {
        set({ parsing: { status: "error", message: reason, fileName: file.name }, step: get().source ? get().step : 1 });
        return;
      }
      const load = () =>
        void get()
          .loadFile(file)
          .then(() => {
            if (all.length > 1) {
              set({
                notice: {
                  tone: "flag",
                  text: `${all.length} files were dropped. The platform reads one source at a time, so only ${file.name} was read.`,
                },
              });
            }
          });
      // A new file clears results: confirm first rather than lose them silently.
      if (get().result) set({ pendingFile: file });
      else load();
    },

    confirmPendingFile() {
      const { pendingFile, pendingSample } = get();
      set({ pendingFile: null, pendingSample: null });
      if (pendingFile) void get().loadFile(pendingFile);
      else if (pendingSample) void get().loadSample(pendingSample);
    },

    cancelPendingFile() {
      set({ pendingFile: null, pendingSample: null });
    },

    async loadFile(file, sampleId = null) {
      const problem = sizeProblem(file.size);
      if (problem?.fatal) {
        set({ parsing: { status: "error", message: problem.message, fileName: file.name } });
        return;
      }
      const replacing = get().source !== null;
      set({ parsing: { status: "parsing", message: null, fileName: file.name } });
      try {
        const text = await file.text();
        const options: ParseOptions = { delimiter: "auto", header: true };
        const table = await parseInWorker(text, options);
        adoptTable(
          { fileName: file.name, fileSize: file.size, text, options, sizeNote: problem?.message ?? null, sampleId },
          table,
          replacing ? "replace" : "new",
        );
      } catch (error) {
        set({ parsing: { status: "error", message: (error as Error).message, fileName: file.name } });
      }
    },

    async loadSample(sampleId) {
      const sample = SAMPLES.find((entry) => entry.id === sampleId);
      if (!sample) return;
      set({ parsing: { status: "parsing", message: null, fileName: sample.file.split("/").pop()! } });
      try {
        const file = await fetchSample(sample);
        await get().loadFile(file, sample.id);
        if (get().source?.sampleId !== sample.id) return;
        // The example's own codebook comes with it; another example's goes.
        const schemaFile = fetchSampleSchema(sample);
        if (schemaFile) await get().loadSchemaFile(await schemaFile);
        else if (SAMPLES.some((entry) => entry.schema?.endsWith(`/${get().schema?.fileName}`))) get().removeSchema();
      } catch (error) {
        set({ parsing: { status: "error", message: (error as Error).message, fileName: sample.name } });
      }
    },

    async reparse(patch) {
      const source = get().source;
      if (!source) return;
      const options = { ...source.options, ...patch };
      set({ parsing: { status: "parsing", message: null, fileName: source.fileName } });
      try {
        const table = await parseInWorker(source.text, options);
        adoptTable({ ...source, options }, table, "reparse");
      } catch (error) {
        set({ parsing: { status: "error", message: (error as Error).message, fileName: source.fileName } });
      }
    },

    deleteSource() {
      if (get().run.status === "running") engine.restart();
      set({
        source: null,
        parsing: { status: "idle", message: null, fileName: null },
        step: 1,
        model: DEFAULT_MODEL,
        figures: defaultFigureOptions(),
        run: IDLE_RUN,
        result: null,
        svgs: {},
        plots3d: {},
        plots3dError: null,
        focusUnits: [null, null],
        figuresStale: false,
        offer: null,
        notice: null,
      });
    },

    setStep(step) {
      set({ step });
      persist();
    },

    updateModel(patch) {
      set((state) => ({ model: { ...state.model, ...patch } }));
      persist();
    },

    updateFigures(patch) {
      set((state) => ({ figures: { ...state.figures, ...patch } }));
      persist();
      const { figures, result } = get();
      if (!result || figures.colorA.toLowerCase() === figures.colorB.toLowerCase()) return;
      clearTimeout(redrawTimer);
      redrawTimer = setTimeout(() => {
        redrawFigures(FIGURE_IDS);
        if (get().result?.model.dimensions === 3) redrawPlots3d();
      }, 250);
    },

    applyOffer() {
      const offer = get().offer;
      const source = get().source;
      if (!offer || !source) return;
      const model = pruneToColumns(offer.model, source.table.columns);
      set((state) => ({
        model,
        figures: offer.figures ?? state.figures,
        focusUnits: offer.focus ?? state.focusUnits,
        offer: null,
        step: 3,
        notice: {
          tone: "info",
          text: offer.kind === "preset" ? "Example configuration applied." : "Saved configuration restored.",
        },
      }));
      persist();
    },

    dismissOffer() {
      set({ offer: null });
    },

    dismissNotice() {
      set({ notice: null });
    },

    loadConfigText(text) {
      const source = get().source;
      if (!source) return;
      try {
        const { model, figures, missing } = readConfigFile(text, source.table.columns);
        set((state) => ({
          model: pruneToColumns(model, source.table.columns),
          figures: figures ?? state.figures,
          offer: null,
          notice:
            missing.length > 0
              ? {
                  tone: "flag",
                  text: `The configuration names ${missing.length === 1 ? "a column" : "columns"} this file does not have: ${list(missing)}. ${missing.length === 1 ? "It was" : "They were"} left out.`,
                }
              : { tone: "info", text: "Configuration loaded." },
        }));
        persist();
      } catch (error) {
        set({ notice: { tone: "flag", text: (error as Error).message } });
      }
    },

    async runAnalysis() {
      const { source, model, figures, result, focusUnits } = get();
      if (!source) return;
      const census =
        model.groupColumn !== null ? censusGroups(source.table.rows, model.units, model.groupColumn) : null;
      if (validate(model, figures, census, absentCodes(source.table.rows, model)).length > 0) return;

      // The chosen units carry over; pyENA's bridge falls back to each group's
      // first unit when a choice no longer belongs to its group.
      const previous = result;
      const previousSvgs = get().svgs;
      const previousPlots3d = get().plots3d;

      set({
        step: 4,
        run: { status: "running", phase: engine.status.state === "ready" ? "accumulate" : "boot", error: null },
        redraw: { status: "idle", message: null },
      });
      persist();

      const started = performance.now();
      try {
        const output = await engine.run(
          JSON.stringify(source.table.rows),
          toModelInput(model),
          toFigureInput(figures, focusUnits),
          FIGURE_IDS,
          (phase) => set((state) => ({ run: { ...state.run, phase } })),
        );
        const summary = parseSummary(output.summary_json);
        set({
          result: {
            summary,
            summaryJson: output.summary_json,
            units: output.units,
            model: structuredClone(model),
            fileName: source.fileName,
            rowCount: source.table.rows.length,
            finishedAt: new Date(),
          },
          svgs: output.figures,
          redrawing: [],
          redrawing3d: false,
          plots3d: output.figures3d ?? {},
          plots3dError: output.figures3dError ?? null,
          focusUnits: output.focus,
          figuresStale: false,
          run: { status: "succeeded", phase: null, error: null },
          step: 5,
        });
        report({
          type: "analysis.done",
          ms: performance.now() - started,
          rows: source.table.rows.length,
          codes: model.codes.length,
          figures: Object.keys(output.figures).length,
        });
      } catch (error) {
        if (error instanceof CancelledError) {
          // Back to ready with the configuration intact; earlier results, if any, stay (stale if changed).
          set({
            run: previous ? { status: "succeeded", phase: null, error: null } : IDLE_RUN,
            result: previous,
            svgs: previousSvgs,
            plots3d: previousPlots3d,
            step: 4,
          });
          return;
        }
        const engineError: EngineError =
          error instanceof EngineRequestError
            ? error.error
            : { kind: "engine", message: (error as Error).message, detail: null };
        set({ run: { status: "failed", phase: null, error: engineError }, result: null, svgs: {} });
        report({
          type: "analysis.failed",
          ms: performance.now() - started,
          rows: source.table.rows.length,
          codes: model.codes.length,
          kind: engineError.kind,
          error: engineError.message,
        });
      }
    },

    cancelRun() {
      engine.restart();
    },

    redrawFigure(ids) {
      redrawFigures(ids);
    },

    redraw3d() {
      set({ plots3dError: null });
      redrawPlots3d();
    },

    setFocusUnit(side, label) {
      set((state) => {
        const focusUnits: FocusUnits = [...state.focusUnits];
        focusUnits[side] = label;
        return { focusUnits };
      });
      redrawFigures(INDIVIDUAL_FIGURES);
    },

    retryEngine() {
      engine.restart();
    },

    async loadSchemaFile(file) {
      if (file.size > SCHEMA_LIMIT) {
        set({
          schemaStatus: {
            status: "error",
            message: `${file.name} is ${formatBytes(file.size)}. A coding schema is a short list of codes; the limit is 2 MB.`,
            fileName: file.name,
          },
        });
        return;
      }
      if (unreadableReason(file)) {
        set({
          schemaStatus: {
            status: "error",
            message: `${file.name} is not a CSV file. Save the coding schema as CSV with a column of codes and a column of meanings.`,
            fileName: file.name,
          },
        });
        return;
      }
      set({ schemaStatus: { status: "reading", message: null, fileName: file.name } });
      try {
        const schema = parseSchema(await file.text(), file.name);
        set({ schema, schemaStatus: { status: "idle", message: null, fileName: null } });
      } catch (error) {
        set({ schemaStatus: { status: "error", message: (error as Error).message, fileName: file.name } });
      }
    },

    removeSchema() {
      set({ schema: null, schemaStatus: { status: "idle", message: null, fileName: null } });
    },

    addInterpretation(entry) {
      set((state) => ({ interpretations: [...state.interpretations, entry].slice(-10) }));
    },

    saveThread(thread) {
      set((state) => ({ threads: [...state.threads.filter((entry) => entry.key !== thread.key), thread].slice(-60) }));
    },

    renameProject(name) {
      const project = get().project;
      const trimmed = name.trim().slice(0, 120);
      if (!project || !trimmed || trimmed === project.name) return;
      set({ project: { ...project, name: trimmed } });
    },

    async hydrate(detail, csvText) {
      get().reset();
      let source: Source | null = null;
      if (detail.source && csvText !== null) {
        const options = detail.source.options as ParseOptions;
        const table = await parseInWorker(csvText, options);
        source = {
          fileName: detail.source.fileName,
          fileSize: detail.source.fileSize,
          text: csvText,
          options,
          table,
          hash: headerHash(table.columns),
          sizeNote: null,
          sampleId: detail.source.sampleId,
        };
      }
      const saved = detail.result;
      const result: RunResult | null =
        saved && source
          ? {
              summary: parseSummary(saved.summaryJson),
              summaryJson: saved.summaryJson,
              units: saved.units,
              model: { ...DEFAULT_MODEL, ...(saved.model as Partial<ModelConfig>) },
              fileName: saved.fileName ?? source.fileName,
              rowCount: saved.rowCount ?? source.table.rows.length,
              finishedAt: new Date(saved.finishedAt),
            }
          : null;
      const step = Math.min(5, Math.max(1, Math.round(detail.step))) as Step;
      set({
        project: { id: detail.id, name: detail.name },
        source,
        step: !source ? 1 : step === 5 && !result ? 4 : step,
        model: detail.model ? { ...DEFAULT_MODEL, ...(detail.model as Partial<ModelConfig>) } : DEFAULT_MODEL,
        figures: { ...defaultFigureOptions(), ...((detail.figures ?? {}) as Partial<FigureOptions>) },
        result,
        run: result ? { status: "succeeded", phase: null, error: null } : IDLE_RUN,
        svgs: result ? ((detail.outputs?.svgs ?? {}) as State["svgs"]) : {},
        plots3d: result ? (detail.outputs?.plots3d ?? {}) : {},
        focusUnits: detail.outputs?.focusUnits ?? [null, null],
        schema: detail.schema,
        interpretations: detail.interpretations ?? [],
        threads: detail.threads ?? [],
      });
      // Figures saved in an older display style are drawn again, from the same model.
      if (result && detail.outputs?.figureStyle !== FIGURE_STYLE) redrawFigures(FIGURE_IDS);
    },

    reset() {
      if (get().run.status === "running") engine.restart();
      // The engine may hold another analysis's model; figures must not be drawn from it.
      engine.forgetModel();
      clearTimeout(redrawTimer);
      set({
        source: null,
        parsing: { status: "idle", message: null, fileName: null },
        step: 1,
        model: DEFAULT_MODEL,
        figures: defaultFigureOptions(),
        run: IDLE_RUN,
        result: null,
        svgs: {},
        plots3d: {},
        plots3dError: null,
        focusUnits: [null, null],
        redraw: { status: "idle", message: null },
        redrawing: [],
        redrawing3d: false,
        figuresStale: false,
        offer: null,
        notice: null,
        pendingFile: null,
        pendingSample: null,
        schema: null,
        schemaStatus: { status: "idle", message: null, fileName: null },
        interpretations: [],
        threads: [],
        project: null,
      });
    },
  };
});

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

export type MachineState =
  | "idle"
  | "parsing"
  | "previewReady"
  | "configuring"
  | "ready"
  | "running"
  | "succeeded"
  | "failed";

export function machineState(state: State, valid: boolean): MachineState {
  if (state.parsing.status === "parsing") return "parsing";
  if (!state.source) return "idle";
  if (state.run.status === "running") return "running";
  if (state.run.status === "failed") return "failed";
  if (state.result) return "succeeded";
  if (state.step === 2) return "previewReady";
  return valid ? "ready" : "configuring";
}

export function describeSource(source: Source): string {
  const { rows, columns } = source.table;
  return `${rows.length.toLocaleString("en-US")} rows / ${columns.length} columns`;
}

export function sourceMeta(source: Source): string[] {
  const meta = [describeSource(source), formatBytes(source.fileSize)];
  const delimiter = { ",": "comma", "\t": "tab", ";": "semicolon" }[source.table.delimiter];
  if (delimiter) meta.push(`${delimiter}-separated`);
  return meta;
}

export { PYENA_COMMIT };
