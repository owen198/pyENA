// Exports (plan §12). All generated in this browser, from what is on screen.

import JSZip from "jszip";
import { engine } from "../engine/client";
import { PYENA_COMMIT } from "../engine/version";
import {
  pythonEquivalent,
  toFigureInput,
  type ConfigFile,
  type FigureOptions,
  type FocusUnits,
  type ModelConfig,
} from "../model/config";
import type { ConnectionThread, Interpretation } from "../../shared/api";
import { targetLabel } from "../interpret/evidence";
import type { RunResult, Source } from "../state/store";
import { download } from "../ui/primitives";
import { FIGURES, FIGURES_3D, type Figure3dId, type FigureContext, type FigureId } from "./figures";
import { edgeCodes } from "./format";

export function configFileJson(source: Source, model: ModelConfig, figures: FigureOptions): string {
  const file: ConfigFile = {
    format: "pyena-platform-config",
    version: 1,
    pyena: PYENA_COMMIT,
    source: { fileName: source.fileName, columns: source.table.columns },
    model,
    figures,
  };
  return JSON.stringify(file, null, 2);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function edgesCsv(result: RunResult): string {
  const { group_a_label: a, group_b_label: b } = result.summary.groups;
  const { group_a_mean_network, group_b_mean_network, subtracted_mean_network } = result.summary.networks;
  const header = ["edge", "code_1", "code_2", `${a}_mean_weight`, `${b}_mean_weight`, `subtracted_weight (${a} - ${b})`];
  const rows = subtracted_mean_network.map((row, index) => {
    const [first, second] = edgeCodes(row.edge);
    return [row.edge, first, second, group_a_mean_network[index].weight, group_b_mean_network[index].weight, row.weight];
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

export function figureContext(result: RunResult, focus: FocusUnits): FigureContext {
  const { summary } = result;
  return {
    a: summary.groups.group_a_label,
    b: summary.groups.group_b_label,
    nA: summary.points.group_a.n,
    nB: summary.points.group_b.n,
    codes: summary.model.codes.length,
    focusA: focus[0],
    focusB: focus[1],
  };
}

export class ExportUnavailable extends Error {}

export async function figureFile(
  id: FigureId | Figure3dId,
  format: "svg" | "png" | "html",
  figures: FigureOptions,
  focus: FocusUnits,
): Promise<Uint8Array> {
  if (!engine.hasModel) {
    throw new ExportUnavailable("The engine restarted since this run. Re-run the analysis to export figure files.");
  }
  return engine.export(id, format, toFigureInput(figures, focus));
}

export async function downloadFigure(
  id: FigureId,
  format: "svg" | "png",
  result: RunResult,
  figures: FigureOptions,
  focus: FocusUnits,
) {
  const spec = FIGURES.find((figure) => figure.id === id)!;
  const bytes = await figureFile(id, format, figures, focus);
  download(`${spec.file(figureContext(result, focus))}.${format}`, bytes as BlobPart, format === "png" ? "image/png" : "image/svg+xml");
}

/** A 3D network as a standalone interactive page, as pyENA's save_figure_html writes it. */
export async function downloadFigure3d(id: Figure3dId, result: RunResult, figures: FigureOptions, focus: FocusUnits) {
  const spec = FIGURES_3D.find((figure) => figure.id === id)!;
  const bytes = await figureFile(id, "html", figures, focus);
  download(`${spec.file(figureContext(result, focus))}.html`, bytes as BlobPart, "text/html");
}

const stamp = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The answers kept as notes, in Markdown: where each came from, the question, the answer. */
export function notesText(threads: ConnectionThread[]): string {
  const parts = ["# Notes", ""];
  for (const thread of threads) {
    thread.messages.forEach((message, index) => {
      if (message.role !== "assistant" || !message.noted) return;
      const asked = [...thread.messages.slice(0, index)].reverse().find((entry) => entry.role === "user");
      parts.push(`## ${targetLabel(thread.target)}`, "", `Asked: ${asked?.text ?? "(no question)"}`, `Answered: ${stamp(message.createdAt)}${message.author ? ` by ${message.author}` : ""}`, "", message.text, "");
    });
  }
  if (parts.length === 2) parts.push("No answers were added to the notes.", "");
  return parts.join("\n");
}

/** Every conversation about a figure or connection, in Markdown. */
export function conversationsText(threads: ConnectionThread[]): string {
  const parts = ["# Conversations about figures and connections", ""];
  for (const thread of threads) {
    parts.push(`## ${targetLabel(thread.target)}`, "");
    for (const message of thread.messages) {
      if (message.role === "user") parts.push(`**Question** (${stamp(message.createdAt)}): ${message.text}`, "");
      else parts.push(`**Answer**${message.author ? ` (${message.author})` : ""}${message.noted ? " [in notes]" : ""}:`, "", message.text, "");
    }
  }
  if (parts.length === 2) parts.push("No conversations yet.", "");
  return parts.join("\n");
}

export async function downloadSession(
  source: Source,
  result: RunResult,
  figures: FigureOptions,
  focus: FocusUnits,
  writing: { threads: ConnectionThread[]; interpretations: Interpretation[] } = { threads: [], interpretations: [] },
) {
  const zip = new JSZip();
  const ctx = figureContext(result, focus);
  zip.file("statistical_summary.json", result.summaryJson);
  zip.file("config.json", configFileJson(source, result.model, figures));
  zip.file("edges.csv", edgesCsv(result));
  zip.file("analysis.py", pythonEquivalent(result.model, source.fileName, source.table.delimiter, PYENA_COMMIT) + "\n");
  for (const spec of FIGURES) {
    const name = spec.file(ctx);
    zip.file(`figures/${name}.svg`, await figureFile(spec.id, "svg", figures, focus));
    zip.file(`figures/${name}.png`, await figureFile(spec.id, "png", figures, focus));
  }
  if (result.model.dimensions === 3) {
    for (const spec of FIGURES_3D) {
      zip.file(`figures_3d/${spec.file(ctx)}.html`, await figureFile(spec.id, "html", figures, focus));
    }
  }
  // What was written about the results: notes, conversations and the latest whole-model interpretation.
  if (writing.threads.length > 0) {
    zip.file("interpretation/notes.md", notesText(writing.threads));
    zip.file("interpretation/conversations.md", conversationsText(writing.threads));
  }
  const resultAt = result.finishedAt.toISOString();
  const latest = writing.interpretations.filter((entry) => entry.resultAt === resultAt).at(-1);
  if (latest) zip.file("interpretation/whole_model.txt", `${latest.text}\n`);
  const blob = await zip.generateAsync({ type: "blob" });
  const stem = source.fileName.replace(/\.[^.]+$/, "");
  download(`${stem}_ena_session.zip`, blob, "application/zip");
}
