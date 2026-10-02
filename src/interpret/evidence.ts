// The evidence behind one figure or one edge, gathered in the browser from the
// analysis's own data. A connection analysis sees this and nothing else: the
// group mean weights pyENA computed, where the edge ranks, what the two codes
// mean, the lines of talk where the two codes meet inside the stanza window
// (counted by group and unit), up to twelve numbered excerpts [E1…], and the
// counter-evidence: units the edge never reaches and lines from the weaker
// group where one code appears without the other. Never the whole dataset.

import type { CodingSchema, InterpretTarget } from "../../shared/api";
import type { Row } from "../data/parse";
import { codePresent, type ModelConfig } from "../model/config";
import { edgeCodes, num, pValue } from "../results/format";
import type { EdgeWeight, Summary } from "../results/summary";

export const MAX_EXCERPTS = 12;
const MAX_TEXT = 240;

export interface ContextLine {
  row: number;
  unit: string;
  text: string;
  codes: string[];
}

export interface EvidenceLine {
  id: string;
  /** The data row, counted from 1 as a spreadsheet shows it under its header. */
  row: number;
  group: string;
  unit: string;
  conversation: string;
  text: string;
  codes: string[];
  edge: [string, string];
  /** Both codes on this line; the other code earlier in the stanza window; or counter-evidence. */
  kind: "same-line" | "window" | "counter";
  /** The stanza window the line was read in, oldest first, ending with the line itself. */
  context: ContextLine[];
}

export interface EdgeEvidence {
  codes: [string, string];
  weightA: number;
  weightB: number;
  /** pyENA's subtracted weight: group A's mean minus group B's. */
  difference: number;
  differenceRank: number;
  strengthRank: number;
  edgeCount: number;
  /** Lines where the two codes meet inside the stanza window, by group. */
  lines: Record<string, number>;
  /** Units with at least one such line, and all units, by group. */
  unitsWith: Record<string, number>;
  units: Record<string, number>;
  weaker: string | null;
}

export interface Evidence {
  target: InterpretTarget;
  label: string;
  groups: [string, string];
  edges: EdgeEvidence[];
  excerpts: EvidenceLine[];
  /** Lines that support the figure's or edge's connections, across groups. */
  supporting: number;
  textColumn: string | null;
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** The same relationship, whichever way round it was clicked. */
export function edgeTarget(first: string, second: string): InterpretTarget {
  const codes = [first, second].sort((x, y) => x.localeCompare(y)) as [string, string];
  return { kind: "edge", codes };
}

export function targetKey(target: InterpretTarget): string {
  return target.kind === "figure" ? `figure:${target.figureId}` : `edge:${target.codes[0]}__${target.codes[1]}`;
}

export function targetLabel(target: InterpretTarget): string {
  return target.kind === "figure" ? target.title : `${target.codes[0]} ↔ ${target.codes[1]}`;
}

// ---------------------------------------------------------------------------
// Weights from pyENA's summary
// ---------------------------------------------------------------------------

function weightOf(list: EdgeWeight[], a: string, b: string): number {
  const entry = list.find((item) => {
    const [x, y] = edgeCodes(item.edge);
    return (x === a && y === b) || (x === b && y === a);
  });
  return entry?.weight ?? 0;
}

function rankOf(values: { codes: [string, string]; value: number }[], a: string, b: string): number {
  const sorted = [...values].sort((x, y) => y.value - x.value);
  return sorted.findIndex((item) => (item.codes[0] === a && item.codes[1] === b) || (item.codes[0] === b && item.codes[1] === a)) + 1;
}

/** The edges a figure is about: the ones it draws most strongly. */
function figureEdges(figureId: string, summary: Summary): [string, string][] {
  const { group_a_stronger, group_b_stronger } = summary.networks.subtracted_mean_network_top_edges;
  const top = (list: EdgeWeight[], n: number) => [...list].sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight)).slice(0, n).map((e) => edgeCodes(e.edge));
  if (figureId === "group_points_overlay") return [...top(group_a_stronger, 1), ...top(group_b_stronger, 1)];
  if (/^a_|individual_a/.test(figureId)) return top(summary.networks.group_a_mean_network, 3);
  if (/^b_|individual_b/.test(figureId)) return top(summary.networks.group_b_mean_network, 3);
  return [...top(group_a_stronger, 2), ...top(group_b_stronger, 2)];
}

// ---------------------------------------------------------------------------
// Lines of talk, read through the stanza window
// ---------------------------------------------------------------------------

interface Line {
  index: number;
  group: string;
  unit: string;
  conversation: string;
  codes: Set<string>;
  text: string;
}

