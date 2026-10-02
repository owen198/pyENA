// Lines of the original data that show a connection: the interpretation's way
// of closing the loop back to what was said (SKILL.md, step 5). Only lines
// that carry both codes of an edge count; nothing is paraphrased or invented.

import type { ColumnProfile, Row } from "../data/parse";
import { codePresent, type ModelConfig } from "../model/config";
import { edgeCodes } from "../results/format";
import type { Summary } from "../results/summary";

export interface Excerpt {
  group: string;
  codes: [string, string];
  unit: string;
  text: string;
}

/** Names a text column goes by, most telling first ("line" last: it is often a line number). */
const TEXT_NAMES = ["text", "utterance", "utterances", "content", "message", "transcript", "speech", "talk", "quote", "turn", "line"];
const MAX_LENGTH = 240;

/** The column that holds what was said, if the dataset has one. */
export function findTextColumn(profiles: ColumnProfile[], model: ModelConfig): string | null {
  const used = new Set([...model.codes, ...model.units, ...model.conversation, model.groupColumn]);
  // A column named for talk, by the most telling name first, and never one that holds only numbers.
  for (const name of TEXT_NAMES) {
    const named = profiles.find((profile) => profile.name.toLowerCase() === name && !used.has(profile.name) && profile.type !== "numeric");
    if (named) return named.name;
  }
  return profiles.find((profile) => profile.type === "text" && !used.has(profile.name))?.name ?? null;
}

function trim(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= MAX_LENGTH ? clean : `${clean.slice(0, MAX_LENGTH - 1).trimEnd()}…`;
}

/**
 * For the connection most stronger in each group, the first line of that
 * group that carries both codes. Deterministic, so the same analysis always
 * quotes the same lines.
 */
export function findExcerpts(rows: Row[], model: ModelConfig, summary: Summary, textColumn: string | null): Excerpt[] {
  if (!textColumn || !model.groupColumn) return [];
  const { group_a_label: a, group_b_label: b } = summary.groups;
  const { group_a_stronger, group_b_stronger } = summary.networks.subtracted_mean_network_top_edges;
  const wanted: [string, string | undefined][] = [
    [a, group_a_stronger[0]?.edge],
    [b, group_b_stronger[0]?.edge],
  ];
  const excerpts: Excerpt[] = [];
  for (const [group, edge] of wanted) {
    if (!edge) continue;
    const codes = edgeCodes(edge);
    const lines = rows.filter(
      (row) =>
        row[model.groupColumn!] === group &&
        codePresent(row[codes[0]]) &&
        codePresent(row[codes[1]]) &&
        (row[textColumn] ?? "").trim().length > 0,
    );
    // Prefer a line long enough to say something and short enough to quote whole.
    const line = lines.find((row) => row[textColumn].trim().length >= 40 && row[textColumn].trim().length <= MAX_LENGTH) ?? lines[0];
    if (!line) continue;
    excerpts.push({ group, codes, unit: model.units.map((column) => line[column]).join("::"), text: trim(line[textColumn]) });
  }
  return excerpts;
}
