// Reading a coded CSV and profiling its columns (plan §7.3–7.4, §8.2).
// Pure functions: used by the parse worker and by the tests.

import Papa from "papaparse";

export type Delimiter = "auto" | "," | "\t" | ";";

export type ColumnType = "binary" | "numeric" | "categorical" | "text" | "empty";

export interface ColumnProfile {
  name: string;
  type: ColumnType;
  uniqueCount: number;
  missingCount: number;
  sampleValues: string[];
}

export type Row = Record<string, string>;

export interface ParseOptions {
  delimiter: Delimiter;
  header: boolean;
}

export interface ParsedTable {
  columns: string[];
  rows: Row[];
  profiles: ColumnProfile[];
  /** The delimiter actually used, after auto-detection. */
  delimiter: string;
  /** Problems worth stating that do not stop the preview. */
  warnings: string[];
}

export class ParseError extends Error {}

export const BINARY_TOKENS = new Set(["true", "false", "yes", "no", "y", "n"]);

/** Values R and pandas write for a missing cell. */
const MISSING_TOKENS = new Set(["", "NA", "NaN"]);

export function isMissing(value: string | undefined): boolean {
  return value === undefined || MISSING_TOKENS.has(value.trim());
}

function asNumber(value: string): number | null {
  const text = value.trim();
  if (text === "") return null;
  const number = Number(text);
  return Number.isNaN(number) ? null : number;
}

/**
 * Mirrors pyENA's _coerce_code_value followed by binary presence: a code
 * column is binary when every non-missing value is a number equal to 0 or 1,
 * or one of the boolean words the library reads. Matching it exactly keeps
 * the interface from offering columns pyENA would read differently.
 */
export function isBinaryValue(value: string): boolean {
  const number = asNumber(value);
  if (number !== null) return number === 0 || number === 1;
  return BINARY_TOKENS.has(value.trim().toLowerCase());
}

export function profileColumn(name: string, rows: Row[]): ColumnProfile {
  const distinct = new Set<string>();
  const samples: string[] = [];
  let missing = 0;
  let binary = true;
  let numeric = true;
  for (const row of rows) {
    const value = row[name];
    if (isMissing(value)) {
      missing += 1;
      continue;
    }
    if (!distinct.has(value)) {
      distinct.add(value);
      if (samples.length < 3) samples.push(value);
    }
    if (binary && !isBinaryValue(value)) binary = false;
    if (numeric && asNumber(value) === null) numeric = false;
  }
  const present = rows.length - missing;
  let type: ColumnType;
  if (present === 0) type = "empty";
  else if (binary) type = "binary";
  else if (numeric) type = "numeric";
  else if (distinct.size <= 50 && distinct.size <= present / 2) type = "categorical";
  else type = "text";
  return { name, type, uniqueCount: distinct.size, missingCount: missing, sampleValues: samples };
}

export function parseText(raw: string, options: ParseOptions): ParsedTable {
  // Excel writes a byte-order mark that silently corrupts the first column name.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  if (text.trim() === "") throw new ParseError("The file is empty.");

  const result = Papa.parse<string[]>(text, {
    header: false,
    delimiter: options.delimiter === "auto" ? "" : options.delimiter,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  const matrix = result.data;
  const warnings: string[] = [];
  if (result.errors.some((error) => error.code === "UndetectableDelimiter") && (matrix[0]?.length ?? 0) <= 1) {
    warnings.push("No delimiter found. Choose one in the panel.");
  }

  let columns: string[];
  let body: string[][];
  if (options.header) {
    columns = dedupe((matrix[0] ?? []).map((name) => name.trim()), warnings);
    body = matrix.slice(1);
  } else {
    const width = Math.max(0, ...matrix.map((line) => line.length));
    columns = Array.from({ length: width }, (_, index) => `Column ${index + 1}`);
    body = matrix;
  }
  if (columns.length === 0) throw new ParseError("The file is empty.");
  if (body.length === 0) throw new ParseError("The file has a header row but no data rows.");

  let mismatches = 0;
  let firstMismatch = "";
  const rows: Row[] = body.map((line, index) => {
    if (options.header && line.length !== columns.length) {
      mismatches += 1;
      if (!firstMismatch) {
        firstMismatch = `Row ${index + 1} has ${line.length} fields; the header has ${columns.length}.`;
      }
    }
    const row: Row = {};
    columns.forEach((column, position) => {
      row[column] = line[position] ?? "";
    });
    return row;
  });
  if (mismatches === 1) warnings.push(firstMismatch);
  else if (mismatches > 1) warnings.push(`${firstMismatch} ${mismatches - 1} more rows also differ from the header.`);

  return {
    columns,
    rows,
    profiles: columns.map((column) => profileColumn(column, rows)),
    delimiter: result.meta.delimiter,
    warnings,
  };
}

function dedupe(names: string[], warnings: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name, index) => {
    const base = name === "" ? `Column ${index + 1}` : name;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (count === 0) return base;
    const renamed = `${base}_${count}`;
    warnings.push(`Two columns are named ${base}; the second is shown as ${renamed}.`);
    return renamed;
  });
}

/** FNV-1a over the header row: the key a saved configuration is stored under. */
export function headerHash(columns: string[]): string {
  let hash = 0x811c9dc5;
  for (const char of columns.join("\u0001")) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
