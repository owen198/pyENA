// Interpretation in the figures: which figure or edge the researcher asked
// about and the conversation's requests. The panel itself is
// src/components/interpret/ConnectionWindow.tsx, docked beside the results;
// the evidence it shows and sends is src/interpret/evidence.ts.

import { create } from "zustand";
import type { ConnectionRequest, InterpretStatus, InterpretTarget, ThreadMessage } from "../../shared/api";
import { api, ApiError } from "../api/client";
import { num } from "../results/format";
import { type Evidence, targetKey, targetLabel } from "./evidence";

// ---------------------------------------------------------------------------
// Which figure or edge is open
// ---------------------------------------------------------------------------

interface ConnectionUi {
  /** The figure or edge whose conversation is open; null on the panel's home. */
  active: InterpretTarget | null;
  /** The Interpretation panel is open (on its home, or on one conversation). */
  open: boolean;
  /** The panel moved on from another figure or edge while open. */
  switchedFrom: InterpretTarget | null;
  /** A question typed on the home, to ask as soon as its conversation opens. */
  pendingQuestion: string | null;
  /** The Interpretation button: the panel's home, where the researcher picks what to ask about. */
  openHome(): void;
  /**
   * Open the conversation about a figure or edge (from the home, an Ask button,
   * a 3D line). Opening sends nothing: the evidence is gathered in the browser,
   * and the AI is asked only when the researcher asks.
   */
  request(target: InterpretTarget, question?: string): void;
  /** The question waiting to be asked, once. */
  takeQuestion(): string | null;
  /** The same, for a saved conversation picked from a list. */
  openSaved(target: InterpretTarget): void;
  /** "‹ All": back to the home, the panel stays open. */
  home(): void;
  close(): void;
}

export const useConnection = create<ConnectionUi>((set, get) => ({
  active: null,
  open: false,
  switchedFrom: null,
  pendingQuestion: null,
  openHome() {
    set({ open: true, active: null, switchedFrom: null });
  },
  request(target, question) {
    const { active, open } = get();
    const switching = open && active !== null && targetKey(active) !== targetKey(target);
    set({ active: target, open: true, switchedFrom: switching ? active : null, pendingQuestion: question?.trim() || null });
  },
  takeQuestion() {
    const { pendingQuestion } = get();
    if (pendingQuestion) set({ pendingQuestion: null });
    return pendingQuestion;
  },
  openSaved(target) {
    get().request(target);
  },
  home() {
    set({ active: null, switchedFrom: null });
  },
  close() {
    set({ open: false, active: null, switchedFrom: null });
  },
}));

// ---------------------------------------------------------------------------
// The panel's width: a per-viewer convenience, remembered in this browser
// ---------------------------------------------------------------------------

const WIDTH_KEY = "idealens:dock-width";
export const DOCK_MIN = 340;
export const DOCK_MAX = 720;
const clampWidth = (value: number) => Math.round(Math.min(DOCK_MAX, Math.max(DOCK_MIN, value)));

function readWidth(): number {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(value) && value > 0 ? clampWidth(value) : 440;
  } catch {
    return 440;
  }
}

export const useDockWidth = create<{ width: number; setWidth(width: number): void }>((set) => ({
  width: readWidth(),
  setWidth(width) {
    const next = clampWidth(width);
    set({ width: next });
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      // Without storage the width lasts until the page is reloaded.
    }
  },
}));

/** True while this figure or edge has the panel open. */
export function useIsInterpreting(target: InterpretTarget | null): boolean {
  return useConnection((state) => state.open && state.active !== null && target !== null && targetKey(state.active) === targetKey(target));
}

// ---------------------------------------------------------------------------
// Figure names, in the words the Network tab uses
// ---------------------------------------------------------------------------