function readLines(rows: Row[], model: ModelConfig, textColumn: string | null): Line[][] {
  const conversations = new Map<string, Line[]>();
  rows.forEach((row, index) => {
    const conversation = model.conversation.map((column) => row[column]).join(" / ");
    const line: Line = {
      index,
      group: model.groupColumn ? (row[model.groupColumn] ?? "") : "",
      unit: model.units.map((column) => row[column]).join("::"),
      conversation,
      codes: new Set(model.codes.filter((code) => codePresent(row[code]))),
      text: textColumn ? (row[textColumn] ?? "").replace(/\s+/g, " ").trim() : "",
    };
    if (!conversations.has(conversation)) conversations.set(conversation, []);
    conversations.get(conversation)!.push(line);
  });
  return [...conversations.values()];
}

const trim = (text: string) => (text.length <= MAX_TEXT ? text : `${text.slice(0, MAX_TEXT - 1).trimEnd()}…`);

interface Found {
  line: Line;
  kind: EvidenceLine["kind"];
  window: Line[];
}

/** Every line where a and b meet inside the window, and the lines that carry one without the other. */
function scan(conversations: Line[][], model: ModelConfig, a: string, b: string): { support: Found[]; lone: Found[] } {
  const back = model.window === "MovingStanzaWindow" ? Math.max(1, model.windowBack) : Infinity;
  const forward = model.window === "MovingStanzaWindow" ? Math.max(0, model.windowForward) : 0;
  const support: Found[] = [];
  const lone: Found[] = [];
  for (const lines of conversations) {
    lines.forEach((line, k) => {
      const hasA = line.codes.has(a);
      const hasB = line.codes.has(b);
      if (!hasA && !hasB) return;
      const start = back === Infinity ? 0 : Math.max(0, k - back + 1);
      const window = lines.slice(start, Math.min(lines.length, k + forward + 1));
      const other = hasA ? b : a;
      if (hasA && hasB) support.push({ line, kind: "same-line", window: lines.slice(start, k + 1) });
      else if (window.some((entry) => entry !== line && entry.codes.has(other))) support.push({ line, kind: "window", window: lines.slice(start, k + 1) });
      else lone.push({ line, kind: "counter", window: lines.slice(start, k + 1) });
    });
  }
  return { support, lone };
}

/** Lines worth quoting first: both codes on one line, then a readable length, then data order. */
function quotable(found: Found[]): Found[] {
  const score = (entry: Found) =>
    (entry.kind === "same-line" ? 0 : 2) + (entry.line.text.length >= 40 && entry.line.text.length <= MAX_TEXT ? 0 : 1);
  return found.filter((entry) => entry.line.text.length > 0).sort((x, y) => score(x) - score(y) || x.line.index - y.line.index);
}

/** Up to `slots` lines, shared between the groups by how often each makes the connection, at most two per unit. */
function choose(found: Found[], groups: string[], slots: number, perUnit: number): Found[] {
  const ordered = quotable(found);
  const counts = groups.map((group) => ordered.filter((entry) => entry.line.group === group).length);
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total === 0 || slots <= 0) return [];
  // Each group that has lines gets at least one slot, the rest by share.
  const quota = counts.map((count) => (count === 0 ? 0 : Math.max(1, Math.round((slots * count) / total))));
  while (quota.reduce((sum, value) => sum + value, 0) > slots) {
    const largest = quota.indexOf(Math.max(...quota));
    quota[largest] -= 1;
  }
  const chosen: Found[] = [];
  groups.forEach((group, index) => {
    const used = new Map<string, number>();
    for (const entry of ordered) {
      if (chosen.filter((item) => item.line.group === group).length >= quota[index]) break;
      if (entry.line.group !== group || (used.get(entry.line.unit) ?? 0) >= perUnit) continue;
      used.set(entry.line.unit, (used.get(entry.line.unit) ?? 0) + 1);
      chosen.push(entry);
    }
  });
  return chosen;
}

export interface EvidenceInput {
  target: InterpretTarget;
  rows: Row[];
  model: ModelConfig;
  summary: Summary;
  textColumn: string | null;
}

