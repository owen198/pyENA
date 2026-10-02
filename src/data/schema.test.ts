import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchSchema, meaningOf, parseSchema, SchemaError } from "./schema";

describe("parseSchema", () => {
  it("reads pyENA's gender codebook, byte-order mark and all", () => {
    const text = readFileSync("public/samples/gender_case1_codebook.csv", "utf8");
    const schema = parseSchema(text, "gender_case1_codebook.csv");
    expect(schema.codeColumn).toBe("code");
    expect(schema.meaningColumn).toBe("meaning");
    expect(schema.entries).toHaveLength(9);
    expect(schema.entries[0]).toEqual({ code: "expectation_L1", meaning: "性別期望：level 1" });
  });

  it("finds the columns by name in any order, beside other columns", () => {
    const schema = parseSchema('Definition\tCode\tExample\nTalk about data\tData\t"we measured"\n', "book.tsv");
    expect(schema.entries).toEqual([{ code: "Data", meaning: "Talk about data" }]);
    expect(schema.codeColumn).toBe("Code");
  });

  it("reads a file with no header as code, meaning", () => {
    const schema = parseSchema("Data,Talk about data\nCollaboration,Working together\n", "book.csv");
    expect(schema.codeColumn).toBeNull();
    expect(schema.entries.map((entry) => entry.code)).toEqual(["Data", "Collaboration"]);
  });

  it("skips blank codes and keeps the first of a repeated code", () => {
    const schema = parseSchema("code,meaning\nA,first\n,orphan\nA,second\nB,\n", "book.csv");
    expect(schema.entries).toEqual([
      { code: "A", meaning: "first" },
      { code: "B", meaning: "" },
    ]);
  });

  it("explains a file it cannot use", () => {
    expect(() => parseSchema("", "empty.csv")).toThrow(SchemaError);
    expect(() => parseSchema("code\nA\nB\n", "one.csv")).toThrow(/two/);
    expect(() => parseSchema("code,meaning\n", "header.csv")).toThrow(/no codes/);
  });
});

describe("matchSchema", () => {
  it("says which codes are selected, in the data, or missing", () => {
    const schema = parseSchema("code,meaning\nA,a\nB,b\nC,c\n", "book.csv");
    const match = matchSchema(schema, ["A", "B", "D"], ["A", "D"]);
    expect(match.entries.map((entry) => entry.match)).toEqual(["selected", "in data", "not in data"]);
    expect(match.undescribed).toEqual(["D"]);
    expect(match.missing).toBe(1);
    expect(meaningOf(schema, "B")).toBe("b");
    expect(meaningOf(schema, "Z")).toBeNull();
    expect(meaningOf(null, "A")).toBeNull();
  });
});
