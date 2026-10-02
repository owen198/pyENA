import { describe, expect, it } from "vitest";
import type { Row } from "../data/parse";
import type { ModelConfig } from "../model/config";
import type { Summary } from "../results/summary";
import { findTextColumn } from "./excerpts";
import { contextText, edgeTarget, gatherEvidence, MAX_EXCERPTS, splitReferences, targetKey } from "./evidence";

const MODEL: ModelConfig = {
  codes: ["Alpha", "Beta", "Gamma"],
  units: ["Group", "Speaker"],
  conversation: ["Talk"],
  metadata: ["Group"],
  window: "MovingStanzaWindow",
  windowBack: 2,
  windowForward: 0,
  rotation: "mean",
  dimensions: 2,
  groupColumn: "Group",
  groups: ["G1", "G2"],
};

const line = (group: string, talk: string, speaker: string, text: string, codes: string[]): Row => ({
  Group: group,
  Talk: talk,
  Speaker: speaker,
  Text: text,
  Alpha: codes.includes("Alpha") ? "1" : "0",
  Beta: codes.includes("Beta") ? "1" : "0",
  Gamma: codes.includes("Gamma") ? "1" : "0",
});

// G1 joins Alpha and Beta a lot; G2 mentions Alpha alone.
const ROWS: Row[] = [
  line("G1", "t1", "ann", "Alpha and beta together on this one line of talk here.", ["Alpha", "Beta"]),
  line("G1", "t1", "bo", "Just alpha, but beta came right before within the window.", ["Alpha"]),
  line("G1", "t1", "ann", "Nothing coded in this line of the conversation at all.", []),
  line("G1", "t1", "bo", "Beta here, and alpha is two lines back: outside a window of two.", ["Beta"]),
  line("G2", "t2", "cy", "Alpha on its own, nobody brings up beta in this group.", ["Alpha"]),
  line("G2", "t2", "di", "Gamma only, which has nothing to do with this connection.", ["Gamma"]),
  line("G2", "t2", "cy", "Alpha again, still without the other code anywhere nearby.", ["Alpha"]),
];

const SUMMARY = {
  groups: { group_column: "Group", group_a_label: "G1", group_b_label: "G2" },
  model: { units: 4, edges: 3, codes: MODEL.codes, rotation_dimensions: 2, eigenvalues: [], explained_variance_ratio: [] },
  networks: {
    group_a_mean_network: [
      { edge: "Alpha__Beta", weight: 0.6 },
      { edge: "Alpha__Gamma", weight: 0.1 },
      { edge: "Beta__Gamma", weight: 0.05 },
    ],
    group_b_mean_network: [
      { edge: "Alpha__Beta", weight: 0.1 },
      { edge: "Alpha__Gamma", weight: 0.3 },
      { edge: "Beta__Gamma", weight: 0.0 },
    ],
    subtracted_mean_network: [
      { edge: "Alpha__Beta", weight: 0.5 },
      { edge: "Alpha__Gamma", weight: -0.2 },
      { edge: "Beta__Gamma", weight: 0.05 },
    ],
    subtracted_mean_network_top_edges: {
      group_a_stronger: [{ edge: "Alpha__Beta", weight: 0.5 }],
      group_b_stronger: [{ edge: "Alpha__Gamma", weight: -0.2 }],
    },
  },
} as unknown as Summary;

const gather = (rows = ROWS, model = MODEL) =>
  gatherEvidence({ target: edgeTarget("Beta", "Alpha"), rows, model, summary: SUMMARY, textColumn: "Text" });

describe("connection evidence", () => {
  it("names an edge the same way whichever way round it is clicked", () => {
    expect(edgeTarget("Beta", "Alpha")).toEqual(edgeTarget("Alpha", "Beta"));
    expect(targetKey(edgeTarget("Beta", "Alpha"))).toBe("edge:Alpha__Beta");
  });

  it("finds the lines where the codes meet inside the stanza window, and only those", () => {
    const evidence = gather();
    const [edge] = evidence.edges;
    // Row 1 (same line) and row 2 (beta one line before). Row 4's alpha is outside a window of two.
    expect(edge.lines).toEqual({ G1: 2, G2: 0 });
    expect(edge.unitsWith).toEqual({ G1: 2, G2: 0 });
    expect(edge.units).toEqual({ G1: 2, G2: 2 });
    const support = evidence.excerpts.filter((entry) => entry.kind !== "counter");
    expect(support.map((entry) => [entry.row, entry.kind])).toEqual([
      [1, "same-line"],
      [2, "window"],
    ]);
  });

  it("widens with the window: three lines reach row 4's alpha", () => {
    const evidence = gather(ROWS, { ...MODEL, windowBack: 3 });
    expect(evidence.edges[0].lines.G1).toBe(3);
  });

  it("takes pyENA's weights and ranks, and counter-evidence from the weaker group", () => {
    const evidence = gather();
    const [edge] = evidence.edges;
    expect([edge.weightA, edge.weightB, edge.difference]).toEqual([0.6, 0.1, 0.5]);
    expect(edge.differenceRank).toBe(1);
    expect(edge.weaker).toBe("G2");
    const counter = evidence.excerpts.filter((entry) => entry.kind === "counter");
    expect(counter.length).toBeGreaterThan(0);
    expect(counter.every((entry) => entry.group === "G2" && entry.codes.includes("Alpha") && !entry.codes.includes("Beta"))).toBe(true);
  });

  it("numbers the excerpts E1… in order, never more than twelve, each with its window", () => {
    const many = Array.from({ length: 40 }, (_, index) => line("G1", `t${index}`, `s${index}`, `Alpha with beta, line ${index} of many.`, ["Alpha", "Beta"]));
    const evidence = gather([...many, ...ROWS]);
    expect(evidence.excerpts.length).toBeLessThanOrEqual(MAX_EXCERPTS);
    expect(evidence.excerpts.map((entry) => entry.id)).toEqual(evidence.excerpts.map((_, index) => `E${index + 1}`));
    for (const entry of evidence.excerpts) expect(entry.context.at(-1)?.row).toBe(entry.row);
  });

  it("gives the model the counts, the weights and only the numbered lines", () => {
    const evidence = gather();
    const text = contextText(evidence, { fileName: "talk.csv", model: MODEL, summary: SUMMARY, schema: null });
    expect(text).toContain("Alpha ↔ Beta");
    expect(text).toContain("G1 0.600, G2 0.100");
    expect(text).toContain("[E1] G1");
    expect(text).not.toContain("Gamma only");
  });

  it("turns only references that exist into chips", () => {
    const segments = splitReferences("Both groups [E1], but see [E9] and [E2].", new Set(["E1", "E2"]));
    expect(segments).toEqual([{ text: "Both groups " }, { ref: "E1" }, { text: ", but see [E9] and " }, { ref: "E2" }, { text: "." }]);
  });

  it("reads what was said from the text column, not a line-number column named Line", () => {
    const profiles = [
      { name: "Line", type: "numeric", uniqueCount: 9, missingCount: 0, sampleValues: ["1"] },
      { name: "Text", type: "text", uniqueCount: 9, missingCount: 0, sampleValues: ["Hello"] },
    ] as Parameters<typeof findTextColumn>[0];
    expect(findTextColumn(profiles, MODEL)).toBe("Text");
  });
});
