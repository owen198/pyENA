// The tutorial's steps. Each one names the real control it points at (by the
// `data-tour` attribute the platform's own component carries) and how it ends:
// most end on what the researcher does in the workspace itself, a loaded
// file, a finished run, a chosen unit, an opened tab, a pressed button; a few
// that only ask the researcher to look end on Next.

import type { ReactNode } from "react";
import { TUTORIAL_SAMPLE } from "../data/samples";
import { EXAMPLE_AUTHOR, useConnection } from "../interpret/connection";
import { targetKey } from "../interpret/evidence";
import { edgeCodes } from "../results/format";
import { useStore } from "../state/store";
import { strongestEdgePoint } from "../components/results/Plot3D";
import type { Point, Side } from "./Tour";

type Store = ReturnType<typeof useStore.getState>;

export interface TourStep {
  id: string;
  /** Its place in the progress, 1 to PROGRESS_STEPS; consecutive parts of one step share it. */
  progress: number;
  title: string;
  /** The element to highlight, or null while it is not on the page. */
  target: () => HTMLElement | null;
  /** Where the panel should sit, in order of preference (inside the connection panel: to its left). */
  prefer?: Side[];
  /**
   * Where to click, shown with a mouse pointer that taps it: an element (its
   * middle) or a point on screen. Steps that only ask the researcher to look
   * have none.
   */
  point?: () => HTMLElement | Point | null;
  body: (store: Store) => ReactNode;
  /** Shown instead of the body while the workspace is busy with this step's action. */
  waiting?: (store: Store) => ReactNode | null;
  /** The researcher's action is done: move on. `entered` is what onEnter returned. */
  done?: (store: Store, entered: unknown) => boolean;
  /** Move on when the highlighted control is pressed. */
  doneOnClick?: boolean;
  /** With doneOnClick: any control matching this counts, not only the highlighted one. */
  clickMatch?: string;
  /** A Next button, for steps that only ask the researcher to look. */
  next?: string;
  onNext?: () => void;
  /** A button in the panel that does the step's work for the researcher. */
  action?: (store: Store) => { label: string; run: () => void } | null;
  /** Put the workspace where the step needs it; the value is passed to done. */
  onEnter?: (store: Store) => unknown;
}

export const PROGRESS_STEPS = 10;

/** The most prominent visible element for a selector (the canvas drop zone over the rail's). */
function largest(selector: string): HTMLElement | null {
  let best: HTMLElement | null = null;
  let area = 0;
  document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
    const box = element.getBoundingClientRect();
    if (box.width * box.height > area) {
      area = box.width * box.height;
      best = element;
    }
  });
  return best;
}

const pick = (...selectors: string[]) => () => {
  for (const selector of selectors) {
    const element = largest(selector);
    if (element) return element;
  }
  return null;
};

/** Open a results tab, as a click on it would. */
function openTab(id: string) {
  const tab = document.getElementById(`tab-${id}`);
  if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
}

/** The way into asking: the Interpretation button above the results. */
const BUTTON = '[data-tour="interpret-button"]';

/** The tutorial panel's own action button (step 01's "Use example dataset"). */
const panelAction = () => document.querySelector<HTMLElement>(".pf-tour [data-tour-action]");
/** A button by its exact words, inside a part of the page. */
const buttonNamed = (scope: string, words: string) =>
  [...document.querySelectorAll<HTMLElement>(`${scope} button`)].find((button) => button.textContent?.trim() === words) ?? null;
const connection = () => useConnection.getState();

/** The connection that differs most between the groups: the first one the panel's home lists. */
function biggestDifference(store: Store): string {
  const rows = store.result?.summary.networks.subtracted_mean_network ?? [];
  const top = [...rows].sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight))[0];
  return top ? edgeCodes(top.edge).join(" ↔ ") : "the first connection";
}

