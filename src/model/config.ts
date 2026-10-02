// The analysis configuration: every model field maps to one argument of
// ena() in pyENA's rena.py (plan §9.1).

import type { FigureInput, ModelInput } from "../engine/protocol";
import type { ColumnProfile, Row } from "../data/parse";
import { paperToken } from "../theme/paper";

export type Window = "MovingStanzaWindow" | "Conversation";
export type Rotation = "svd" | "mean";

export interface ModelConfig {
  codes: string[];
  units: string[];
  conversation: string[];
  metadata: string[];
  window: Window;
  windowBack: number;
  windowForward: number;
  rotation: Rotation;
  /** 2, or 3 for a Z axis and pyENA's interactive 3D networks (plot3d.py). */
  dimensions: 2 | 3;
  groupColumn: string | null;
  groups: [string | null, string | null];
}

export interface FigureOptions {
  colorA: string;
  colorB: string;
  showCI: boolean;
  showLabels: boolean;
}

export const WINDOW_MAX = 50;

export const DEFAULT_MODEL: ModelConfig = {
  codes: [],
  units: [],
  conversation: [],
  metadata: [],
  window: "MovingStanzaWindow",
  windowBack: 1,
  windowForward: 0,
  rotation: "svd",
  dimensions: 2,
  groupColumn: null,
  groups: [null, null],
};

/** Colour presets are design tokens only (plan §9.3). */
export const COLOR_TOKENS = ["brand", "brand-dark", "accent", "ink", "ink-secondary"] as const;

/** A colour token as figures use it: from the paper theme, which figures are always drawn on. */
export function tokenValue(name: string): string {
  return paperToken(name);
}

export function defaultFigureOptions(): FigureOptions {
  return { colorA: tokenValue("brand"), colorB: tokenValue("accent"), showCI: true, showLabels: true };
}

// ---------------------------------------------------------------------------
// Groups and units
// ---------------------------------------------------------------------------

export interface GroupValue {
  value: string;
  rows: number;
  units: number;
}

export interface UnitCensus {
  totalUnits: number;
  values: GroupValue[];
  /** Units whose group column is not constant; pyENA reads each unit's first row. */
  mixedUnits: number;
}

export function unitKey(row: Row, units: string[]): string {
  return units.map((column) => row[column]).join("\u0001");
}

/** Distinct values of the group column, counted in rows and in units. */
export function censusGroups(rows: Row[], units: string[], groupColumn: string): UnitCensus {
  const rowCounts = new Map<string, number>();
  const unitGroup = new Map<string, string>();
  const mixed = new Set<string>();
  for (const row of rows) {
    const value = row[groupColumn] ?? "";
    rowCounts.set(value, (rowCounts.get(value) ?? 0) + 1);
    if (units.length === 0) continue;
    const key = unitKey(row, units);
    const first = unitGroup.get(key);
    if (first === undefined) unitGroup.set(key, value);
    else if (first !== value) mixed.add(key);
  }
  const unitCounts = new Map<string, number>();
  unitGroup.forEach((value) => unitCounts.set(value, (unitCounts.get(value) ?? 0) + 1));
  const values = [...rowCounts.entries()]
    .map(([value, count]) => ({ value, rows: count, units: unitCounts.get(value) ?? 0 }))
    .sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true }));
  return { totalUnits: unitGroup.size, values, mixedUnits: mixed.size };
}

// ---------------------------------------------------------------------------
// Validation (plan §9.4, §15)
// ---------------------------------------------------------------------------

export type Field =
  | "codes"
  | "units"
  | "conversation"
  | "metadata"
  | "windowBack"
  | "windowForward"
  | "rotation"
  | "groupColumn"
  | "groups"
  | "colors";

export interface Issue {
  field: Field;
  message: string;
}

export function validWindowSize(value: number, min: number): boolean {
  return Number.isInteger(value) && value >= min && value <= WINDOW_MAX;
}

/** Mirrors pyENA's _coerce_code_value followed by presence (> 0). */
export function codePresent(value: string | undefined): boolean {
  if (value === undefined) return false;
  const text = value.trim();
  if (text === "") return false;
  const number = Number(text);
  if (!Number.isNaN(number)) return number > 0;
  return ["true", "yes", "y"].includes(text.toLowerCase());
}

/**
 * Selected codes that never occur in either compared group. pyENA's
 * chi-square test of code presence cannot run with one (scipy refuses a zero
 * expected frequency), so they are caught before the run.
 */
export function absentCodes(rows: Row[], model: ModelConfig): string[] {
  const [a, b] = model.groups;
  if (!model.groupColumn || a === null || b === null) return [];
  const column = model.groupColumn;
  const inComparison = rows.filter((row) => row[column] === a || row[column] === b);
  return model.codes.filter((code) => !inComparison.some((row) => codePresent(row[code])));
}

