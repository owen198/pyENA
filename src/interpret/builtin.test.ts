import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseText } from "../data/parse";
import { parseSchema } from "../data/schema";
import { SAMPLES } from "../data/samples";
import { num, pValue } from "../results/format";
import { parseSummary } from "../results/summary";
import { writeInterpretation } from "./builtin";
import { findExcerpts, findTextColumn } from "./excerpts";

// Summaries written by native pyENA (examples/rs/example.py, example_3d.py and
// gender_ena/case1.py at the pinned commit).
const summary = (name: string) => parseSummary(readFileSync(`src/interpret/fixtures/${name}.summary.json`, "utf8"));
const preset = (id: string) => SAMPLES.find((sample) => sample.id === id)!.preset;
const rsTable = parseText(readFileSync("public/samples/RS.data.csv", "utf8"), { delimiter: "auto", header: true });

describe("writeInterpretation", () => {
  const rs = summary("rs");
  const model = preset("rs");
  const textColumn = findTextColumn(rsTable.profiles, model);
  const excerpts = findExcerpts(rsTable.rows, model, rs, textColumn);
  const text = writeInterpretation({ summary: rs, model, schema: null, excerpts, textColumn });
  const paragraphs = text.split("\n\n");

  it("writes the five paragraphs of the skill, in its order, as prose", () => {
    expect(paragraphs).toHaveLength(5);
    expect(paragraphs[0]).toMatch(/^In the ENA space/);
    expect(paragraphs[1]).toMatch(/Welch's t test/);
    expect(paragraphs[2]).toMatch(/^In the mean network/);
    expect(paragraphs[3]).toMatch(/^A chi-square test of code frequency/);
    expect(paragraphs[4]).toMatch(/^Taken together/);
    // No headings, bullets or Markdown.
    expect(text).not.toMatch(/^\s*([#*>-]|\d+\.)\s/m);
    expect(text).not.toMatch(/\*\*|__|`/);
  });

  it("reports each test with its statistic and p value, from the summary", () => {
    const t = rs.statistics.welch_t_test.dimension_1;
    expect(text).toContain(`t(${num(t.degrees_of_freedom)}) = ${num(t.t_statistic)}, ${pValue(t.p_value)}`);
    const u = rs.statistics.mann_whitney_u.dimension_1;
    expect(text).toContain(`U = ${num(u.u_statistic, 1)}, ${pValue(u.p_value)}`);
    const chi = rs.statistics.chi_square.overall;
    expect(text).toContain(`χ²(${chi.degrees_of_freedom}) = ${num(chi.chi_square)}`);
  });

  it("keeps frequency and fit apart from the point-space tests", () => {
    expect(paragraphs[3]).toMatch(/not where the groups sit in the ENA space/);
    expect(paragraphs[3]).toMatch(/not how large the group difference is/);
  });

  it("closes the loop with lines from RS.data's text column that carry both codes", () => {
    expect(textColumn).toBe("text");
    expect(excerpts).toHaveLength(2);
    for (const excerpt of excerpts) {
      const line = rsTable.rows.find(
        (row) => row.Condition === excerpt.group && row.text.replace(/\s+/g, " ").trim().startsWith(excerpt.text.replace(/…$/, "")),
      );
      expect(line, excerpt.text).toBeDefined();
      expect(line![excerpt.codes[0]]).toBe("1");
      expect(line![excerpt.codes[1]]).toBe("1");
      expect(paragraphs[4]).toContain(excerpt.text);
    }
  });

  it("says when there is no text to quote", () => {
    const withoutText = writeInterpretation({ summary: rs, model, schema: null, excerpts: [], textColumn: null });
    expect(withoutText.split("\n\n")[4]).toMatch(/no column of text/);
  });

  it("names codes by their meaning when a coding schema is given, and survives pyENA's NaN", () => {
    const gender = summary("gender-case1");
    const schema = parseSchema(readFileSync("public/samples/gender_case1_codebook.csv", "utf8"), "gender_case1_codebook.csv");
    const written = writeInterpretation({ summary: gender, model: preset("gender-case1"), schema, excerpts: [], textColumn: null });
    expect(written).toMatch(/性別(期望|友善|暴力)：level \d \((expectation|friendliness|violence)_L\d\)/);
    expect(written).toContain("not defined on this dimension (NaN)");
    // NaN appears only where the writer explains it, never as a number.
    expect(written.replace("(NaN)", "")).not.toMatch(/undefined|NaN|Infinity/);
  });

  it("confines the third dimension to fit and axis interpretation", () => {
    const written = writeInterpretation({ summary: summary("rs-3d"), model: preset("rs-3d"), schema: null, excerpts: [], textColumn: null });
    expect(written).toMatch(/third dimension/);
    expect(written).toMatch(/Dimension 3/);
    expect(written).not.toMatch(/Dimension 3, a Welch/);
  });
});
