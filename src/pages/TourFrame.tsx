// The real workspace, shown on the landing page. The landing page's platform
// tour loads this page in a frame and steps it through an analysis of RS.data:
// the same components, styles and state the platform uses, put into each state
// directly. It never boots the analysis engine: the result it shows was made
// ahead of time by the engine's own code (scripts/build-tour-figures.py).

import { useEffect } from "react";
import { SAMPLES } from "../data/samples";
import { parseInWorker } from "../data/load";
import { headerHash, type ParseOptions } from "../data/parse";
import { DEFAULT_MODEL, defaultFigureOptions } from "../model/config";
import { parseSummary } from "../results/summary";
import { useStore, type RunResult, type Source, type Step } from "../state/store";
import { AppNav } from "../components/Chrome";
import { Stepper } from "../components/Stepper";
import { Rail } from "../components/rail/Rail";
import { CanvasSheet, ProjectBar } from "./Workspace";

export const TOUR_NAME = "RS.data, design team talk";
const SAMPLE = SAMPLES.find((sample) => sample.id === "rs")!;
const OPTIONS: ParseOptions = { delimiter: "auto", header: true };
/** The workspace step each tour step shows. */
const WORKSPACE_STEP: Step[] = [1, 1, 2, 3, 4, 5, 5, 5];
const RESULT_TAB = [null, null, null, null, null, "network", "statistics", "interpretation"] as const;

interface Figures {
  summaryJson: string;
  units: RunResult["units"];
  svgs: Record<string, string>;
  focus: [string | null, string | null];
}

export interface TourApi {
  /** Put the workspace into tour step `step` (0 to 7). */
  show(step: number): Promise<void>;
  /** Type the research name, a few letters at a time. */
  typeName(text: string): void;
  /** Where an element is in the frame's own viewport, scrolled into view first. */
  rect(selector: string): { x: number; y: number; width: number; height: number } | null;
}

declare global {
  interface Window {
    pyenaTour?: TourApi;
  }
}

let source: Promise<Source> | null = null;
function loadSource(): Promise<Source> {
  source ??= fetch(new URL(import.meta.env.BASE_URL + SAMPLE.file, location.href))
    .then((response) => response.text())
    .then(async (text) => {
      const table = await parseInWorker(text, OPTIONS);
      return {
        fileName: "RS.data.csv",
        fileSize: new Blob([text]).size,
        text,
        options: OPTIONS,
        table,
        hash: headerHash(table.columns),
        sizeNote: null,
        sampleId: SAMPLE.id,
      };
    });
  return source;
}

let figures: Promise<Figures> | null = null;
function loadFigures(): Promise<Figures> {
  figures ??= fetch(new URL(import.meta.env.BASE_URL + "tour/rs-figures.json", location.href)).then((response) => response.json());
  return figures;
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

async function show(step: number) {
  const index = Math.max(0, Math.min(7, step));
  const loaded = index >= 1 ? await loadSource() : null;
  const result = index >= 5 ? await loadFigures() : null;
  const applied = index >= 3;
  const run: RunResult | null =
    result && loaded
      ? {
          summary: parseSummary(result.summaryJson),
          summaryJson: result.summaryJson,
          units: result.units,
          model: structuredClone(SAMPLE.preset),
          fileName: loaded.fileName,
          rowCount: loaded.table.rows.length,
          finishedAt: new Date(2026, 8, 28, 10, 24),
        }
      : null;

  useStore.setState({
    project: { id: "tour", name: index === 0 ? useStore.getState().project?.name ?? "" : TOUR_NAME },
    source: loaded,
    parsing: { status: "idle", message: null, fileName: null },
    step: WORKSPACE_STEP[index],
    model: applied ? structuredClone(SAMPLE.preset) : DEFAULT_MODEL,
    figures: defaultFigureOptions(),
    run: run ? { status: "succeeded", phase: null, error: null } : { status: "idle", phase: null, error: null },
    result: run,
    svgs: result ? (result.svgs as never) : {},
    plots3d: {},
    plots3dError: null,
    focusUnits: result ? result.focus : [null, null],
    redrawing: [],
    redrawing3d: false,
    figuresStale: false,
    schema: null,
    interpretations: [],
    notice: null,
    // The offer the example makes once loaded, until its configuration is applied.
    offer:
      loaded && !applied
        ? { kind: "preset", text: `This dataset ships with the configuration from ${SAMPLE.script}.`, model: SAMPLE.preset, figures: null, focus: SAMPLE.focus ?? null }
        : null,
    // Shown as ready: this page never loads the engine, and nothing on it runs.
    engine: { state: "ready", versions: { python: "3.13", pyodide: "314.0.7", numpy: "", scipy: "", matplotlib: "" } },
  });
  await frame();
  const tab = RESULT_TAB[index];
  if (tab) {
    document.getElementById(`tab-${tab}`)?.click();
    await frame();
  }
}

/** The platform as it looks with an analysis open; the tour drives it. */
export function TourFrame() {
  useEffect(() => {
    document.documentElement.classList.add("pt-inner");
    window.pyenaTour = {
      show,
      typeName(text) {
        useStore.setState({ project: { id: "tour", name: text } });
      },
      rect(selector) {
        const element = document.querySelector(selector);
        if (!element) return null;
        element.scrollIntoView({ block: "nearest", inline: "nearest" });
        const box = element.getBoundingClientRect();
        return { x: box.x, y: box.y, width: box.width, height: box.height };
      },
    };
    void show(0);
    return () => {
      delete window.pyenaTour;
    };
  }, []);

  return (
    <div className="pf-app">
      <AppNav>
        <ProjectBar />
      </AppNav>
      <Stepper />
      <main className="pf-split">
        <Rail />
        <CanvasSheet />
      </main>
    </div>
  );
}