/** Said when the conversation left the screen part-way through a step: the panel closed, or back on its home. */
function backToIt(store: Store) {
  return connection().open ? (
    <p>
      Click <b>{biggestDifference(store)}</b> under <b>Your conversations</b> to go back to it.
    </p>
  ) : (
    <p>
      The panel is closed. Click <b>Interpretation</b>, above the results, to open it again: your conversation is kept.
    </p>
  );
}

/** Where to click to get the conversation back: the Interpretation button, or the conversation on the panel's home. */
const backToItPoint = () =>
  connection().open
    ? document.querySelector<HTMLElement>('[data-tour="interpret-history"] .pf-pick__row')
    : document.querySelector<HTMLElement>(BUTTON);

/** The open figure's conversation has the tutorial's example answer. */
function exampleAnswered(store: Store): boolean {
  const { active } = connection();
  if (!active) return false;
  const key = targetKey(active);
  return store.threads.some((thread) => thread.key === key && thread.messages.some((message) => message.author === EXAMPLE_AUTHOR));
}

/**
 * The example's own settings (step 03). Taken from the offer when it is there;
 * after a reload the offer is gone, so from the example's preset directly.
 */
function ensureExampleSettings() {
  const store = useStore.getState();
  if (store.offer?.kind === "preset") store.applyOffer();
  else if (store.source?.sampleId === TUTORIAL_SAMPLE.id && store.model.codes.length === 0) store.updateModel(TUTORIAL_SAMPLE.preset);
}

const isExample = (store: Store) => store.source?.sampleId === TUTORIAL_SAMPLE.id;
const groupsOf = () => TUTORIAL_SAMPLE.preset.groups as [string, string];

