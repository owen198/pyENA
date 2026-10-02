// Main-thread handle on the engine worker. Owns its lifecycle: boot as early
// as possible (plan §3.4), and on cancel terminate and restart it, because a
// running Pyodide call cannot be interrupted (plan §10.3).

import type {
  BootPhase,
  EngineError,
  EngineVersions,
  FigureInput,
  MainToWorker,
  ModelInput,
  Rendered,
  RunOutput,
  RunPhase,
  Tokens,
  WorkerToMain,
} from "./protocol";
import { paperToken } from "../theme/paper";
import { PYENA_ARCHIVE } from "./version";

export const PYODIDE_VERSION = "314.0.7";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** The token names the figure style reads; values come from tokens.css at runtime. */
const FIGURE_TOKENS = ["surface", "surface-soft", "ink", "ink-secondary", "border", "brand", "accent"];

export type EngineStatus =
  | { state: "booting"; phase: BootPhase }
  | { state: "ready"; versions: EngineVersions }
  | { state: "failed"; message: string };

export class EngineRequestError extends Error {
  constructor(public readonly error: EngineError) {
    super(error.message);
  }
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
  }
}

interface Pending {
  resolve: (value: never) => void;
  reject: (reason: unknown) => void;
  onPhase?: (phase: RunPhase) => void;
}

/** Figures are drawn on paper in either theme, so they read the paper tokens. */
export function readTokens(): Tokens {
  return Object.fromEntries(FIGURE_TOKENS.map((name) => [name, paperToken(name)]));
}

export class Engine {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(status: EngineStatus) => void>();
  status: EngineStatus = { state: "booting", phase: "runtime" };
  /** False once the worker restarts: figures can no longer be redrawn from it. */
  hasModel = false;

  subscribe(listener: (status: EngineStatus) => void) {
    this.listeners.add(listener);
    listener(this.status);
    return () => void this.listeners.delete(listener);
  }

  private setStatus(status: EngineStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  boot() {
    if (this.worker) return;
    const worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<WorkerToMain>) => this.receive(event.data);
    worker.onerror = (event) => this.setStatus({ state: "failed", message: event.message || "The worker stopped." });
    this.worker = worker;
    this.hasModel = false;
    this.setStatus({ state: "booting", phase: "runtime" });
    this.send({
      type: "boot",
      pyodideBase: PYODIDE_BASE,
      archiveUrl: new URL(import.meta.env.BASE_URL + PYENA_ARCHIVE, location.href).href,
      fontUrl: new URL(import.meta.env.BASE_URL + "ds/fonts/Figtree-VariableFont_wght.ttf", location.href).href,
      tokens: readTokens(),
    });
  }

  /** Stop whatever is running and start a fresh engine. */
  restart() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach((request) => request.reject(new CancelledError()));
    this.pending.clear();
    this.boot();
  }

  private send(message: MainToWorker) {
    this.worker?.postMessage(message);
  }

  private receive(message: WorkerToMain) {
    switch (message.type) {
      case "boot:progress":
        this.setStatus({ state: "booting", phase: message.phase });
        return;
      case "boot:ready":
        this.setStatus({ state: "ready", versions: message.versions });
        return;
      case "boot:error":
        this.setStatus({ state: "failed", message: message.message });
        this.pending.forEach((request) =>
          request.reject(new EngineRequestError({ kind: "engine", message: message.message, detail: null })),
        );
        this.pending.clear();
        return;
      case "run:phase":
        this.pending.get(message.id)?.onPhase?.(message.phase);
        return;
    }
    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id);
    if (message.type === "request:error") request.reject(new EngineRequestError(message.error));
    else if (message.type === "run:done") {
      this.hasModel = true;
      request.resolve(message.output as never);
    } else if (message.type === "render:done") request.resolve(message.rendered as never);
    else if (message.type === "render3d:done") request.resolve(message.figures3d as never);
    else if (message.type === "export:done") request.resolve(message.bytes as never);
  }

  private request<T>(build: (id: number) => MainToWorker, onPhase?: (phase: RunPhase) => void): Promise<T> {
    this.boot();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: never) => void, reject, onPhase });
      this.send(build(id));
    });
  }

  run(
    recordsJson: string,
    model: ModelInput,
    figures: FigureInput,
    figureIds: string[],
    onPhase: (phase: RunPhase) => void,
    with3d = true,
  ): Promise<RunOutput> {
    return this.request((id) => ({ type: "run", id, recordsJson, model, figures, figureIds, with3d }), onPhase);
  }

  /** The model the engine holds no longer belongs to what is on screen (another analysis was opened). */
  forgetModel() {
    this.hasModel = false;
  }

  render(figureIds: string[], figures: FigureInput): Promise<Rendered> {
    return this.request((id) => ({ type: "render", id, figureIds, figures }));
  }

  render3d(figures: FigureInput): Promise<Record<string, string>> {
    return this.request((id) => ({ type: "render3d", id, figures }));
  }

  export(figureId: string, format: "svg" | "png" | "html", figures: FigureInput): Promise<Uint8Array> {
    return this.request((id) => ({ type: "export", id, figureId, format, figures }));
  }
}

export const engine = new Engine();
