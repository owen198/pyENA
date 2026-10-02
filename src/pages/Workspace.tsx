import { useEffect, useRef, useState } from "react";
import type { ProjectDetail } from "../../shared/api";
import { api, ApiError, apiText } from "../api/client";
import { SAMPLES } from "../data/samples";
import { engine } from "../engine/client";
import { Link, navigate } from "../router";
import { takeHandoff } from "../state/handoff";
import { bindProject, flush, unbindProject, unsaved, useSave } from "../state/persist";
import { describeSource, useStore } from "../state/store";
import { ArrowIcon } from "../ui/marks";
import { Modal } from "../ui/primitives";
import { AppNav } from "../components/Chrome";
import { Stepper } from "../components/Stepper";
import { Rail } from "../components/rail/Rail";
import { Canvas } from "../components/canvas/Canvas";
import { ConnectionDock, useDockedBeside } from "../components/interpret/ConnectionWindow";
import { useConnection } from "../interpret/connection";
import { useResultsTab } from "../components/results/tabs";
import { LoadingNetwork } from "../components/canvas/LoadingNetwork";

type Opening = { status: "loading" } | { status: "ready" } | { status: "error"; message: string; missing: boolean };

/** One saved analysis, open in the five-step workspace. */
export function Workspace({ id, view = "workspace" }: { id: string; view?: "workspace" | "interpretation" }) {
  const [opening, setOpening] = useState<Opening>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  // The engine loads while the analysis opens (plan §3.4).
  useEffect(() => (view === "workspace" ? engine.boot() : undefined), [view]);

  useEffect(() => {
    let cancelled = false;
    // A connection panel belongs to the analysis it was opened in.
    useConnection.setState({ active: null, open: false, switchedFrom: null });
    setOpening({ status: "loading" });
    (async () => {
      try {
        const { project } = await api<{ project: ProjectDetail }>("GET", `/projects/${id}`);
        const csvText = project.source ? await apiText(`/projects/${id}/data`) : null;
        if (cancelled) return;
        await useStore.getState().hydrate(project, csvText);
        if (cancelled) return;
        bindProject(id);
        setOpening({ status: "ready" });
        // Research brought in on the landing page arrives in its new, empty analysis.
        const handoff = project.source ? null : takeHandoff();
        if (handoff?.file) {
          useStore.getState().requestFile([handoff.file]);
          if (handoff.schema) void useStore.getState().loadSchemaFile(handoff.schema);
        } else if (handoff?.sampleId) void useStore.getState().loadSample(handoff.sampleId);
      } catch (error) {
        if (cancelled) return;
        setOpening({
          status: "error",
          message: error instanceof Error ? error.message : "The analysis could not be opened.",
          missing: error instanceof ApiError && error.status === 404,
        });
      }
    })();
    return () => {
      cancelled = true;
      unbindProject();
      // A run cannot outlive its analysis: its result would have nowhere to go.
      if (useStore.getState().run.status === "running") useStore.getState().cancelRun();
    };
  }, [id, attempt]);

  // Closing the tab with a change still on its way asks first.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!unsaved()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  return (
    <div className="pf-app">
      <AppNav>{opening.status === "ready" && <ProjectBar />}</AppNav>
      {opening.status === "ready" ? (
        view === "interpretation" ? (
          <InterpretationRedirect id={id} />
        ) : (
          <ReadyWorkspace />
        )
      ) : opening.status === "loading" ? (
        <main className="pf-page-state">
          <LoadingNetwork caption="Opening the analysis…" />
        </main>
      ) : (
        <main className="pf-page-state">
          <div className="ml-empty">
            <div className="ml-empty__eyebrow">{opening.missing ? "No such analysis" : "The analysis did not open"}</div>
            <p className="ml-empty__body">
              {opening.missing
                ? "This analysis does not exist, or it belongs to another account."
                : `${opening.message} Your saved work is not affected.`}
            </p>
            <div className="pf-row">
              {!opening.missing && (
                <button type="button" className="ml-btn ml-btn--primary" onClick={() => setAttempt(attempt + 1)}>
                  Try again
                </button>
              )}
              <Link to="/projects" className="ml-btn ml-btn--secondary">
                Back to your history
              </Link>
            </div>
          </div>
        </main>
      )}
    </div>
  );
}

function ReadyWorkspace() {
  usePageDrop();
  const docked = useDockedBeside();
  return (
    <>
      <Stepper />
      <main className={`pf-split${docked ? " is-docked" : ""}`}>
        <Rail />
        <CanvasSheet />
        <ConnectionDock />
      </main>
      <ReplaceConfirm />
    </>
  );
}

/**
 * The old address of the Interpretation page (/projects/:id/interpretation):
 * interpretation now lives beside the results, so it opens the workspace on the
 * Report tab (notes and the whole-model interpretation).
 */
function InterpretationRedirect({ id }: { id: string }) {
  useEffect(() => {
    useResultsTab.getState().setActive("report");
    navigate(`/projects/${id}`, { replace: true });
  }, [id]);
  return null;
}

// ---------------------------------------------------------------------------
// The analysis's name and whether it is saved, in the bar above the steps.
// ---------------------------------------------------------------------------