export const STEPS: TourStep[] = [
  {
    id: "upload",
    progress: 1,
    title: "Upload your first dataset",
    target: pick('[data-tour="upload"]', '[data-tour="source"]'),
    body: (store) => (
      <>
        <p>
          Every analysis starts with a dataset. Click <b>Use example dataset</b> to add the example, the same way{" "}
          <b>Choose CSV file</b> adds your own.
        </p>
        {store.source && !isExample(store) && (
          <p className="pf-note">This tutorial uses the example dataset; your own file can come after.</p>
        )}
      </>
    ),
    point: panelAction,
    waiting: (store) => (store.parsing.status === "parsing" ? <p>Reading the example dataset…</p> : null),
    action: (store) =>
      store.parsing.status === "parsing"
        ? null
        : { label: "Use example dataset", run: () => void useStore.getState().loadSample(TUTORIAL_SAMPLE.id) },
    done: (store) => isExample(store) && store.parsing.status !== "parsing",
  },
  {
    id: "check",
    progress: 2,
    title: "Check your research data",
    target: pick('[data-tour="data-preview"]', '[data-tour="source"]'),
    onEnter: (store) => {
      if (store.step !== 1 && !store.result) store.setStep(1);
    },
    body: (store) => (
      <>
        <p>
          Your example is loaded: {store.source?.table.rows.length ?? 112} lines from four focus groups of students
          talking about online learning.
        </p>
        <p>
          Each row is one line of talk. Scroll the table to the right for the ideas each line mentions, such as{" "}
          <b>Flexibility</b> and <b>Isolation</b>: a 1 means the line mentions that idea. IdeaLens connects ideas that
          come up close together.
        </p>
      </>
    ),
    next: "Next",
    // The example comes with its settings (step 03): applied here, so the run is next.
    onNext: () => {
      ensureExampleSettings();
      useStore.getState().setStep(4);
    },
  },
  {
    id: "generate",
    progress: 3,
    title: "Generate your analysis",
    target: pick('[data-tour="run"]'),
    point: pick('[data-tour="run"]'),
    onEnter: (store) => {
      if (!store.result) ensureExampleSettings();
      if (!store.result && useStore.getState().step !== 4) useStore.getState().setStep(4);
    },
    body: () => (
      <>
        <p>
          The example's variables and settings are already chosen. IdeaLens will now find the patterns and relationships
          across the research.
        </p>
        <p>
          Click <b>Run analysis</b> to continue.
        </p>
      </>
    ),
    waiting: (store) =>
      store.run.status === "running" ? (
        <p>
          Analysing… The first analysis loads the analysis engine into your browser, which can take a minute. This
          step moves on by itself when the results are ready.
        </p>
      ) : store.run.status === "failed" ? (
        <p>
          The run stopped; its message is in the workspace. Click <b>Re-run analysis</b> to try again.
        </p>
      ) : null,
    done: (store) => store.result !== null && store.run.status === "succeeded" && store.step === 5,
  },
  {
    id: "network",
    progress: 4,
    title: "See how ideas connect",
    // The graph itself, so as much of the network as the window allows is brought into view.
    target: pick('[data-figure="subtracted_mean_network"] .pf-figure__plot', '[data-figure="subtracted_mean_network"]'),
    onEnter: () => openTab("network"),
    body: () => {
      const [a, b] = groupsOf();
      return (
        <>
          <p>
            Each dot is an idea from your research. Each line is a connection: two ideas that came up together in the
            students' talk. The thicker the line, the stronger the connection.
          </p>
          <p>
            This network compares the two groups: blue lines are connections {a} students make more, red lines are ones{" "}
            {b} students make more.
          </p>
        </>
      );
    },
    next: "Next",
  },
  {
    id: "open",
    progress: 5,
    title: "Ask about your results",
    target: pick(BUTTON),
    point: pick(BUTTON),
    onEnter: () => openTab("network"),
    body: () => (
      <p>
        Click <b>Interpretation</b>. It opens beside the results, so the figures stay in view; nothing is sent to the AI
        until you ask a question.
      </p>
    ),
    done: () => connection().open,
  },
  {
    id: "pick",
    progress: 6,
    title: "Pick what to understand",
    target: () => (connection().open ? pick('[data-tour="interpret-picks"]')() : pick(BUTTON)()),
    prefer: ["left", "bottom"],
    point: () => (connection().open ? document.querySelector<HTMLElement>('[data-tour="interpret-pick"]') : pick(BUTTON)()),
    body: (store) =>
      connection().open ? (
        <p>
          IdeaLens lists the connections that differ most between the two groups. Click the first one,{" "}
          <b>{biggestDifference(store)}</b>.
        </p>
      ) : (
        <p>
          The panel is closed. Click <b>Interpretation</b>, above the results, to open it again.
        </p>
      ),
    done: () => connection().open && connection().active?.kind === "edge",
  },
  {
    id: "quick",
    progress: 7,
    title: "Ask a question",
    target: () => (connection().active ? pick('[data-tour="interpret-quick"]')() : connection().open ? pick('[data-tour="interpret-picks"]')() : pick(BUTTON)()),
    prefer: ["left", "top"],
    point: () =>
      connection().active
        ? buttonNamed('[data-tour="interpret-quick"]', "Why are these connected?")
        : connection().open
          ? document.querySelector<HTMLElement>('[data-tour="interpret-pick"]')
          : pick(BUTTON)(),
    body: (store) =>
      connection().active ? (
        <p>
          Click <b>Why are these connected?</b> In this tutorial IdeaLens answers with an example written from the
          evidence; nothing is sent to the AI.
        </p>
      ) : connection().open ? (
        <p>
          Click <b>{biggestDifference(store)}</b> to open its conversation.
        </p>
      ) : (
        backToIt(store)
      ),
    done: (store) => exampleAnswered(store),
  },
  {
    id: "chip",
    progress: 8,
    title: "Check the evidence",
    // The first reference in the answer, the one the step names.
    target: () => document.querySelector<HTMLElement>('.pf-cw__answer [data-tour="interpret-ref"]') ?? backToItPoint(),
    prefer: ["left", "bottom", "top"],
    point: () => document.querySelector<HTMLElement>('.pf-cw__answer [data-tour="interpret-ref"]') ?? backToItPoint(),
    clickMatch: '.pf-cw [data-tour="interpret-ref"]',
    body: (store) => {
      // Named as the answer numbers it: the stronger group's lines come first, so it is not always E1.
      const first = document.querySelector('.pf-cw__answer [data-tour="interpret-ref"]')?.textContent?.trim();
      return first ? (
        <p>
          Click a reference such as <b>{first}</b> to see the line of data it comes from, and the stretch of talk it was
          read in. Under each answer, <b>Copy</b> and <b>Add to notes</b> keep what you want to use.
        </p>
      ) : (
        backToIt(store)
      );
    },
    doneOnClick: true,
  },
  {
    id: "depth",
    progress: 9,
    title: "Look deeper",
    target: pick('[data-tour="run-3d"]'),
    point: pick('[data-tour="run-3d"]'),
    onEnter: () => {
      openTab("network");
      ensureExampleSettings();
    },
    body: () => (
      <p>
        Some relationships are hard to see on a flat page. Click <b>Run in 3D</b> to add a third dimension to the same
        model.
      </p>
    ),
    waiting: (store) =>
      store.run.status === "running" ? (
        <p>Running the same model in three dimensions… The first 3D run loads the 3D drawing tools too.</p>
      ) : null,
    done: (store) =>
      store.result?.model.dimensions === 3 && store.run.status === "succeeded" && Object.keys(store.plots3d).length > 0,
  },
  {
    id: "shortcut",
    progress: 9,
    title: "Ask from the results",
    target: pick('[data-figure="subtracted_3d_network"]', '[data-figure="subtracted_3d_network_with_points"]'),
    // Another connection than the one already open, through the scene's camera: it follows the network as it turns.
    point: () => {
      const active = connection().active;
      return strongestEdgePoint(document.querySelector('[data-figure="subtracted_3d_network"]'), active?.kind === "edge" ? active.codes : null);
    },
    onEnter: () => {
      openTab("network");
      const active = connection().active;
      return active ? targetKey(active) : null;
    },
    body: () => (
      <p>
        You can also ask straight from the results. Click a line in the 3D network, such as the one the pointer shows,
        and its conversation opens. <b>Ask about this figure</b> under a figure and <b>Ask</b> beside an edge in the
        Model tab do the same.
      </p>
    ),
    done: (_store, entered) => {
      const { open, active } = connection();
      return open && active?.kind === "edge" && targetKey(active) !== entered;
    },
  },
  {
    id: "back",
    progress: 10,
    title: "Your conversations",
    target: () => (connection().active ? pick('[data-tour="interpret-back"]')() : pick(BUTTON)()),
    prefer: ["left", "bottom"],
    point: () => (connection().active ? pick('[data-tour="interpret-back"]')() : pick(BUTTON)()),
    body: () =>
      connection().open ? (
        <p>
          Click <b>All</b> to go back to the panel's home.
        </p>
      ) : (
        <p>
          The panel is closed. Click <b>Interpretation</b>, above the results, to open it on its home.
        </p>
      ),
    done: () => connection().open && connection().active === null,
  },
  {
    id: "history",
    progress: 10,
    title: "Kept for you",
    target: () => (connection().open ? pick('[data-tour="interpret-history"]')() : pick(BUTTON)()),
    prefer: ["left", "bottom"],
    body: () => (
      <p>
        Every conversation you start is kept here under <b>Your conversations</b>, with the analysis, to come back to and
        carry on. The <b>Interpretation</b> button counts them.
      </p>
    ),
    next: "Next",
  },
  {
    id: "report",
    progress: 10,
    title: "Your report",
    target: () => document.getElementById("tab-report"),
    point: () => document.getElementById("tab-report"),
    body: () => (
      <p>
        What you keep lives in <b>Report</b>: the answers you added to your notes, and the whole model in words. Notes
        and conversations go into the ZIP download too. Open the <b>Report</b> tab.
      </p>
    ),
    done: () => document.getElementById("tab-report")?.getAttribute("aria-selected") === "true",
  },
];
