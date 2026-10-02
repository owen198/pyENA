// Research brought in on the landing page, carried into a new analysis. It
// lives in memory only, across the sign-in in between: a file never leaves the
// browser until the analysis it belongs to exists. A reload drops it.

export interface Handoff {
  name: string;
  /** A file the visitor chose, or null for an example. */
  file: File | null;
  /** A coding schema chosen with that file, if any. */
  schema?: File | null;
  sampleId: string | null;
}

let pending: Handoff | null = null;

export function setHandoff(handoff: Handoff) {
  pending = handoff;
}

/** The research waiting to start, once; later calls get null. */
export function takeHandoff(): Handoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}

export function hasHandoff(): boolean {
  return pending !== null;
}

/** The name the researcher gave, without taking the handoff. */
export function peekHandoffName(): string | null {
  return pending?.name.trim() || null;
}
