// The landing page's network in three dimensions: the same RS.data model as
// demo.ts, with the third dimension from scripts/build-landing-depth.py
// (native pyENA, dimensions=3). That script refuses to write unless the 3D
// model's dimensions 1 and 2 are the 2D model's own, so a node's x and y here
// are exactly where the 2D network draws it; only z is new.

import raw from "./demo-depth.json";
import { DEMO } from "./demo";

export interface DepthNode {
  code: string;
  x: number;
  y: number;
  z: number;
}

const Z = new Map(raw.nodes.map((node) => [node.code, node.z]));

export const DEPTH = {
  provenance: raw.provenance,
  nodes: DEMO.nodes.map((node) => ({ ...node, z: Z.get(node.code) ?? NaN })) as DepthNode[],
  units: raw.units as { label: string; z: number }[],
};

export function nodeOf(code: string): DepthNode {
  return DEPTH.nodes.find((node) => node.code === code)!;
}

/** Distance between two codes' nodes: in the flat view, and once depth is added. */
export function distances(a: string, b: string): { flat: number; deep: number } {
  const [p, q] = [nodeOf(a), nodeOf(b)];
  const flat = Math.hypot(p.x - q.x, p.y - q.y);
  return { flat, deep: Math.hypot(flat, p.z - q.z) };
}

/**
 * The connection depth changes most: the pair that sits closest in the flat
 * view relative to how far apart dimension 3 puts it.
 */
export const DEPTH_PAIR = (() => {
  let best = DEMO.edges[0];
  let ratio = 0;
  for (const edge of DEMO.edges) {
    const { flat, deep } = distances(edge.source, edge.target);
    if (deep / flat > ratio) {
      ratio = deep / flat;
      best = edge;
    }
  }
  return best;
})();

/** A code as words: "Client.and.Consultant.Requests" reads "Client and consultant requests". */
export function idea(code: string): string {
  const words = code.split(/[._]+/).filter(Boolean);
  return words.map((word, index) => (index === 0 ? word : word.toLowerCase())).join(" ");
}