export function figureTitle(id: string, a: string, b: string): string {
  const titles: Record<string, string> = {
    subtracted_mean_network: "Subtracted network",
    subtracted_network_with_points: "Subtracted network with points",
    group_points_overlay: "Projected points of both groups",
    a_points_ci: `Projected points of ${a}`,
    b_points_ci: `Projected points of ${b}`,
    a_mean_network: `Mean network of ${a}`,
    b_mean_network: `Mean network of ${b}`,
    a_network_with_points: `Mean network of ${a} with points`,
    b_network_with_points: `Mean network of ${b} with points`,
    individual_a_network: `Individual network from ${a}`,
    individual_b_network: `Individual network from ${b}`,
    subtracted_individual_network: "Subtracted individual network",
  };
  return titles[id] ?? id.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// The AI, when the server has it
// ---------------------------------------------------------------------------

let statusRequest: Promise<InterpretStatus> | null = null;
/** Whether the server can ask the AI; asked once per page load. */
export function aiStatus(): Promise<InterpretStatus> {
  statusRequest ??= api<InterpretStatus>("GET", "/interpret/status").catch(() => ({ available: false, model: null }));
  return statusRequest;
}

export const QUICK_QUESTIONS = [
  "Why are these connected?",
  "What evidence supports this?",
  "Are there contradictions?",
  "What else could explain this?",
] as const;

export const UNABLE = "Unable to analyse this connection right now.";

/** The turns the server receives: alternating, ending with the new question. */
export function turnsFor(messages: ThreadMessage[], question: string): ConnectionRequest["turns"] {
  const turns: ConnectionRequest["turns"] = [];
  for (const message of messages) {
    // A question left without an answer (it failed) is replaced by the next one.
    if (turns.length > 0 && turns[turns.length - 1].role === message.role) turns.pop();
    turns.push({ role: message.role, text: message.text });
  }
  if (turns.length > 0 && turns[turns.length - 1].role === "user") turns.pop();
  turns.push({ role: "user", text: question });
  return turns;
}

/**
 * Ask about a figure or edge. The answer arrives as it is written: onText gets
 * each piece; the promise resolves with the model that wrote it. Real text
 * only: nothing here invents or replays any.
 */
export async function askConnection(
  request: ConnectionRequest,
  onText: (piece: string) => void,
  signal: AbortSignal,
): Promise<{ model: string; truncated: boolean }> {
  let response: Response;
  try {
    response = await fetch("/api/interpret/connection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new ApiError(0, UNABLE);
  }
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error ?? UNABLE);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done: { model: string; truncated: boolean } | null = null;
  for (;;) {
    const { value, done: finished } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const raw = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!raw) continue;
      const line = JSON.parse(raw) as { type: string; text?: string; error?: string; model?: string; truncated?: boolean };
      if (line.type === "text" && line.text) onText(line.text);
      else if (line.type === "error") throw new ApiError(502, line.error ?? UNABLE);
      else if (line.type === "done") done = { model: line.model ?? "", truncated: Boolean(line.truncated) };
    }
    if (finished) break;
  }
  if (!done) throw new ApiError(502, UNABLE);
  return done;
}

// ---------------------------------------------------------------------------
// The tutorial's example answer: written from the evidence, never by the AI
// ---------------------------------------------------------------------------

export const EXAMPLE_AUTHOR = "example";

export function exampleAnswer(evidence: Evidence, meaning: (code: string) => string): string {
  const edge = evidence.edges[0];
  if (!edge) return "Example answer: this figure has no connections to describe.";
  const [a, b] = evidence.groups;
  const [x, y] = edge.codes;
  const stronger = edge.weightA >= edge.weightB ? a : b;
  const other = stronger === a ? b : a;
  const strongW = stronger === a ? edge.weightA : edge.weightB;
  const otherW = stronger === a ? edge.weightB : edge.weightA;
  const refs = (group: string, n: number) =>
    evidence.excerpts
      .filter((line) => line.kind !== "counter" && line.group === group && line.edge[0] === x && line.edge[1] === y)
      .slice(0, n)
      .map((line) => `[${line.id}]`)
      .join(" ");
  const counter = evidence.excerpts.find((line) => line.kind === "counter" && line.edge[0] === x && line.edge[1] === y);
  return [
    `Evidence: ${stronger} students bring ${meaning(x)} and ${meaning(y)} together more often than ${other} students: a mean edge weight of ${num(strongW)} against ${num(otherW)}. In ${stronger}'s talk the two meet in ${edge.lines[stronger] ?? 0} lines ${refs(stronger, 2)}; in ${other}'s, ${edge.lines[other] ?? 0}${refs(other, 1) ? ` ${refs(other, 1)}` : ""}.`,
    `Inference: for ${stronger} students these two ideas tend to be discussed together. That describes how often they came up in the same stretch of talk; it does not show that one led to the other.`,
    `Speculation: who was in each focus group, or how the questions were put, could also explain the difference.${
      counter ? ` Some ${counter.group} students raise one idea without the other ${`[${counter.id}]`}.` : ""
    }`,
  ].join("\n\n");
}

export { targetKey, targetLabel };