export function gatherEvidence({ target, rows, model, summary, textColumn }: EvidenceInput): Evidence {
  const groups: [string, string] = [summary.groups.group_a_label, summary.groups.group_b_label];
  const pairs: [string, string][] = target.kind === "edge" ? [target.codes] : figureEdges(target.figureId, summary);
  const conversations = readLines(rows, model, textColumn);
  const subtracted = summary.networks.subtracted_mean_network.map((entry) => ({ codes: edgeCodes(entry.edge), value: Math.abs(entry.weight) }));
  const strength = summary.networks.subtracted_mean_network.map((entry) => {
    const [x, y] = edgeCodes(entry.edge);
    return {
      codes: [x, y] as [string, string],
      value: (weightOf(summary.networks.group_a_mean_network, x, y) + weightOf(summary.networks.group_b_mean_network, x, y)) / 2,
    };
  });
  const unitsByGroup = Object.fromEntries(groups.map((group) => [group, new Set<string>()]));
  for (const lines of conversations) for (const line of lines) unitsByGroup[line.group]?.add(line.unit);

  const supportSlots = target.kind === "edge" ? 9 : Math.max(2, Math.floor(9 / pairs.length));
  const counterSlots = target.kind === "edge" ? 3 : 1;
  const picked: { found: Found; edge: [string, string] }[] = [];
  const counters: { found: Found; edge: [string, string] }[] = [];
  let supporting = 0;

  const edges = pairs.map(([a, b]): EdgeEvidence => {
    const { support, lone } = scan(conversations, model, a, b);
    supporting += support.length;
    const weightA = weightOf(summary.networks.group_a_mean_network, a, b);
    const weightB = weightOf(summary.networks.group_b_mean_network, a, b);
    const weaker = weightA === weightB ? null : weightA < weightB ? groups[0] : groups[1];
    choose(support, groups, supportSlots, 2).forEach((found) => picked.push({ found, edge: [a, b] }));
    // Counter-evidence: in the weaker group, a line with one code and not the other anywhere in its window.
    if (weaker) {
      choose(lone.filter((entry) => entry.line.group === weaker), [weaker], counterSlots, 1).forEach((found) => counters.push({ found, edge: [a, b] }));
    }
    return {
      codes: [a, b],
      weightA,
      weightB,
      difference: weightA - weightB,
      differenceRank: rankOf(subtracted, a, b),
      strengthRank: rankOf(strength, a, b),
      edgeCount: subtracted.length,
      lines: Object.fromEntries(groups.map((group) => [group, support.filter((entry) => entry.line.group === group).length])),
      unitsWith: Object.fromEntries(groups.map((group) => [group, new Set(support.filter((entry) => entry.line.group === group).map((entry) => entry.line.unit)).size])),
      units: Object.fromEntries(groups.map((group) => [group, unitsByGroup[group]?.size ?? 0])),
      weaker,
    };
  });

  const limited = [...picked.slice(0, MAX_EXCERPTS - Math.min(counters.length, 3)), ...counters.slice(0, 3)];
  const excerpts = limited.map(({ found, edge }, index): EvidenceLine => ({
    id: `E${index + 1}`,
    row: found.line.index + 1,
    group: found.line.group,
    unit: found.line.unit,
    conversation: found.line.conversation,
    text: trim(found.line.text),
    codes: [...found.line.codes],
    edge,
    kind: found.kind,
    context: found.window.map((entry) => ({ row: entry.index + 1, unit: entry.unit, text: trim(entry.text), codes: [...entry.codes] })),
  }));

  return { target, label: targetLabel(target), groups, edges, excerpts, supporting, textColumn };
}

// ---------------------------------------------------------------------------
// The context the model receives, in words
// ---------------------------------------------------------------------------

function meaningOf(code: string, schema: CodingSchema | null): string {
  const meaning = schema?.entries.find((entry) => entry.code === code)?.meaning;
  return meaning ? `${meaning} (${code})` : code;
}

