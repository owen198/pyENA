import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseText } from "../data/parse";
import { SAMPLES } from "../data/samples";
import { absentCodes, censusGroups, DEFAULT_MODEL, pythonEquivalent, staleReason, validate, type FigureOptions } from "./config";

const figures: FigureOptions = { colorA: "#1e3086", colorB: "#df3022", showCI: true, showLabels: true };
const rs = parseText(readFileSync(new URL("../../public/samples/RS.data.csv", import.meta.url), "utf8"), {
  delimiter: "auto",
  header: true,
});
const rsPreset = SAMPLES.find((sample) => sample.id === "rs")!.preset;

describe("validate", () => {
  it("lists every unmet requirement for an empty configuration", () => {
    const messages = validate(DEFAULT_MODEL, figures, null).map((issue) => issue.message);
    expect(messages).toEqual([
      "Select at least 2 code columns.",
      "Select at least 1 unit column.",
      "Select at least 1 conversation column.",
      "Name two groups to compare.",
    ]);
  });

  it("accepts the example.py configuration on RS.data", () => {
    const census = censusGroups(rs.rows, rsPreset.units, "Condition");
    expect(validate(rsPreset, figures, census)).toEqual([]);
    expect(census.values.map((value) => [value.value, value.units])).toEqual([
      ["FirstGame", 26],
      ["SecondGame", 22],
    ]);
  });

  it("marks the rotation field, not the group field, when means rotation lacks groups", () => {
    const issues = validate({ ...rsPreset, groupColumn: null, groups: [null, null] }, figures, null);
    expect(issues.find((issue) => issue.field === "rotation")?.message).toBe("Means rotation needs two named groups.");
  });

  it("names a group that has too few units", () => {
    const rows = rs.rows.filter((row) => row.Condition === "FirstGame" || row.UserName === "samuel o");
    const census = censusGroups(rows, rsPreset.units, "Condition");
    const messages = validate(rsPreset, figures, census).map((issue) => issue.message);
    expect(messages).toContain("SecondGame has 1 unit. A comparison needs at least 2 per group.");
  });

  it("rejects out-of-range window sizes and identical group colours", () => {
    const messages = validate({ ...rsPreset, windowBack: 0, windowForward: 2.5 }, { ...figures, colorB: "#1E3086" }, null).map(
      (issue) => issue.message,
    );
    expect(messages).toContain("Lines back must be a whole number from 1 to 50.");
    expect(messages).toContain("Lines forward must be a whole number from 0 to 50.");
    expect(messages).toContain("The two groups need different colours.");
  });
});

describe("staleReason", () => {
  it("names what changed since the run", () => {
    expect(staleReason(rsPreset, rsPreset)).toBeNull();
    expect(staleReason({ ...rsPreset, windowBack: 3 }, rsPreset)).toBe("Stanza window changed since this was run.");
    expect(staleReason({ ...rsPreset, codes: rsPreset.codes.slice(1) }, rsPreset)).toBe("Codes changed since this was run.");
  });
});

describe("pythonEquivalent", () => {
  it("reproduces example.py's ena() call, with the group column carried in metadata", () => {
    const code = pythonEquivalent({ ...rsPreset, metadata: ["GroupName"] }, "RS.data.csv", ",", "ed788e022ee6");
    expect(code).toContain('data_path = Path("RS.data.csv")');
    expect(code).toContain("    data=data_path,");
    expect(code).toContain('metadata=["GroupName", "Condition"],');
    expect(code).toContain("window_size_back=4,");
    expect(code).toContain('groups=("FirstGame", "SecondGame"),');
  });
});

describe("absentCodes", () => {
  it("names a selected code that never occurs in the compared groups", () => {
    const rows = [
      { g: "X", A: "1", Never: "0" },
      { g: "Y", A: "0", Never: "" },
      { g: "Z", A: "0", Never: "1" },
    ];
    const model = { ...DEFAULT_MODEL, codes: ["A", "Never"], groupColumn: "g", groups: ["X", "Y"] as [string, string] };
    expect(absentCodes(rows, model)).toEqual(["Never"]);
    const messages = validate(model, figures, null, ["Never"]).map((issue) => issue.message);
    expect(messages).toContain(
      "Never never occurs in X or Y; the chi-square test needs every code to appear. Remove it from the codes.",
    );
  });
});

describe("dimensions", () => {
  it("marks results stale and writes dimensions=3 plus the 3D outputs call", () => {
    expect(staleReason({ ...rsPreset, dimensions: 3 }, rsPreset)).toBe("Dimensions changed since this was run.");
    const code = pythonEquivalent({ ...rsPreset, dimensions: 3 }, "RS.data.csv", ",", "ed788e022ee6");
    expect(code).toContain("    dimensions=3,");
    expect(code).toContain('generate_analysis_outputs_3d(ena_set=ena_set, group_column="Condition"');
    expect(pythonEquivalent(rsPreset, "RS.data.csv", ",", "ed788e022ee6")).not.toContain("dimensions=");
  });
});

describe("parseSummary", () => {
  it("reads the NaN pyENA writes for an undefined p-value, and nothing inside strings", async () => {
    const { parseSummary } = await import("../results/summary");
    const parsed = parseSummary('{"anova": {"p_value": NaN, "f": -Infinity}, "codes": ["NaN"], "list": [1, NaN]}') as unknown as {
      anova: { p_value: number; f: number };
      codes: string[];
      list: number[];
    };
    expect(Number.isNaN(parsed.anova.p_value)).toBe(true);
    expect(parsed.anova.f).toBe(-Infinity);
    expect(parsed.codes).toEqual(["NaN"]);
    expect(Number.isNaN(parsed.list[1])).toBe(true);
  });
});
