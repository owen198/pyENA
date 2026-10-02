import { useId, useRef, useState, type ReactNode } from "react";
import { PYODIDE_VERSION } from "../../engine/client";
import { PYENA_COMMIT } from "../../engine/version";
import { REPOSITORY_SAMPLES } from "../../data/samples";
import { matchSchema } from "../../data/schema";
import { ACCEPT } from "../../data/load";
import { pythonEquivalent } from "../../model/config";
import { useIsStale, useIssues } from "../../state/issues";
import { sourceMeta, useStore, type Step } from "../../state/store";
import { pad, STEPS, useStepDone, useStepLock } from "../../steps";
import { ArrowIcon, CheckIcon, ConnectionMark } from "../../ui/marks";
import { DropZone, useFilePicker } from "../DropZone";
import { FlagNote, Modal, Tip, Toggle } from "../../ui/primitives";
import { ConfigPanel, windowSentence } from "./ConfigPanel";
import { AnalysisPanel } from "./AnalysisPanel";
import { useDockedBeside } from "../interpret/ConnectionWindow";

export function Rail() {
  const docked = useDockedBeside();
  if (docked) return <RailStrip />;
  return (
    <aside className="pf-rail" aria-label="Analysis steps">
      <div className="pf-rail__sections">
        <StepSection step={1}>
          <SourceBody />
        </StepSection>
        <StepSection step={2}>
          <PreviewBody />
        </StepSection>
        <StepSection step={3}>
          <ConfigPanel />
          <Continue to={4} label="Continue to run analysis" />
        </StepSection>
        <StepSection step={4}>
          <RunPanel />
        </StepSection>
        <StepSection step={5}>
          <AnalysisPanel />
        </StepSection>
      </div>
    </aside>
  );
}

/**
 * The rail while the connection panel is docked: the steps by number only, so
 * the results and the panel share the width. A step opens as before; leaving
 * the results puts the panel away until they are shown again.
 */
