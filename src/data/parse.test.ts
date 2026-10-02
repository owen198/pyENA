import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headerHash, isBinaryValue, parseText, ParseError } from "./parse";

const sample = (name: string) => readFileSync(new URL(`../../public/samples/${name}`, import.meta.url), "utf8");

describe("isBinaryValue mirrors pyENA's _coerce_code_value", () => {
  it("accepts numeric 0 and 1 in any spelling", () => {
    for (const value of ["0", "1", "1.0", " 1 ", "0.0"]) expect(isBinaryValue(value)).toBe(true);
  });
  it("accepts the boolean words the library reads", () => {
    for (const value of ["TRUE", "false", "Yes", "no", "y", "N"]) expect(isBinaryValue(value)).toBe(true);
  });
  it("rejects other numbers and text", () => {
    for (const value of ["2", "0.5", "-1", "abc", "present"]) expect(isBinaryValue(value)).toBe(false);
  });
});

describe("parseText", () => {
  it("reads RS.data and profiles its six code columns as binary", () => {
    const table = parseText(sample("RS.data.csv"), { delimiter: "auto", header: true });
    expect(table.rows).toHaveLength(3824);
    expect(table.columns).toHaveLength(20);
    expect(table.delimiter).toBe(",");
    const binary = table.profiles.filter((profile) => profile.type === "binary").map((profile) => profile.name);
    expect(binary).toEqual([
      "Data",
      "Technical.Constraints",
      "Performance.Parameters",
      "Client.and.Consultant.Requests",
      "Design.Reasoning",
      "Collaboration",
    ]);
    expect(table.profiles.find((profile) => profile.name === "Condition")?.type).toBe("categorical");
  });

  it("strips the byte-order mark Excel writes, so the first column keeps its name", () => {
    const text = sample("gender_case1_binary_input.csv");
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const table = parseText(text, { delimiter: "auto", header: true });
    expect(table.columns[0]).toBe("session_id");
    expect(table.rows).toHaveLength(200);
  });

  it("detects semicolons and tabs", () => {
    expect(parseText("a;b\n1;0\n", { delimiter: "auto", header: true }).columns).toEqual(["a", "b"]);
    expect(parseText("a\tb\n1\t0\n", { delimiter: "auto", header: true }).columns).toEqual(["a", "b"]);
  });

  it("counts missing values, including R's NA", () => {
    const table = parseText("code,unit\n1,a\nNA,b\n,c\n0,d\n", { delimiter: "auto", header: true });
    const code = table.profiles.find((profile) => profile.name === "code")!;
    expect(code.missingCount).toBe(2);
    expect(code.type).toBe("binary");
  });

  it("states a field-count mismatch with the row and both counts", () => {
    const table = parseText("a,b,c\n1,2,3\n1,2,3,4\n1,2\n", { delimiter: "auto", header: true });
    expect(table.warnings[0]).toBe("Row 2 has 4 fields; the header has 3. 1 more rows also differ from the header.");
    expect(table.rows[2].c).toBe("");
  });

  it("names columns when there is no header row", () => {
    const table = parseText("1,0\n0,1\n", { delimiter: "auto", header: false });
    expect(table.columns).toEqual(["Column 1", "Column 2"]);
    expect(table.rows).toHaveLength(2);
  });

  it("renames duplicate headers and says so", () => {
    const table = parseText("x,x\n1,2\n", { delimiter: "auto", header: true });
    expect(table.columns).toEqual(["x", "x_1"]);
    expect(table.warnings[0]).toContain("x_1");
  });

  it("refuses an empty file and a header with no rows", () => {
    expect(() => parseText("﻿ \n", { delimiter: "auto", header: true })).toThrow(ParseError);
    expect(() => parseText("a,b\n", { delimiter: "auto", header: true })).toThrow("no data rows");
  });

  it("hashes the header row stably", () => {
    expect(headerHash(["a", "b"])).toBe(headerHash(["a", "b"]));
    expect(headerHash(["a", "b"])).not.toBe(headerHash(["b", "a"]));
  });
});