export function ProjectBar() {
  const name = useStore((state) => state.project?.name ?? "");
  const renameProject = useStore((state) => state.renameProject);
  const save = useSave();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const commit = () => {
    renameProject(draft);
    setEditing(false);
  };

  return (
    <div className="pf-project">
      <Link to="/projects" className="pf-project__back small" aria-label="Back to your history">
        <ArrowIcon size={16} className="pf-icon--back" />
      </Link>
      {editing ? (
        <input
          ref={input}
          className="ml-input pf-project__input"
          value={draft}
          maxLength={120}
          aria-label="Analysis name"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button
          type="button"
          className="pf-project__name"
          title="Rename this analysis"
          onClick={() => {
            setDraft(name);
            setEditing(true);
          }}
        >
          {name}
          <span className="pf-visually-hidden">, rename</span>
        </button>
      )}
      <span className="pf-save small" role="status">
        {save.status === "error" ? (
          <>
            <span className="pf-save__dot is-error" />
            Not saved
            <button type="button" className="ml-filter-clear" onClick={() => void flush()} title={save.message ?? undefined}>
              Try again
            </button>
          </>
        ) : save.status === "saved" ? (
          <>
            <span className="pf-save__dot" />
            Saved
          </>
        ) : (
          <>
            <span className="pf-save__dot is-busy" />
            Saving…
          </>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Files dropped anywhere on the page.
// ---------------------------------------------------------------------------

const SCHEMA_NAME = /codebook|coding[ _-]?schema|schema/i;

/**
 * Accept a CSV dropped anywhere on the page. Without this, a file dropped
 * beside a drop zone makes the browser open it and the session is lost. A
 * file named like a codebook is read as the coding schema.
 */
function usePageDrop() {
  const setDragActive = useStore((state) => state.setDragActive);
  const requestFile = useStore((state) => state.requestFile);
  const loadSchemaFile = useStore((state) => state.loadSchemaFile);

  useEffect(() => {
    let depth = 0;
    const carriesFiles = (event: DragEvent) => [...(event.dataTransfer?.types ?? [])].includes("Files");
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth += 1;
      setDragActive(true);
    };
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragActive(false);
    };
    const over = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragActive(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length === 0) return;
      if (SCHEMA_NAME.test(files[0].name)) void loadSchemaFile(files[0]);
      else requestFile(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, [setDragActive, requestFile, loadSchemaFile]);
}

/** A new source clears results; say so before it happens. */
function ReplaceConfirm() {
  const pendingFile = useStore((state) => state.pendingFile);
  const pendingSample = useStore((state) => state.pendingSample);
  const current = useStore((state) => state.source?.fileName);
  const confirm = useStore((state) => state.confirmPendingFile);
  const cancel = useStore((state) => state.cancelPendingFile);
  if (!pendingFile && !pendingSample) return null;
  const incoming = pendingFile?.name ?? SAMPLES.find((sample) => sample.id === pendingSample)?.name ?? "the new file";

  return (
    <Modal
      title="Replace this dataset?"
      onClose={cancel}
      actions={
        <>
          <button type="button" className="ml-btn ml-btn--secondary" onClick={cancel}>
            Keep {current}
          </button>
          <button type="button" className="ml-btn ml-btn--primary" onClick={confirm}>
            Read {incoming}
          </button>
        </>
      }
    >
      Reading {incoming} replaces {current} in this analysis and clears its results. The settings are kept if the new
      file has the same columns. To keep these results, duplicate the analysis from the Analyses page first.
    </Modal>
  );
}

/** On a narrow screen the canvas becomes a bottom sheet with a persistent handle (plan §5.4). */
export function CanvasSheet() {
  const [open, setOpen] = useState(false);
  const parsing = useStore((state) => state.parsing.status === "parsing");
  const runStatus = useStore((state) => state.run.status);
  const result = useStore((state) => state.result);
  const source = useStore((state) => state.source);
  const step = useStore((state) => state.step);

  // A finished run is the consequence the researcher is waiting for: show it.
  useEffect(() => {
    if (runStatus === "succeeded" || runStatus === "failed" || runStatus === "running") setOpen(true);
  }, [runStatus]);

  // What the sheet holds, said plainly, and the one action on it.
  let kicker = "Data";
  let label = source ? describeSource(source) : "";
  let noun = "data";
  if (parsing) [kicker, label, noun] = ["Reading", "Reading the file", "progress"];
  else if (runStatus === "running") [kicker, label, noun] = ["Running", "Running the analysis", "progress"];
  else if (runStatus === "failed" && step === 4) [kicker, label, noun] = ["Did not run", "The analysis did not run", "details"];
  else if (result && step === 5) {
    const { group_a_label: a, group_b_label: b } = result.summary.groups;
    [kicker, label, noun] = ["Results", `${a} and ${b}`, "results"];
  } else if (step === 2) [kicker, noun] = ["Preview", "preview"];

  return (
    <Canvas
      open={open}
      idle={!source && !parsing}
      handle={
        <div className="pf-sheet-handle">
          <span className="pf-sheet-handle__text">
            <span className="metadata pf-ink-secondary">{kicker}</span>
            <span className="label">{label}</span>
          </span>
          <button
            type="button"
            className={`ml-btn ${open ? "ml-btn--secondary" : "ml-btn--primary"}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? `Hide ${noun}` : `Show ${noun}`}
            <ArrowIcon size={18} className={open ? "pf-icon--down" : "pf-icon--up"} />
          </button>
        </div>
      }
    />
  );
}
