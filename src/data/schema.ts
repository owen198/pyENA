// A coding schema (codebook): each code and what it means. The platform reads
// it to name codes in plain language — in the preview, beside the settings
// and in the interpretation. It never changes the analysis.

import Papa from "papaparse";
import type { CodingSchema, SchemaEntry } from "../../shared/api";

export class SchemaError extends Error {}

const CODE_HEADER = /^(codes?|code[ _.-]?name|variable|column|label|name|代碼|編碼)$/i;
const MEANING_HEADER = /(meaning|definition|description|describe|explanation|gloss|desc|意義|定義|說明|描述)/i;

/** Read a codebook: CSV or tab-separated, with or without a header row. */
export function parseSchema(text: string, fileName: string): CodingSchema {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const rows = parsed.data.map((row) => row.map((cell) => (cell ?? "").trim()));
  if (rows.length === 0) throw new SchemaError(`${fileName} is empty.`);
  if (rows.every((row) => row.length < 2)) {
    throw new SchemaError(`${fileName} has one column. A coding schema needs two: the code, and what it means.`);
  }

  const header = rows[0];
  let codeIndex = header.findIndex((cell) => CODE_HEADER.test(cell));
  let meaningIndex = header.findIndex((cell, index) => index !== codeIndex && MEANING_HEADER.test(cell));
  const hasHeader = codeIndex !== -1 || meaningIndex !== -1;
  if (!hasHeader) {
    // No header we recognise: the first column is the code, the second its meaning.
    codeIndex = 0;
    meaningIndex = 1;
  } else if (codeIndex === -1) {
    codeIndex = meaningIndex === 0 ? 1 : 0;
  } else if (meaningIndex === -1) {
    meaningIndex = codeIndex === 0 ? 1 : 0;
  }

  const seen = new Set<string>();
  const entries: SchemaEntry[] = [];
  for (const row of hasHeader ? rows.slice(1) : rows) {
    const code = row[codeIndex] ?? "";
    if (!code || seen.has(code)) continue;
    seen.add(code);
    entries.push({ code, meaning: row[meaningIndex] ?? "" });
  }
  if (entries.length === 0) throw new SchemaError(`${fileName} lists no codes.`);

  return {
    fileName,
    entries,
    codeColumn: hasHeader ? header[codeIndex] || null : null,
    meaningColumn: hasHeader ? header[meaningIndex] || null : null,
  };
}

export type SchemaMatch = "selected" | "in data" | "not in data";

/** How each schema code relates to the dataset and the codes chosen for the model. */
export function matchSchema(schema: CodingSchema, columns: string[], selected: string[]) {
  const inSchema = new Set(schema.entries.map((entry) => entry.code));
  const entries = schema.entries.map((entry) => ({
    ...entry,
    match: (selected.includes(entry.code) ? "selected" : columns.includes(entry.code) ? "in data" : "not in data") as SchemaMatch,
  }));
  return {
    entries,
    /** Selected codes the schema does not describe. */
    undescribed: selected.filter((code) => !inSchema.has(code)),
    missing: entries.filter((entry) => entry.match === "not in data").length,
  };
}

/** A code's meaning, or null when the schema does not describe it. */
export function meaningOf(schema: CodingSchema | null, code: string): string | null {
  const meaning = schema?.entries.find((entry) => entry.code === code)?.meaning;
  return meaning ? meaning : null;
}
