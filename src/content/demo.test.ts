import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseText } from "../data/parse";
import { SAMPLES } from "../data/samples";
import { findExcerpts, findTextColumn } from "../interpret/excerpts";
import { codePresent } from "../model/config";
import { parseSummary } from "../results/summary";
import { DEMO, recomputedMeans } from "./demo";

// The landing page draws RS.data from src/content/demo-rs.json, which
// scripts/build-landing-demo.py writes with native pyENA. These tests hold it
// to pyENA and to the dataset, so the page never shows a number of its own.
const rs = parseText(readFileSync("public/samples/RS.data.csv", "utf8"), { delimiter: "auto", header: true });
const preset = SAMPLES.find((sample) => sample.id === "rs")!.preset;
const native = parseSummary(readFileSync("src/interpret/fixtures/rs.summary.json", "utf8"));

describe("the landing page's RS.data", () => {
  it("carries pyENA's own summary for example.py's configuration", () => {
    expect(DEMO.summary).toEqual(native);
    expect(DEMO.codes).toEqual(preset.codes);
    expect(DEMO.groups).toMatchObject({ column: preset.groupColumn, a: preset.groups[0], b: preset.groups[1] });
    expect(DEMO.window).toBe(preset.windowBack);
  });

  it("draws the points the summary's group means come from", () => {
    const means = recomputedMeans();
    const { group_a, group_b } = DEMO.summary.points;
    expect(DEMO.units.filter((unit) => unit.group === DEMO.groups.a)).toHaveLength(group_a.n);
    expect(DEMO.units.filter((unit) => unit.group === DEMO.groups.b)).toHaveLength(group_b.n);
    means.a.forEach((value, index) => expect(value).toBeCloseTo(group_a.mean_point[index], 12));
    means.b.forEach((value, index) => expect(value).toBeCloseTo(group_b.mean_point[index], 12));
  });

  it("subtracts one group's mean network from the other's, as the summary does", () => {
    expect(DEMO.edges).toHaveLength((DEMO.codes.length * (DEMO.codes.length - 1)) / 2);
    for (const edge of DEMO.edges) {
      expect(edge.subtracted).toBeCloseTo(edge.a - edge.b, 12);
      const listed = DEMO.summary.networks.subtracted_mean_network.find((entry) => entry.edge === `${edge.source}__${edge.target}`);
      expect(listed?.weight).toBeCloseTo(edge.subtracted, 12);
    }
  });

  it("quotes the document from the dataset, at its own rows, with its own codes", () => {
    for (const line of DEMO.document.lines) {
      const row = rs.rows[line.row - 2];
      expect(row.UserName).toBe(line.speaker);
      expect(row.text.replace(/\s+/g, " ").trim()).toBe(line.text);
      expect(line.codes).toEqual(DEMO.codes.filter((code) => codePresent(row[code])));
    }
    const conversation = new Set(DEMO.document.lines.map((line) => `${rs.rows[line.row - 2].Condition}/${rs.rows[line.row - 2].GroupName}`));
    expect(conversation.size).toBe(1);
  });

  it("forms the passage's connections by the moving stanza window", () => {
    const lines = DEMO.document.lines;
    for (const connection of DEMO.connections) {
      const line = lines[connection.line];
      const window = lines.slice(Math.max(0, connection.line - DEMO.window + 1), connection.line + 1).flatMap((entry) => entry.codes);
      const [a, b] = [connection.source, connection.target];
      expect((line.codes.includes(a) && window.includes(b)) || (line.codes.includes(b) && window.includes(a))).toBe(true);
    }
  });

  it("runs the platform tour on the same result, with every figure pyENA draws", () => {
    const tour = JSON.parse(readFileSync("public/tour/rs-figures.json", "utf8"));
    expect(tour.summaryJson).toBe(DEMO.summaryJson);
    expect(Object.keys(tour.svgs)).toHaveLength(12);
    expect(tour.focus).toEqual(SAMPLES.find((sample) => sample.id === "rs")!.focus);
  });

  it("shows the same evidence the platform's interpretation would quote", () => {
    const textColumn = findTextColumn(rs.profiles, preset);
    expect(findExcerpts(rs.rows, preset, DEMO.summary, textColumn)).toEqual(DEMO.excerpts);
  });
});
