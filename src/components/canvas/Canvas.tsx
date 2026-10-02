import type { ReactNode } from "react";
import { useIsStale, useIssues } from "../../state/issues";
import { useStore } from "../../state/store";
import { ArrowIcon } from "../../ui/marks";
import { FlagNote } from "../../ui/primitives";
import { DropZone } from "../DropZone";
import { Results } from "../results/Results";
import { DataTable } from "./DataTable";
import { LoadingNetwork } from "./LoadingNetwork";
import { Preview } from "./Preview";
import { errorHeadline, LIBRARY_ERRORS, RUN_CAPTIONS } from "./runCopy";

/** The right-hand column: never empty (plan §5.2). */
export function Canvas({ open, idle, handle }: { open: boolean; idle: boolean; handle: ReactNode }) {
  const source = useStore((state) => state.source);
  const parsing = useStore((state) => state.parsing);
  const run = useStore((state) => state.run);
  const result = useStore((state) => state.result);
  const step = useStore((state) => state.step);
  const dragActive = useStore((state) => state.dragActive);

  // What the canvas shows follows the step: data while uploading and
  // configuring, both files on Preview, the run on Run, results on Results.
  let content: ReactNode;
  if (parsing.status === "parsing") {
    content = <LoadingNetwork caption="Reading the file…" />;
  } else if (run.status === "running") {
    content = <RunningState />;
  } else if (!source) {
    content = <EmptySource />;
  } else if (step === 2) {
    content = <Preview />;
  } else if (step === 4) {
    content = run.status === "failed" && run.error ? <RunFailure /> : <RunReady />;
  } else if (step === 5 && result) {
    content = <Results />;
  } else {
    content = (
      <div className="pf-panel--data" data-tour="data-preview">
        <div className="pf-canvas__head">
          <h2 className="pf-canvas__title">{source.fileName}</h2>
          <span className="metadata pf-ink-secondary">
            {source.table.rows.length.toLocaleString("en-US")} rows / {source.table.columns.length} columns
          </span>
        </div>
        <DataTable />
      </div>
    );
  }

  // The whole page accepts a drop (App). With a source open, the canvas outlines
  // itself so it is clear a drop replaces what is shown (plan §7.2).
  return (
    <section
      className={`pf-canvas${dragActive && source ? " is-drop" : ""}${open ? " is-open" : ""}${idle ? " is-idle" : ""}`}
      aria-label="Data and results"
    >
      {handle}
      {content}
    </section>
  );
}

/** Empty state (EmptyState README) that is also the drop target it describes. */
function EmptySource() {
  const parsing = useStore((state) => state.parsing);
  return (
    <div className="pf-empty-drop">
      <div className="ml-empty">
        <div className="ml-empty__eyebrow">No source selected</div>
        <p className="ml-empty__body">
          Choose a coded CSV file. Rows are coded lines of discourse; columns are codes, units and conversation
          identifiers. To try the platform first, load one of the example datasets in the panel on the left.
        </p>
        {parsing.status === "error" && <FlagNote>{parsing.message}</FlagNote>}
      </div>
      <DropZone size="canvas" />
    </div>
  );
}

function RunningState() {
  const phase = useStore((state) => state.run.phase);
  const cancelRun = useStore((state) => state.cancelRun);
  return (
    <LoadingNetwork caption={phase ? RUN_CAPTIONS[phase] : RUN_CAPTIONS.accumulate}>
      <button type="button" className="ml-btn ml-btn--ghost" onClick={cancelRun}>
        Cancel
      </button>
    </LoadingNetwork>
  );
}

/** 04 before a run: whether it can run, and what happens when it does. */
function RunReady() {
  const issues = useIssues();
  const result = useStore((state) => state.result);
  const stale = useIsStale();
  const setStep = useStore((state) => state.setStep);
  const messages = [...new Set(issues.map((issue) => issue.message))];

  return (
    <div className="pf-failure">
      <div className="ml-empty__eyebrow">{messages.length > 0 ? "Not ready to run" : "Ready to run"}</div>
      {messages.length > 0 ? (
        <>
          <p className="ml-empty__body">
            {messages.length === 1 ? "One setting needs attention" : `${messages.length} settings need attention`} before
            pyENA can run. Each is listed beside the Run button.
          </p>
          <button type="button" className="ml-btn ml-btn--secondary" onClick={() => setStep(3)}>
            Edit variables & settings
          </button>
        </>
      ) : result && !stale ? (
        <>
          <p className="ml-empty__body">
            These settings were run at{" "}
            {result.finishedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. Their results are
            on View results; running again gives the same numbers.
          </p>
          <button type="button" className="ml-btn ml-btn--primary" onClick={() => setStep(5)}>
            View results
            <ArrowIcon size={18} />
          </button>
        </>
      ) : (
        <p className="ml-empty__body">
          {stale
            ? "The settings changed since the last run. Run the analysis again to bring the results up to date."
            : "pyENA accumulates co-occurrences for each unit, builds the space and compares the two groups, in this browser. Results open on View results when it finishes."}{" "}
          Check the summary on the left, then run.
        </p>
      )}
    </div>
  );
}

/** A run failure replaces the results; the rail stays editable (plan §15). */
function RunFailure() {
  const error = useStore((state) => state.run.error)!;
  const model = useStore((state) => state.model);
  const setStep = useStore((state) => state.setStep);
  return (
    <div className="pf-failure">
      <div className="ml-empty__eyebrow">The analysis did not run</div>
      <p className="ml-empty__body">{errorHeadline(error, model)}</p>
      {LIBRARY_ERRORS.has(error.kind) && (
        <>
          <p className="metadata pf-ink-secondary" style={{ marginBottom: "var(--space-2)" }}>
            pyENA's message
          </p>
          <pre className="pf-diagnostic">{error.message}</pre>
        </>
      )}
      <button type="button" className="ml-btn ml-btn--secondary" onClick={() => setStep(3)}>
        Edit configuration
      </button>
    </div>
  );
}
