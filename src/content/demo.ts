// The landing page's walk-through data: RS.data run through native pyENA by
// scripts/build-landing-demo.py. Nothing here is typed in by hand; this module
// only reads it and derives what the drawing needs.

import raw from "./demo-rs.json";
import { parseSummary } from "../results/summary";

export interface DemoNode {
  code: string;
  x: number;
  y: number;
}

export interface DemoEdge {
  source: string;
  target: string;
  overall: number;
  a: number;
  b: number;
  subtracted: number;
}

export interface DemoUnit {
  label: string;
  group: string;
  x: number;
  y: number;
}

export interface DemoLine {
  row: number;
  speaker: string;
  text: string;
  codes: string[];
}

export const DEMO = {
  provenance: raw.provenance,
  codes: raw.codes as string[],
  groups: raw.groups,
  window: raw.window,
  nodes: raw.nodes as DemoNode[],
  edges: raw.edges as DemoEdge[],
  units: raw.units as DemoUnit[],
  document: raw.document as { conversation: string; lines: DemoLine[] },
  connections: raw.connections as { source: string; target: string; line: number }[],
  excerpts: raw.excerpts as { group: string; codes: [string, string]; unit: string; text: string }[],
  summaryJson: raw.summaryJson,
  summary: parseSummary(raw.summaryJson),
};

export const edgeKey = (edge: { source: string; target: string }) => `${edge.source}__${edge.target}`;

/** A code's node weight: half the weight of every connection it is part of (pyENA's node sizing). */
export const NODE_WEIGHT: Record<string, number> = Object.fromEntries(
  DEMO.codes.map((code) => [
    code,
    DEMO.edges.filter((edge) => edge.source === code || edge.target === code).reduce((sum, edge) => sum + edge.overall / 2, 0),
  ]),
);

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Group means of the projected points, as pyENA's summary reports them. */
export const GROUP_MEANS = {
  a: DEMO.summary.points.group_a.mean_point,
  b: DEMO.summary.points.group_b.mean_point,
};

/** A check that the points and the summary agree, used by the tests. */
export function recomputedMeans() {
  const a = DEMO.units.filter((unit) => unit.group === DEMO.groups.a);
  const b = DEMO.units.filter((unit) => unit.group === DEMO.groups.b);
  return {
    a: [mean(a.map((unit) => unit.x)), mean(a.map((unit) => unit.y))],
    b: [mean(b.map((unit) => unit.x)), mean(b.map((unit) => unit.y))],
  };
}
