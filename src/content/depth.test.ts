import { describe, expect, it } from "vitest";
import { DEMO } from "./demo";
import { DEPTH, DEPTH_PAIR, distances, idea } from "./depth";

// The landing page promises that its 2D and 3D views are one model. The 3D
// positions come from scripts/build-landing-depth.py (native pyENA, which
// checks dimensions 1 and 2 against the 2D model before writing); these tests
// hold the merged data to the 2D file the rest of the page uses.
describe("the landing page's network in depth", () => {
  it("is the 2D network's own nodes, each with a position on dimension 3", () => {
    expect(DEPTH.nodes.map((node) => node.code)).toEqual(DEMO.codes);
    DEPTH.nodes.forEach((node, index) => {
      expect(node.x).toBe(DEMO.nodes[index].x);
      expect(node.y).toBe(DEMO.nodes[index].y);
      expect(Number.isFinite(node.z)).toBe(true);
    });
  });

  it("covers the same speakers as the 2D points", () => {
    expect(DEPTH.units.map((unit) => unit.label)).toEqual(DEMO.units.map((unit) => unit.label));
    expect(DEPTH.provenance.archive).toBe(DEMO.provenance.archive);
  });

  it("names the pair depth separates most, and depth only ever adds distance", () => {
    for (const edge of DEMO.edges) {
      const { flat, deep } = distances(edge.source, edge.target);
      expect(deep).toBeGreaterThanOrEqual(flat);
    }
    const { flat, deep } = distances(DEPTH_PAIR.source, DEPTH_PAIR.target);
    expect(deep / flat).toBeGreaterThan(3);
  });

  it("reads a code as words", () => {
    expect(idea("Client.and.Consultant.Requests")).toBe("Client and consultant requests");
    expect(idea("Data")).toBe("Data");
  });
});
