// Autosave: the open analysis is saved to the account as the researcher works.
// Only what changed is sent, a moment after the last change; the dataset is
// sent only when it is new. Leaving the workspace sends anything still waiting.

import { create } from "zustand";
import type { ProjectPatch, StoredResult, StoredSource } from "../../shared/api";
import { api, ApiError } from "../api/client";
import { FIGURE_STYLE } from "../engine/version";
import { useStore, type RunResult, type Source } from "./store";

const DELAY = 800;

export interface SaveState {
  status: "saved" | "waiting" | "saving" | "error";
  savedAt: Date | null;
  message: string | null;
}

export const useSave = create<SaveState>(() => ({ status: "saved", savedAt: null, message: null }));

function storedSource(source: Source): StoredSource {
  return {
    fileName: source.fileName,
    fileSize: source.fileSize,
    options: { delimiter: source.options.delimiter, header: source.options.header },
    columns: source.table.columns,
    rowCount: source.table.rows.length,
    sampleId: source.sampleId,
  };
}

function storedResult(result: RunResult): StoredResult {
  return {
    summaryJson: result.summaryJson,
    units: result.units,
    fileName: result.fileName,
    rowCount: result.rowCount,
    finishedAt: result.finishedAt.toISOString(),
    model: result.model as unknown as Record<string, unknown>,
  };
}

let projectId: string | null = null;
let pending: ProjectPatch = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight: Promise<void> | null = null;
let unsubscribe: (() => void) | null = null;

function hasPending() {
  return Object.keys(pending).length > 0;
}

function queue(patch: ProjectPatch) {
  pending = { ...pending, ...patch };
  useSave.setState({ status: "waiting", message: null });
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), DELAY);
}

/** Send whatever is waiting now. Resolves once it is saved (or has failed). */
export async function flush(): Promise<void> {
  clearTimeout(timer);
  const bound = projectId;
  if (inflight) await inflight;
  // Another analysis may have opened while this waited; its changes are its own.
  if (!projectId || projectId !== bound || !hasPending()) return;
  const id = projectId;
  const patch = pending;
  pending = {};
  useSave.setState({ status: "saving", message: null });
  inflight = api("PATCH", `/projects/${id}`, patch)
    .then(() => {
      if (!hasPending()) useSave.setState({ status: "saved", savedAt: new Date(), message: null });
    })
    .catch((error: unknown) => {
      // Put it back beneath anything newer, to go with the next attempt.
      pending = { ...patch, ...pending };
      useSave.setState({
        status: "error",
        message: error instanceof ApiError ? error.message : "The analysis could not be saved.",
      });
    })
    .finally(() => {
      inflight = null;
    });
  await inflight;
  if (hasPending() && useSave.getState().status !== "error") await flush();
}

/** The analysis whose changes are being saved now, for anything that must change it only once saving has started. */
export const useBound = create<{ id: string | null }>(() => ({ id: null }));

/** Start saving changes to this analysis. Call after it has been opened (hydrated). */
export function bindProject(id: string) {
  unbindProject();
  projectId = id;
  useBound.setState({ id });
  pending = {};
  useSave.setState({ status: "saved", savedAt: null, message: null });

  unsubscribe = useStore.subscribe((state, previous) => {
    if (state.project?.id !== id) return;
    const patch: ProjectPatch = {};
    if (state.project.name !== previous.project?.name) patch.name = state.project.name;
    if (state.source !== previous.source) {
      patch.source = state.source ? storedSource(state.source) : null;
      if (state.source && state.source.text !== previous.source?.text) patch.csvText = state.source.text;
    }
    if (state.step !== previous.step) patch.step = state.step;
    if (state.model !== previous.model) patch.model = state.model as unknown as Record<string, unknown>;
    if (state.figures !== previous.figures) patch.figures = state.figures as unknown as Record<string, unknown>;
    if (state.schema !== previous.schema) patch.schema = state.schema;
    if (state.result !== previous.result) patch.result = state.result ? storedResult(state.result) : null;
    if (
      state.result !== previous.result ||
      state.svgs !== previous.svgs ||
      state.plots3d !== previous.plots3d ||
      state.focusUnits !== previous.focusUnits
    ) {
      patch.outputs = state.result
        ? { svgs: state.svgs as Record<string, string>, plots3d: state.plots3d, focusUnits: state.focusUnits, figureStyle: FIGURE_STYLE }
        : null;
    }
    if (state.interpretations !== previous.interpretations) patch.interpretations = state.interpretations;
    if (state.threads !== previous.threads) patch.threads = state.threads;
    if (Object.keys(patch).length > 0) queue(patch);
  });
}

/** Stop watching; anything waiting is still sent, to the analysis it belongs to. */
export function unbindProject() {
  useBound.setState({ id: null });
  unsubscribe?.();
  unsubscribe = null;
  clearTimeout(timer);
  const id = projectId;
  const patch = pending;
  projectId = null;
  pending = {};
  if (!id || Object.keys(patch).length === 0) return;
  const previous = inflight;
  const send: Promise<void> = (async () => {
    await previous;
    await api("PATCH", `/projects/${id}`, patch).catch(() => undefined);
  })().finally(() => {
    if (inflight === send) inflight = null;
  });
  inflight = send;
}

/** True while there is something the server does not have yet. */
export function unsaved(): boolean {
  return hasPending() || inflight !== null;
}