function RailStrip() {
  const current = useStore((state) => state.step);
  const setStep = useStore((state) => state.setStep);
  const lock = useStepLock();
  const isDone = useStepDone();
  return (
    <nav className="pf-rail pf-rail--strip" aria-label="Analysis steps">
      <ol className="pf-strip">
        {STEPS.map(({ step, name }) => {
          const reason = lock(step);
          const active = step === current;
          return (
            <li key={step}>
              <button
                type="button"
                className={`pf-strip__step${active ? " is-current" : ""}`}
                aria-current={active ? "step" : undefined}
                disabled={reason !== null}
                title={reason ?? `${pad(step)} ${name}`}
                aria-label={`${pad(step)} ${name}${isDone(step) ? ", complete" : ""}${active ? ", current step" : ""}`}
                onClick={() => setStep(step)}
              >
                <span className="metadata">{pad(step)}</span>
                {isDone(step) && !active && <CheckIcon size={14} />}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Continue({ to, label }: { to: Step; label: string }) {
  const setStep = useStore((state) => state.setStep);
  return (
    <button type="button" className="ml-btn ml-btn--primary pf-btn--block" onClick={() => setStep(to)}>
      {label}
      <ArrowIcon size={18} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Index sections (plan §5.3): all four visible, the active one open.
// ---------------------------------------------------------------------------

function StepSection({ step, children }: { step: Step; children: ReactNode }) {
  const active = useStore((state) => state.step === step);
  const setStep = useStore((state) => state.setStep);
  const reason = useStepLock()(step);
  const done = useStepDone()(step);
  const { name } = STEPS.find((entry) => entry.step === step)!;
  const headId = useId();
  const bodyId = useId();

  const head = (
    <button
      type="button"
      className="pf-step__head"
      id={headId}
      aria-expanded={active}
      aria-controls={bodyId}
      aria-current={active ? "step" : undefined}
      disabled={reason !== null}
      onClick={() => setStep(step)}
    >
      <span className="pf-step__title">
        <span className="metadata pf-step__num">{pad(step)}</span>
        <span className="pf-step__name">{name}</span>
      </span>
      <span className="pf-step__state">
        {done && !active && (
          <>
            <CheckIcon size={18} />
            <span className="pf-visually-hidden">complete</span>
          </>
        )}
        {active && (
          <>
            <span className="pf-step__current" />
            <span className="pf-visually-hidden">current step</span>
          </>
        )}
      </span>
    </button>
  );

  return (
    <section className="pf-step" aria-labelledby={headId}>
      <h2 style={{ margin: 0 }}>{reason ? <Tip text={reason} align="start">{head}</Tip> : head}</h2>
      {active && (
        <div className="pf-step__body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// 01 Source
// ---------------------------------------------------------------------------

function DeleteSource({ render }: { render: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const fileName = useStore((state) => state.source?.fileName);
  const deleteSource = useStore((state) => state.deleteSource);
  return (
    <>
      {render(() => setOpen(true))}
      {open && (
        <Modal
          title="Delete this source?"
          onClose={() => setOpen(false)}
          actions={
            <>
              <button type="button" className="ml-btn ml-btn--secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="ml-btn ml-btn--primary"
                onClick={() => {
                  setOpen(false);
                  deleteSource();
                }}
              >
                Delete source
              </button>
            </>
          }
        >
          Removing {fileName} also clears the configuration and any results from this session.
        </Modal>
      )}
    </>
  );
}

function SourceBody() {
  const source = useStore((state) => state.source);
  const parsing = useStore((state) => state.parsing);
  const dragActive = useStore((state) => state.dragActive);
  const picker = useFilePicker();

  return (
    <>
      {picker.input}
      <ResearchName />
      {parsing.status === "parsing" && <p className="small pf-note">Reading {parsing.fileName}…</p>}
      {parsing.status === "error" && <FlagNote>{parsing.message}</FlagNote>}

      {source ? (
        <div className={`ml-source${dragActive ? " is-drop" : ""}`} data-tour="source">
          <span className="ml-source__id">Source 001</span>
          <div className="ml-source__title">{source.fileName}</div>
          <div className="ml-source__meta">
            {sourceMeta(source).map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          {dragActive ? (
            <p className="label pf-brand-text" style={{ marginTop: "var(--space-3)" }}>
              Drop to replace this source
            </p>
          ) : (
            <div className="ml-source__actions">
              <button type="button" className="ml-source__action" onClick={picker.open}>
                Replace
              </button>
              <DeleteSource
                render={(open) => (
                  <button type="button" className="ml-source__action" onClick={open}>
                    Delete
                  </button>
                )}
              />
            </div>
          )}
        </div>
      ) : (
        <DropZone />
      )}

      {source && <Notices />}
      <SchemaSection />
      {source && <Continue to={2} label="Continue to preview" />}
      <ExampleData />
    </>
  );
}

// ---------------------------------------------------------------------------
// The research: its name, then the data it comes from.
// ---------------------------------------------------------------------------

/** The analysis's name, where the research comes in; the same name as in the bar above. */
function ResearchName() {
  const name = useStore((state) => state.project?.name ?? "");
  const renameProject = useStore((state) => state.renameProject);
  const [draft, setDraft] = useState(name);
  const [last, setLast] = useState(name);
  const id = useId();
  if (name !== last) {
    setLast(name);
    setDraft(name);
  }
  return (
    <div className="ml-field pf-research">
      <label htmlFor={id}>Research name</label>
      <input
        id={id}
        className="ml-input"
        value={draft}
        maxLength={120}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => (draft.trim() ? renameProject(draft) : setDraft(name))}
        onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      />
      <span className="ml-field-hint">The name this analysis has in your history.</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The coding schema: optional, beside the dataset.
// ---------------------------------------------------------------------------

function SchemaSection() {
  const schema = useStore((state) => state.schema);
  const status = useStore((state) => state.schemaStatus);
  const source = useStore((state) => state.source);
  const codes = useStore((state) => state.model.codes);
  const loadSchemaFile = useStore((state) => state.loadSchemaFile);
  const removeSchema = useStore((state) => state.removeSchema);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const choose = () => input.current?.click();
  const match = schema && source ? matchSchema(schema, source.table.columns, codes) : null;

  return (
    <section className="pf-schema" aria-labelledby={titleId}>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadSchemaFile(file);
          event.target.value = "";
        }}
      />
      <h3 className="pf-schema__title" id={titleId}>
        Coding schema <span className="pf-note small">optional</span>
      </h3>
      {schema ? (
        <div className="ml-source">
          <span className="ml-source__id">Coding schema</span>
          <div className="ml-source__title">{schema.fileName}</div>
          <div className="ml-source__meta">
            <span>
              {schema.entries.length} {schema.entries.length === 1 ? "code" : "codes"}
            </span>
            {match && (
              <span>
                {match.entries.length - match.missing} of {match.entries.length} in the data
              </span>
            )}
          </div>
          <div className="ml-source__actions">
            <button type="button" className="ml-source__action" onClick={choose}>
              Replace
            </button>
            <button type="button" className="ml-source__action" onClick={removeSchema}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`pf-drop pf-drop--compact${over ? " is-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            // Stop here, so the page does not read this file as the dataset.
            event.preventDefault();
            event.stopPropagation();
            setOver(false);
            useStore.getState().setDragActive(false);
            const file = event.dataTransfer.files[0];
            if (file) void loadSchemaFile(file);
          }}
        >
          <p className="label" aria-live="polite">
            {over ? "Drop to read the coding schema" : "Drag a coding schema here"}
          </p>
          <button
            type="button"
            className="ml-btn ml-btn--secondary"
            onClick={choose}
            disabled={status.status === "reading"}
          >
            Choose coding schema
          </button>
          <p className="small pf-note">
            A CSV with a column of codes and a column of what each one means. The meanings name codes in the preview,
            the settings and the interpretation; the analysis itself does not change.
          </p>
        </div>
      )}
      {status.status === "reading" && <p className="small pf-note">Reading {status.fileName}…</p>}
      {status.status === "error" && <FlagNote>{status.message}</FlagNote>}
    </section>
  );
}

/** The example datasets, boxed so it is plain they are there to try the platform with. */
function ExampleData() {
  const source = useStore((state) => state.source);
  const parsing = useStore((state) => state.parsing);
  const loadSample = useStore((state) => state.loadSample);
  const result = useStore((state) => state.result);
  const titleId = useId();

  return (
    <section className="ml-card ml-card--soft pf-examples" aria-labelledby={titleId}>
      <h3 className="pf-examples__title" id={titleId}>
        Try it with example data
      </h3>
      <p className="small pf-note">
        Coded datasets from the pyENA repository. Each one comes with the configuration its example script uses.
      </p>
      <ul className="pf-examples__list">
        {REPOSITORY_SAMPLES.map((sample) => {
          const loaded = source?.sampleId === sample.id;
          return (
            <li key={sample.id} className="pf-example">
              <div className="pf-example__text">
                <span className="label">{sample.name}</span>
                <span className="small pf-note">{sample.description}</span>
                <span className="metadata pf-ink-secondary">{sample.facts}</span>
              </div>
              {loaded ? (
                <span className="pf-example__loaded label">
                  <CheckIcon size={16} />
                  Loaded
                </span>
              ) : (
                <button
                  type="button"
                  className="ml-btn ml-btn--secondary pf-example__load"
                  aria-label={`Load the ${sample.name} example`}
                  disabled={parsing.status === "parsing"}
                  onClick={() => {
                    if (result) useStore.setState({ pendingSample: sample.id });
                    else void loadSample(sample.id);
                  }}
                >
                  Load
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 02 Preview
// ---------------------------------------------------------------------------

const DELIMITERS = [
  { value: "auto", label: "Detect automatically" },
  { value: ",", label: "Comma" },
  { value: "\t", label: "Tab" },
  { value: ";", label: "Semicolon" },
] as const;

export function Notices() {
  const notice = useStore((state) => state.notice);
  const offer = useStore((state) => state.offer);
  const applyOffer = useStore((state) => state.applyOffer);
  const dismissOffer = useStore((state) => state.dismissOffer);
  const dismissNotice = useStore((state) => state.dismissNotice);
  return (
    <>
      {notice &&
        (notice.tone === "flag" ? (
          <FlagNote>{notice.text}</FlagNote>
        ) : (
          <div className="pf-row pf-row--tight">
            <p className="small pf-note">{notice.text}</p>
            <button type="button" className="ml-btn ml-btn--ghost small" onClick={dismissNotice}>
              Dismiss
            </button>
          </div>
        ))}
      {offer && (
        <div className="pf-callout">
          <p className="small">{offer.text}</p>
          <div className="pf-row">
            <button type="button" className="ml-btn ml-btn--secondary" onClick={applyOffer}>
              {offer.kind === "preset" ? "Apply this configuration" : "Restore configuration"}
            </button>
            <button type="button" className="ml-btn ml-btn--ghost" onClick={dismissOffer}>
              Not now
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function PreviewBody() {
  const source = useStore((state) => state.source);
  const parsing = useStore((state) => state.parsing);
  const reparse = useStore((state) => state.reparse);
  const schema = useStore((state) => state.schema);
  const picker = useFilePicker();
  const delimiterId = useId();
  if (!source) return null;

  const { profiles, warnings, delimiter } = source.table;
  const binary = profiles.filter((profile) => profile.type === "binary").length;
  const withMissing = profiles.filter((profile) => profile.missingCount > 0).length;
  const detected = DELIMITERS.find((entry) => entry.value === delimiter)?.label.toLowerCase();

  return (
    <>
      {picker.input}
      <Notices />
      <div className="pf-stack">
        <p className="small">
          {binary} of {profiles.length} columns hold only 0/1 values and can be codes.
        </p>
        {withMissing > 0 && (
          <FlagNote>
            {withMissing} {withMissing === 1 ? "column has" : "columns have"} missing values. They are marked in
            the table.
          </FlagNote>
        )}
        {warnings.map((warning) => (
          <FlagNote key={warning}>{warning}</FlagNote>
        ))}
        <p className="small pf-note">
          {schema
            ? `The Coding schema tab beside the table lists the ${schema.entries.length} codes in ${schema.fileName} and whether each is a column of this dataset.`
            : "No coding schema yet. It is optional; add one on Upload data to see what each code means."}
        </p>
      </div>

      <div className="ml-field">
        <label htmlFor={delimiterId}>Delimiter</label>
        <select
          id={delimiterId}
          className="ml-input"
          value={source.options.delimiter}
          disabled={parsing.status === "parsing"}
          onChange={(event) => void reparse({ delimiter: event.target.value as never })}
        >
          {DELIMITERS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.value === "auto" && detected ? `Detect automatically (found ${detected})` : entry.label}
            </option>
          ))}
        </select>
      </div>
      <Toggle
        label="First row is the header"
        checked={source.options.header}
        disabled={parsing.status === "parsing"}
        onChange={(header) => void reparse({ header })}
      />

      <div className="pf-row">
        <button type="button" className="ml-btn ml-btn--secondary" onClick={picker.open}>
          Replace source
        </button>
        <DeleteSource
          render={(open) => (
            <button type="button" className="ml-btn ml-btn--ghost" onClick={open}>
              Delete source
            </button>
          )}
        />
      </div>
      <Continue to={3} label="Continue to variables & settings" />
    </>
  );
}

// ---------------------------------------------------------------------------
// 04 Run analysis: what will run, said in full, then the one action.
// ---------------------------------------------------------------------------

function RunPanel() {
  const source = useStore((state) => state.source);
  const model = useStore((state) => state.model);
  const schema = useStore((state) => state.schema);
  const running = useStore((state) => state.run.status === "running");
  const setStep = useStore((state) => state.setStep);
  if (!source) return null;

  const none = <span className="pf-note">Not chosen</span>;
  const [a, b] = model.groups;
  const match = schema ? matchSchema(schema, source.table.columns, model.codes) : null;
  const described = match ? model.codes.length - match.undescribed.length : 0;
  const rows: [string, ReactNode][] = [
    ["Dataset", `${source.fileName}, ${source.table.rows.length.toLocaleString("en-US")} rows`],
    ["Units", model.units.length ? model.units.join(" + ") : none],
    ["Conversation", model.conversation.length ? model.conversation.join(" + ") : none],
    ["Codes", model.codes.length ? `${model.codes.length}: ${model.codes.join(", ")}` : none],
    [
      "Window",
      model.window === "Conversation"
        ? "The whole conversation"
        : `Moving stanza window. ${windowSentence(model.windowBack, model.windowForward)}`,
    ],
    ["Groups", model.groupColumn && a && b ? `${model.groupColumn}: ${a} and ${b}` : none],
    ["Rotation", model.rotation === "mean" ? "Means rotation" : "SVD"],
    ["Dimensions", model.dimensions === 3 ? "3, with a Z axis and 3D networks" : "2"],
    [
      "Coding schema",
      schema
        ? `${schema.fileName}, describing ${described} of ${model.codes.length} selected codes`
        : "None. Codes are named by their column.",
    ],
  ];

  return (
    <>
      {running && (
        <p className="small">
          Analysing {source.table.rows.length.toLocaleString("en-US")} rows from {source.fileName}. Each stage is
          shown beside the table as it runs.
        </p>
      )}
      <dl className="pf-summary">
        {rows.map(([term, value]) => (
          <div key={term} className="pf-summary__row">
            <dt className="metadata">{term}</dt>
            <dd className="small">{value}</dd>
          </div>
        ))}
      </dl>
      <button type="button" className="ml-btn ml-btn--ghost" onClick={() => setStep(3)} disabled={running}>
        Edit variables & settings
      </button>
      <PythonEquivalent />
      <RunBar />
    </>
  );
}

// ---------------------------------------------------------------------------
// Run bar (plan §9.4, §10.4): disabled only with a visible reason.
// ---------------------------------------------------------------------------

function RunBar() {
  const issues = useIssues();
  const run = useStore((state) => state.run);
  const result = useStore((state) => state.result);
  const engineStatus = useStore((state) => state.engine);
  const runAnalysis = useStore((state) => state.runAnalysis);
  const retryEngine = useStore((state) => state.retryEngine);

  const running = run.status === "running";
  const stale = useIsStale();
  const rerun = stale || run.status === "failed";
  const label = running ? "Running…" : rerun ? "Re-run analysis" : result ? "Run again" : "Run analysis";
  const setStep = useStore((state) => state.setStep);
  const current = result !== null && !rerun && !running;
  const messages = [...new Set(issues.map((issue) => issue.message))];

  return (
    <div className="pf-runbar">
      {messages.length > 0 && (
        <ul className="pf-checklist" aria-label="Required before running">
          {messages.map((message) => (
            <li key={message}>
              <FlagNote>{message}</FlagNote>
            </li>
          ))}
        </ul>
      )}
      {current && (
        <button type="button" className="ml-btn ml-btn--primary pf-btn--block" onClick={() => setStep(5)}>
          View results
          <ArrowIcon size={18} />
        </button>
      )}
      <button
        type="button"
        className={`ml-btn ${current ? "ml-btn--secondary" : "ml-btn--primary"} pf-btn--block`}
        data-tour="run"
        disabled={messages.length > 0 || running || engineStatus.state === "failed"}
        onClick={() => void runAnalysis()}
      >
        {label}
      </button>
      {engineStatus.state === "failed" ? (
        <div className="pf-stack">
          <FlagNote>The analysis engine failed to load. Reload the page to try again.</FlagNote>
          <button type="button" className="ml-btn ml-btn--ghost" onClick={retryEngine}>
            Load the engine again
          </button>
        </div>
      ) : (
        <p className="pf-engine small">
          <ConnectionMark size={24} />
          {engineStatus.state === "ready"
            ? `pyENA ${PYENA_COMMIT.slice(0, 7)} on Pyodide ${PYODIDE_VERSION}, in this browser`
            : {
                runtime: "Loading the analysis engine: Python…",
                packages: "Loading the analysis engine: numpy, scipy, matplotlib…",
                library: "Loading the analysis engine: pyENA…",
              }[engineStatus.phase]}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Python equivalent (plan §9.6): an on-ramp to the library, not a replacement.
// ---------------------------------------------------------------------------

function PythonEquivalent() {
  const source = useStore((state) => state.source);
  const model = useStore((state) => state.model);
  const [copied, setCopied] = useState(false);
  if (!source) return null;
  const code = pythonEquivalent(model, source.fileName, source.table.delimiter, PYENA_COMMIT);

  return (
    <details className="pf-disclosure">
      <summary>
        <ArrowIcon size={16} />
        Show Python equivalent
      </summary>
      <pre className="pf-code">{code}</pre>
      <button
        type="button"
        className="ml-btn ml-btn--ghost"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? "Copied" : "Copy code"}
      </button>
    </details>
  );
}