export function contextText(evidence: Evidence, extra: { fileName: string; model: ModelConfig; summary: Summary; schema: CodingSchema | null; figureCaption?: string }): string {
  const { model, summary, schema } = extra;
  const [a, b] = evidence.groups;
  const windowText =
    model.window === "MovingStanzaWindow"
      ? `a moving stanza window of ${model.windowBack} line${model.windowBack === 1 ? "" : "s"} (each line and the ${model.windowBack - 1} before it in the same conversation)`
      : "the whole conversation as the window";
  const lines: string[] = [];
  lines.push(
    evidence.target.kind === "figure"
      ? `What is being analysed: the figure "${evidence.target.title}". ${extra.figureCaption ?? ""}`.trim()
      : `What is being analysed: one connection (edge), ${meaningOf(evidence.target.codes[0], schema)} ↔ ${meaningOf(evidence.target.codes[1], schema)}.`,
  );
  lines.push(
    "",
    `Analysis: ${extra.fileName}; groups ${a} and ${b} (column ${summary.groups.group_column}); ${summary.model.units} units; ${summary.model.codes.length} codes; ${windowText}; ${model.rotation === "mean" ? "means" : "SVD"} rotation; ${model.dimensions} dimensions.`,
  );
  const codes = [...new Set(evidence.edges.flatMap((edge) => edge.codes))];
  lines.push("", "Codes involved:", ...codes.map((code) => `- ${meaningOf(code, schema)}`));
  if (!schema) lines.push("(No coding schema was uploaded; codes are named as in the data.)");

  lines.push("", "Edge statistics (pyENA mean networks; weights are means of the units' normalized edge weights):");
  for (const edge of evidence.edges) {
    const [x, y] = edge.codes;
    lines.push(
      `- ${x} ↔ ${y}: ${a} ${num(edge.weightA, 3)}, ${b} ${num(edge.weightB, 3)}; subtracted (${a} − ${b}) ${num(edge.difference, 3)}, the ${ordinal(edge.differenceRank)} largest difference of ${edge.edgeCount} edges; ${ordinal(edge.strengthRank)} strongest on average.`,
      `  Lines where the two codes meet within the window: ${a} ${edge.lines[a] ?? 0} (in ${edge.unitsWith[a] ?? 0} of ${edge.units[a] ?? 0} units), ${b} ${edge.lines[b] ?? 0} (in ${edge.unitsWith[b] ?? 0} of ${edge.units[b] ?? 0} units).`,
      `  Counter-evidence: ${edge.weaker ? `the connection is weaker for ${edge.weaker}; ` : "the groups' weights are equal; "}${a} units without it: ${(edge.units[a] ?? 0) - (edge.unitsWith[a] ?? 0)}; ${b} units without it: ${(edge.units[b] ?? 0) - (edge.unitsWith[b] ?? 0)}.`,
    );
  }

  if (evidence.target.kind === "figure" && /points|individual/.test(evidence.target.figureId)) {
    const t1 = summary.statistics.welch_t_test.dimension_1;
    const t2 = summary.statistics.welch_t_test.dimension_2;
    lines.push(
      "",
      "Group positions (pyENA's tests on the projected points):",
      `- Dimension 1: Welch's t(${num(t1.degrees_of_freedom)}) = ${num(t1.t_statistic)}, ${pValue(t1.p_value)}, Cohen's d = ${num(t1.cohens_d)}; means ${num(t1.mean_x)} (${a}, n = ${t1.n_x}) and ${num(t1.mean_y)} (${b}, n = ${t1.n_y}).`,
      `- Dimension 2: Welch's t(${num(t2.degrees_of_freedom)}) = ${num(t2.t_statistic)}, ${pValue(t2.p_value)}, Cohen's d = ${num(t2.cohens_d)}.`,
    );
  }

  const support = evidence.excerpts.filter((line) => line.kind !== "counter");
  const counter = evidence.excerpts.filter((line) => line.kind === "counter");
  lines.push("", "Evidence lines (cite only these references):");
  if (!evidence.textColumn) lines.push("(The dataset has no text column, so there are no lines to quote; only the counts above.)");
  else if (support.length === 0) lines.push("(No line in the data carries both codes within the window.)");
  for (const line of support) {
    lines.push(
      `[${line.id}] ${line.group}, unit ${line.unit}, conversation ${line.conversation}, row ${line.row}; ${line.kind === "same-line" ? "both codes on this line" : "the other code earlier in the stanza window"} (${line.edge.join(" ↔ ")}): "${line.text}"`,
    );
  }
  if (counter.length > 0) {
    lines.push("", "Counter-evidence lines (one code without the other in the window, from the weaker group):");
    for (const line of counter) {
      lines.push(`[${line.id}] ${line.group}, unit ${line.unit}, row ${line.row}; codes ${line.codes.join(", ")} (${line.edge.join(" ↔ ")}): "${line.text}"`);
    }
  }
  return lines.join("\n");
}

function ordinal(n: number): string {
  if (n <= 0) return "unranked";
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}

// ---------------------------------------------------------------------------
// [E#] references in an answer
// ---------------------------------------------------------------------------

export type Segment = { text: string } | { ref: string };

/** Split an answer into text and references; only references that exist become chips. */
export function splitReferences(text: string, ids: Set<string>): Segment[] {
  const segments: Segment[] = [];
  const pattern = /\[(E\d{1,2})\]/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (!ids.has(match[1])) continue;
    if (match.index > last) segments.push({ text: text.slice(last, match.index) });
    segments.push({ ref: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}