export function validate(
  model: ModelConfig,
  figures: FigureOptions,
  census: UnitCensus | null,
  absent: string[] = [],
): Issue[] {
  const issues: Issue[] = [];
  if (model.codes.length < 2) issues.push({ field: "codes", message: "Select at least 2 code columns." });
  if (model.units.length < 1) issues.push({ field: "units", message: "Select at least 1 unit column." });
  if (model.conversation.length < 1) {
    issues.push({ field: "conversation", message: "Select at least 1 conversation column." });
  }
  if (model.window === "MovingStanzaWindow") {
    if (!validWindowSize(model.windowBack, 1)) {
      issues.push({ field: "windowBack", message: `Lines back must be a whole number from 1 to ${WINDOW_MAX}.` });
    }
    if (!validWindowSize(model.windowForward, 0)) {
      issues.push({ field: "windowForward", message: `Lines forward must be a whole number from 0 to ${WINDOW_MAX}.` });
    }
  }

  const [a, b] = model.groups;
  const named = model.groupColumn !== null && a !== null && b !== null;
  if (model.rotation === "mean" && !named) {
    issues.push({ field: "rotation", message: "Means rotation needs two named groups." });
  }
  if (!named) {
    issues.push({ field: "groups", message: "Name two groups to compare." });
  } else if (a === b) {
    issues.push({ field: "groups", message: "Choose two different groups to compare." });
  } else if (census && model.units.length > 0) {
    for (const label of [a, b]) {
      const units = census.values.find((value) => value.value === label)?.units ?? 0;
      if (units < 2) {
        const noun = units === 1 ? "unit" : "units";
        issues.push({ field: "groups", message: `${label} has ${units} ${noun}. A comparison needs at least 2 per group.` });
      }
    }
  }
  if (absent.length > 0) {
    const [first, second] = model.groups;
    issues.push({
      field: "codes",
      message: `${absent.join(", ")} never ${absent.length === 1 ? "occurs" : "occur"} in ${first} or ${second}; the chi-square test needs every code to appear. Remove ${absent.length === 1 ? "it" : "them"} from the codes.`,
    });
  }
  if (figures.colorA.toLowerCase() === figures.colorB.toLowerCase()) {
    issues.push({ field: "colors", message: "The two groups need different colours." });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Stale results (plan §6.3): compared field by field against the run's config
// ---------------------------------------------------------------------------

const STALE_REASONS: [keyof ModelConfig, string][] = [
  ["codes", "Codes changed since this was run."],
  ["units", "Units changed since this was run."],
  ["conversation", "Conversation columns changed since this was run."],
  ["metadata", "Metadata columns changed since this was run."],
  ["window", "Stanza window changed since this was run."],
  ["windowBack", "Stanza window changed since this was run."],
  ["windowForward", "Stanza window changed since this was run."],
  ["rotation", "Rotation changed since this was run."],
  ["dimensions", "Dimensions changed since this was run."],
  ["groupColumn", "Group comparison changed since this was run."],
  ["groups", "Group comparison changed since this was run."],
];

export function staleReason(current: ModelConfig, atRun: ModelConfig): string | null {
  for (const [key, reason] of STALE_REASONS) {
    if (JSON.stringify(current[key]) !== JSON.stringify(atRun[key])) return reason;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Engine input, config file and the Python equivalent
// ---------------------------------------------------------------------------

export function toModelInput(model: ModelConfig): ModelInput {
  return {
    codes: model.codes,
    units: model.units,
    conversation: model.conversation,
    metadata: model.metadata,
    model: "EndPoint",
    window: model.window,
    window_size_back: model.windowBack,
    window_size_forward: model.windowForward,
    rotation: model.rotation,
    dimensions: model.dimensions,
    group_column: model.groupColumn!,
    groups: [model.groups[0]!, model.groups[1]!],
  };
}

export type FocusUnits = [string | null, string | null];

export function toFigureInput(figures: FigureOptions, focus: FocusUnits): FigureInput {
  return {
    color_a: figures.colorA,
    color_b: figures.colorB,
    show_ci: figures.showCI,
    show_labels: figures.showLabels,
    focus_unit_a: focus[0],
    focus_unit_b: focus[1],
  };
}

/** The metadata list pyENA actually receives: the group column is always carried. */
export function effectiveMetadata(model: ModelConfig): string[] {
  const metadata = [...model.metadata];
  if (model.groupColumn && !metadata.includes(model.groupColumn)) metadata.push(model.groupColumn);
  return metadata;
}

export interface ConfigFile {
  format: "pyena-platform-config";
  version: 1;
  pyena: string;
  source: { fileName: string; columns: string[] };
  model: ModelConfig;
  figures: FigureOptions;
}

export function readConfigFile(
  text: string,
  columns: string[],
): { model: ModelConfig; figures: FigureOptions | null; missing: string[] } {
  let parsed: Partial<ConfigFile>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON.");
  }
  if (parsed.format !== "pyena-platform-config" || !parsed.model) {
    throw new Error("This is not a configuration saved from this platform.");
  }
  const model: ModelConfig = { ...DEFAULT_MODEL, ...parsed.model };
  const available = new Set(columns);
  const referenced = [
    ...model.codes,
    ...model.units,
    ...model.conversation,
    ...model.metadata,
    ...(model.groupColumn ? [model.groupColumn] : []),
  ];
  const missing = [...new Set(referenced.filter((column) => !available.has(column)))];
  return { model, figures: parsed.figures ?? null, missing };
}

/** Keep only what still exists in the file (used on replace and on load). */
export function pruneToColumns(model: ModelConfig, columns: string[]): ModelConfig {
  const available = new Set(columns);
  const keep = (list: string[]) => list.filter((column) => available.has(column));
  const groupColumn = model.groupColumn && available.has(model.groupColumn) ? model.groupColumn : null;
  return {
    ...model,
    codes: keep(model.codes),
    units: keep(model.units),
    conversation: keep(model.conversation),
    metadata: keep(model.metadata),
    groupColumn,
    groups: groupColumn ? model.groups : [null, null],
  };
}

export function referencedColumns(model: ModelConfig): string[] {
  return [
    ...new Set([
      ...model.codes,
      ...model.units,
      ...model.conversation,
      ...model.metadata,
      ...(model.groupColumn ? [model.groupColumn] : []),
    ]),
  ];
}

function pyString(value: string): string {
  return JSON.stringify(value);
}

function pyList(values: string[], indent: string): string {
  if (values.length === 0) return "[]";
  const inline = `[${values.map(pyString).join(", ")}]`;
  if (inline.length <= 60) return inline;
  return `[\n${values.map((value) => `${indent}    ${pyString(value)},`).join("\n")}\n${indent}]`;
}

const DELIMITER_NAMES: Record<string, string> = { ",": "comma", "\t": "tab", ";": "semicolon" };

export function pythonEquivalent(
  model: ModelConfig,
  fileName: string,
  delimiter: string,
  pyenaCommit: string,
): string {
  const [a, b] = model.groups;
  const group = model.groupColumn ?? "<group column>";
  const labels = `(${pyString(a ?? "<first group>")}, ${pyString(b ?? "<second group>")})`;
  // pyENA reads a comma-separated path itself (read_csv_records); other
  // delimiters are read into records first, which ena() also accepts.
  const comma = delimiter === ",";
  const read = comma
    ? `data_path = Path(${pyString(fileName)})`
    : [
        `import csv`,
        `with open(${pyString(fileName)}, encoding="utf-8-sig", newline="") as handle:  # ${DELIMITER_NAMES[delimiter] ?? "custom"}-separated`,
        `    records = [dict(row) for row in csv.DictReader(handle, delimiter=${pyString(delimiter)})]`,
      ].join("\n");
  const windowLines =
    model.window === "Conversation"
      ? `    window="Conversation",`
      : [
          `    window="MovingStanzaWindow",`,
          `    window_size_back=${model.windowBack},`,
          `    window_size_forward=${model.windowForward},`,
        ].join("\n");
  return [
    `# pyENA @ ${pyenaCommit.slice(0, 7)}  (github.com/owen198/pyENA)`,
    `import json`,
    ...(comma ? [`from pathlib import Path`, ``] : [``]),
    `from pyena import ena, group_network, group_points, summarize_ena_results`,
    ``,
    read,
    ``,
    `ena_set = ena(`,
    `    data=${comma ? "data_path" : "records"},`,
    `    codes=${pyList(model.codes, "    ")},`,
    `    units=${pyList(model.units, "    ")},`,
    `    conversation=${pyList(model.conversation, "    ")},`,
    `    metadata=${pyList(effectiveMetadata(model), "    ")},`,
    `    model="EndPoint",`,
    windowLines,
    `    rotation=${pyString(model.rotation)},`,
    ...(model.dimensions === 3 ? [`    dimensions=3,`] : []),
    `    group_column=${pyString(group)},`,
    `    groups=${labels},`,
    `)`,
    ``,
    `a, b = ${labels}`,
    `network_a = group_network(ena_set, ${pyString(group)}, a)`,
    `network_b = group_network(ena_set, ${pyString(group)}, b)`,
    `summary = summarize_ena_results(`,
    `    ena_set=ena_set,`,
    `    group_a_label=a,`,
    `    group_b_label=b,`,
    `    group_column=${pyString(group)},`,
    `    group_a_points=group_points(ena_set, ${pyString(group)}, a),`,
    `    group_b_points=group_points(ena_set, ${pyString(group)}, b),`,
    `    group_a_network=network_a,`,
    `    group_b_network=network_b,`,
    `    subtracted_mean_network=network_a - network_b,`,
    `)`,
    `with open("statistical_summary.json", "w", encoding="utf-8") as handle:`,
    `    handle.write(json.dumps(summary, indent=2))`,
    ...(model.dimensions === 3
      ? [
          ``,
          `# The interactive 3D networks, as examples/rs/example_3d.py draws them (needs plotly).`,
          `from pyena import generate_analysis_outputs_3d`,
          ``,
          `generate_analysis_outputs_3d(ena_set=ena_set, group_column=${pyString(group)}, groups=${labels}, output_dir="outputs_3d")`,
        ]
      : []),
  ].join("\n");
}

export function binaryColumns(profiles: ColumnProfile[]): string[] {
  return profiles.filter((profile) => profile.type === "binary").map((profile) => profile.name);
}
