// The Interpretation panel: docked to the right of the results, so the figure
// or table it explains stays in view beside it. The Interpretation button opens
// it on its home: what to ask about (the connections that differ most, the
// figures) and the researcher's own conversations. Picking one, or an Ask button
// in the results, opens that conversation: the evidence gathered for it, the
// saved talk, quick questions and a box to ask your own; "‹ All" goes back home.
// Opening sends nothing. Its left edge drags to make it wider; × or Esc closes
// it. On a phone it is a sheet at the bottom.

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { ConnectionThread, InterpretStatus, ThreadMessage } from "../../../shared/api";
import { ApiError } from "../../api/client";
import {
  aiStatus,
  askConnection,
  DOCK_MAX,
  DOCK_MIN,
  EXAMPLE_AUTHOR,
  exampleAnswer,
  figureTitle,
  QUICK_QUESTIONS,
  turnsFor,
  UNABLE,
  useConnection,
  useDockWidth,
} from "../../interpret/connection";
import {
  contextText,
  edgeTarget,
  gatherEvidence,
  splitReferences,
  targetKey,
  targetLabel,
  type Evidence,
  type EvidenceLine,
} from "../../interpret/evidence";
import { edgeCodes } from "../../results/format";
import { findTextColumn } from "../../interpret/excerpts";
import { figureContext } from "../../results/exports";
import { useResultsTab } from "../results/tabs";
import { FIGURES } from "../../results/figures";
import { useStore } from "../../state/store";
import { useTour } from "../../tutorial/state";
import { ArrowIcon, ChatIcon, CheckIcon, CloseIcon, Logo, SendIcon } from "../../ui/marks";
import { FlagNote } from "../../ui/primitives";

const STAGES = ["Analysing connection", "Reviewing relevant evidence", "Comparing patterns", "Forming interpretation", "Preparing analysis"];
const CUT_SHORT = "The answer reached its length limit, so its end may be cut short.";

/** True while the panel is docked beside the results (it belongs to step 05). */
export function useDocked(): boolean {
  const open = useConnection((state) => state.open);
  const showing = useStore((state) => state.result !== null && state.step === 5);
  return open && showing;
}

const WIDE = "(min-width: 900px)";

/** True on a screen wide enough for the panel to sit beside the results (a phone gets a sheet). */
function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const onChange = () => setWide(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return wide;
}

/** True while the panel takes a column of its own beside the results, and the rail folds to a strip. */
export function useDockedBeside(): boolean {
  const docked = useDocked();
  const wide = useWide();
  return docked && wide;
}

/** An answer, with its [E#] references as chips that open the line they cite. */
function Answer({ text, ids, onRef }: { text: string; ids: Set<string>; onRef: (id: string) => void }) {
  return (
    <>
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index} className="small">
          {splitReferences(paragraph, ids).map((segment, part) =>
            "ref" in segment ? (
              <button key={part} type="button" className="pf-cw__ref" onClick={() => onRef(segment.ref)} data-tour="interpret-ref" title="Show this line of data">
                {segment.ref}
              </button>
            ) : (
              <span key={part}>{segment.text}</span>
            ),
          )}
        </p>
      ))}
    </>
  );
}

/** Copy an answer, add it to (or take it out of) the analysis's notes, and, on the last one, ask again. */
export function AnswerActions({ text, noted, onNote, onRegenerate }: { text: string; noted: boolean; onNote?: () => void; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pf-cw__actions">
      <button
        type="button"
        className="ml-btn ml-btn--ghost pf-cw__action"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      {onNote && (
        <button type="button" className="ml-btn ml-btn--ghost pf-cw__action" aria-pressed={noted} onClick={onNote}>
          {noted ? (
            <>
              <CheckIcon size={14} />
              In your notes
            </>
          ) : (
            "Add to notes"
          )}
        </button>
      )}
      {onRegenerate && (
        <button type="button" className="ml-btn ml-btn--ghost pf-cw__action" onClick={onRegenerate}>
          Regenerate
        </button>
      )}
    </div>
  );
}

/** Mark one answer of a saved conversation as a note, or unmark it. */
export function toggleNote(thread: ConnectionThread, index: number) {
  const messages = thread.messages.map((message, at) => (at === index ? { ...message, noted: !message.noted } : message));
  useStore.getState().saveThread({ ...thread, messages, updatedAt: new Date().toISOString() });
}

function EvidenceCard({ line, open, onToggle }: { line: EvidenceLine; open: boolean; onToggle: () => void }) {
  return (
    <li className={`pf-cw__line${open ? " is-open" : ""}${line.kind === "counter" ? " is-counter" : ""}`} id={`cw-${line.id}`}>
      <button type="button" className="pf-cw__line-head" aria-expanded={open} onClick={onToggle}>
        <span className="metadata">{line.id}</span>
        <span className="small pf-cw__line-text">“{line.text}”</span>
      </button>
      {open && (
        <div className="pf-cw__source small">
          <p className="pf-note">
            {line.kind === "counter" ? "Counter-evidence: one code without the other. " : ""}
            {line.group} / {line.unit.startsWith(`${line.group}::`) ? line.unit.slice(line.group.length + 2) : line.unit.replace("::", " / ")} /{" "}
            {line.conversation} / row {line.row}
          </p>
          {line.context.length > 1 && <p className="metadata pf-ink-secondary">The stanza window it was read in</p>}
          <ol className="pf-cw__context">
            {line.context.map((entry) => (
              <li key={entry.row} className={entry.row === line.row ? "is-line" : undefined}>
                <span className="metadata">Row {entry.row}</span>
                <span>{entry.text || "(no text)"}</span>
                <span className="pf-note">{entry.codes.join(", ") || "no codes"}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </li>
  );
}

/** One list of evidence lines, folded until asked for. */
function EvidenceList({
  title,
  lines,
  open,
  onToggle,
  openRef,
  setOpenRef,
  empty,
}: {
  title: string;
  lines: EvidenceLine[];
  open: boolean;
  onToggle: () => void;
  openRef: string | null;
  setOpenRef: (id: string | null) => void;
  empty: string;
}) {
  return (
    <section className="pf-cw__evidence">
      <button type="button" className="pf-cw__toggle label" aria-expanded={open} onClick={onToggle}>
        {title} ({lines.length})
      </button>
      {open &&
        (lines.length === 0 ? (
          <p className="small pf-note">{empty}</p>
        ) : (
          <ol className="pf-cw__lines">
            {lines.map((line) => (
              <EvidenceCard key={line.id} line={line} open={openRef === line.id} onToggle={() => setOpenRef(openRef === line.id ? null : line.id)} />
            ))}
          </ol>
        ))}
    </section>
  );
}

/**
 * The message box, as in any AI chat: it grows with the question, Enter sends,
 * Shift+Enter starts a new line, and the round button sends.
 */
function Composer({
  value,
  onChange,
  onSend,
  placeholder,
  label,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  placeholder: string;
  label: string;
  disabled: boolean;
}) {
  const id = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  // Grow with the text, up to about five lines.
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 132)}px`;
  }, [value]);
  return (
    <form
      className={`pf-composer${disabled ? " is-disabled" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && value.trim()) onSend();
      }}
    >
      <label className="pf-visually-hidden" htmlFor={id}>
        {label}
      </label>
      <textarea
        ref={box}
        id={id}
        className="pf-composer__input"
        rows={1}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            if (!disabled && value.trim()) onSend();
          }
        }}
      />
      <button type="submit" className="pf-composer__send" aria-label="Send" disabled={disabled || !value.trim()}>
        <SendIcon size={18} />
      </button>
    </form>
  );
}

/** An answer's byline: the IdeaLens mark, as an AI chat shows who is speaking. */
function Byline({ example }: { example: boolean }) {
  return (
    <div className="pf-cw__byline">
      <span className="pf-cw__avatar" aria-hidden="true">
        <Logo size={24} />
      </span>
      <span className="label">IdeaLens</span>
      <span className="small pf-note">{example ? "example answer" : "interpretation"}</span>
    </div>
  );
}

function Thread() {
  const target = useConnection((state) => state.active)!;
  const switchedFrom = useConnection((state) => state.switchedFrom);
  const close = useConnection((state) => state.close);
  const home = useConnection((state) => state.home);
  const result = useStore((state) => state.result);
  const source = useStore((state) => state.source);
  const schema = useStore((state) => state.schema);
  const focusUnits = useStore((state) => state.focusUnits);
  const threads = useStore((state) => state.threads);
  const saveThread = useStore((state) => state.saveThread);
  const projectId = useStore((state) => state.project?.id ?? null);
  const tourProject = useTour((state) => (state.phase === "running" ? state.projectId : null));
  const tutorial = tourProject !== null && tourProject === projectId;
  const [ai, setAi] = useState<InterpretStatus>({ available: false, model: null });
  const aiReadyNow = ai.available || tutorial;
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState<{ first: boolean; text: string } | null>(null);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState<{ message: string; turns: ReturnType<typeof turnsFor> } | null>(null);
  const [openRef, setOpenRef] = useState<string | null>(null);
  const [shown, setShown] = useState<{ support: boolean; counter: boolean }>({ support: false, counter: false });
  const body = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const titleId = useId();

  useEffect(() => {
    void aiStatus().then(setAi);
  }, []);

  const key = targetKey(target);
  const resultAt = result?.finishedAt.toISOString() ?? "";
  const thread = threads.find((entry) => entry.key === key) ?? null;
  const messages = thread?.messages ?? [];

  const evidence: Evidence | null = useMemo(() => {
    if (!result || !source) return null;
    const textColumn = findTextColumn(source.table.profiles, result.model);
    return gatherEvidence({ target, rows: source.table.rows, model: result.model, summary: result.summary, textColumn });
  }, [key, result, source]);
  const ids = useMemo(() => new Set(evidence?.excerpts.map((line) => line.id) ?? []), [evidence]);
  const supporting = evidence?.excerpts.filter((line) => line.kind !== "counter") ?? [];
  const counter = evidence?.excerpts.filter((line) => line.kind === "counter") ?? [];
  const meaning = (code: string) => schema?.entries.find((entry) => entry.code === code)?.meaning ?? code;

  // Another figure or edge: its own thread, no evidence carried over, nothing left running.
  useEffect(() => {
    abort.current?.abort();
    setBusy(null);
    setError(null);
    setOpenRef(null);
    setQuestion("");
    body.current?.scrollTo({ top: 0 });
  }, [key]);
  useEffect(() => () => abort.current?.abort(), []);

  // A question typed on the panel's home is asked as soon as its evidence is ready.
  useEffect(() => {
    if (!evidence || !aiReadyNow) return;
    const waiting = useConnection.getState().takeQuestion();
    if (waiting) void ask(waiting);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evidence, aiReadyNow]);

  // The first answer names what is happening until real text arrives; nothing is invented.
  useEffect(() => {
    if (!busy || busy.text || !busy.first) return;
    setStage(0);
    const timer = setInterval(() => setStage((value) => Math.min(value + 1, STAGES.length - 1)), 1500);
    return () => clearInterval(timer);
  }, [busy?.first, busy !== null && busy.text === ""]);

  /** A new question goes to the top of the panel, so its answer is read from its first line. */
  const showLatestQuestion = () =>
    requestAnimationFrame(() => {
      const questions = body.current?.querySelectorAll(".pf-cw__question");
      const last = questions?.[questions.length - 1] as HTMLElement | undefined;
      if (last && body.current) body.current.scrollTo({ top: last.offsetTop - body.current.offsetTop - 8, behavior: "smooth" });
    });

  const store = (next: ThreadMessage[], at = resultAt) => {
    const saved: ConnectionThread = { key, target, resultAt: at, messages: next, updatedAt: new Date().toISOString() };
    saveThread(saved);
  };

  const ask = async (text: string, base: ThreadMessage[] = messages) => {
    const clean = text.trim();
    if (!clean || !evidence || !result || busy) return;
    const asked: ThreadMessage = { role: "user", text: clean, createdAt: new Date().toISOString() };
    const withQuestion = [...base.filter((message, index) => !(index === base.length - 1 && message.role === "user")), asked];
    store(withQuestion);
    setQuestion("");
    setError(null);
    showLatestQuestion();

    // The tutorial answers from the evidence itself and never calls the AI.
    if (tutorial) {
      store([...withQuestion, { role: "assistant", text: exampleAnswer(evidence, meaning), createdAt: new Date().toISOString(), author: EXAMPLE_AUTHOR }]);
      return;
    }

    const turns = turnsFor(base, clean);
    const figureCaption =
      target.kind === "figure" ? FIGURES.find((spec) => spec.id === target.figureId)?.caption(figureContext(result, focusUnits)) : undefined;
    const request = {
      label: targetLabel(target),
      context: contextText(evidence, { fileName: result.fileName, model: result.model, summary: result.summary, schema, figureCaption }),
      turns,
    };
    const controller = new AbortController();
    abort.current = controller;
    const first = !base.some((message) => message.role === "assistant");
    setBusy({ first, text: "" });
    let written = "";
    try {
      const done = await askConnection(
        request,
        (piece) => {
          written += piece;
          setBusy({ first, text: written });
        },
        controller.signal,
      );
      store([...withQuestion, { role: "assistant", text: written.trim(), createdAt: new Date().toISOString(), author: done.model }]);
      if (done.truncated) setError({ message: CUT_SHORT, turns });
    } catch (caught) {
      if ((caught as Error).name === "AbortError") return;
      setError({ message: caught instanceof ApiError && caught.status === 503 ? caught.message : UNABLE, turns });
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(null);
      }
    }
  };

  const regenerate = () => {
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    if (!lastUser) return;
    const index = messages.lastIndexOf(lastUser);
    void ask(lastUser.text, messages.slice(0, index));
  };

  const showRef = (id: string) => {
    const line = evidence?.excerpts.find((entry) => entry.id === id);
    setShown((value) => (line?.kind === "counter" ? { ...value, counter: true } : { ...value, support: true }));
    setOpenRef(id);
    requestAnimationFrame(() => document.getElementById(`cw-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  const earlier = thread !== null && thread.resultAt !== resultAt;
  const aiReady = ai.available || tutorial;
  const lastAnswer = [...messages].reverse().find((message) => message.role === "assistant");
  const edge = target.kind === "edge" ? evidence?.edges[0] : undefined;
  const [a, b] = evidence?.groups ?? ["", ""];

  return (
    <>
      <div className="pf-cw__head">
        <div className="pf-cw__title">
          <button type="button" className="pf-cw__back small" onClick={home} data-tour="interpret-back">
            <ArrowIcon size={14} className="pf-icon--back" />
            All
          </button>
          <h2 className="pf-cw__heading" id={titleId}>
            {targetLabel(target)}
          </h2>
          <p className="small pf-note">
            {edge && (
              <span className="pf-cw__weights">
                {a} {edge.weightA.toFixed(2)} / {b} {edge.weightB.toFixed(2)} ·{" "}
              </span>
            )}
            {evidence
              ? target.kind === "edge"
                ? `${evidence.supporting} line${evidence.supporting === 1 ? "" : "s"} bring${evidence.supporting === 1 ? "s" : ""} these ideas together`
                : `${evidence.supporting} line${evidence.supporting === 1 ? "" : "s"} support${evidence.supporting === 1 ? "s" : ""} its connections`
              : "No data open"}
            {earlier ? " / from an earlier run" : ""}
          </p>
        </div>
        <button type="button" className="ml-btn ml-btn--ghost pf-cw__close" aria-label="Close the connection analysis" onClick={close} data-tour="interpret-close">
          <CloseIcon size={18} />
        </button>
      </div>

      <div className="pf-cw__body" ref={body}>
        {switchedFrom && (
          <p className="pf-cw__switched small" role="status">
            Now analysing {targetLabel(target)}
          </p>
        )}

        {evidence && (
          <div className="pf-cw__evidence-group">
            <EvidenceList
              title="Evidence"
              lines={supporting}
              open={shown.support}
              onToggle={() => setShown({ ...shown, support: !shown.support })}
              openRef={openRef}
              setOpenRef={setOpenRef}
              empty={evidence.textColumn ? "No line carries both codes within the stanza window." : "This dataset has no text column, so there are no lines to show."}
            />
            <EvidenceList
              title="Counter-evidence"
              lines={counter}
              open={shown.counter}
              onToggle={() => setShown({ ...shown, counter: !shown.counter })}
              openRef={openRef}
              setOpenRef={setOpenRef}
              empty="No line from the weaker group raises one of these ideas without the other."
            />
          </div>
        )}

        <div className="pf-cw__talk" aria-live="polite">
          {messages.length === 0 && !busy && aiReady && (
            <div className="pf-cw__start">
              <p className="small pf-note pf-cw__empty">
                Start with a question. Only the evidence above goes with it, never the whole dataset.
              </p>
              <div className="pf-starters" data-tour="interpret-quick">
                {QUICK_QUESTIONS.map((text) => (
                  <button key={text} type="button" className="pf-starter" disabled={busy !== null || !evidence} onClick={() => void ask(text)}>
                    {text}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((message, index) =>
            message.role === "user" ? (
              <p key={index} className="pf-cw__question small">
                {message.text}
              </p>
            ) : (
              <div key={index} className="pf-cw__answer">
                <Byline example={message.author === EXAMPLE_AUTHOR} />
                <Answer text={message.text} ids={ids} onRef={showRef} />
                <AnswerActions
                  text={message.text}
                  noted={Boolean(message.noted)}
                  onNote={thread ? () => toggleNote(thread, index) : undefined}
                  onRegenerate={message === lastAnswer && !busy && aiReady && !tutorial ? regenerate : undefined}
                />
              </div>
            ),
          )}
          {busy && (
            <div className="pf-cw__answer">
              <Byline example={tutorial} />
              {busy.text ? (
                <Answer text={busy.text} ids={ids} onRef={showRef} />
              ) : (
                <p className="small pf-note pf-cw__stage">{busy.first ? `${STAGES[stage]}…` : "Analysing your question…"}</p>
              )}
            </div>
          )}
          {error && (
            <div className="pf-stack">
              <FlagNote>{error.message}</FlagNote>
              {error.message !== CUT_SHORT && (
                <button
                  type="button"
                  className="ml-btn ml-btn--secondary"
                  onClick={() => void ask(error.turns[error.turns.length - 1].text, messages.slice(0, -1))}
                >
                  Try again
                </button>
              )}
            </div>
          )}
          {!aiReady && (
            <p className="small pf-note">
              Questions to the AI are not available on this server yet. The evidence above is gathered from your data and
              is yours to read either way.
            </p>
          )}
        </div>
      </div>

      <div className="pf-cw__foot">
        {messages.length > 0 && (
          <div className="pf-cw__quick is-compact" data-tour="interpret-quick">
            {QUICK_QUESTIONS.map((text) => (
              <button key={text} type="button" className="ml-filter pf-cw__chip" disabled={!aiReady || busy !== null || !evidence} onClick={() => void ask(text)}>
                {text}
              </button>
            ))}
          </div>
        )}
        <Composer
          value={question}
          onChange={setQuestion}
          onSend={() => void ask(question)}
          placeholder={`Ask about ${targetLabel(target)}…`}
          label={`Ask about ${targetLabel(target)}`}
          disabled={!aiReady || busy !== null || !evidence}
        />
      </div>
    </>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The last thing said in a conversation, for its line in the chat list. */
function preview(thread: ConnectionThread): string {
  const last = [...thread.messages].reverse().find((message) => message.role === "assistant") ?? thread.messages[thread.messages.length - 1];
  return last ? last.text.replace(/^(Evidence|Inference|Speculation):\s*/, "").replace(/\s+/g, " ") : "";
}

/**
 * The panel's home, laid out like an AI chat's start page: the researcher's own
 * chats as a chat list (speech bubble, title, last answer, time), the things
 * worth asking about as tinted suggestion cards, and a box to just ask.
 */
function Home() {
  const result = useStore((state) => state.result)!;
  const schema = useStore((state) => state.schema);
  const threads = useStore((state) => state.threads);
  const projectId = useStore((state) => state.project?.id ?? null);
  const tourProject = useTour((state) => (state.phase === "running" ? state.projectId : null));
  const request = useConnection((state) => state.request);
  const close = useConnection((state) => state.close);
  const [allEdges, setAllEdges] = useState(false);
  const [question, setQuestion] = useState("");
  const [ai, setAi] = useState<InterpretStatus>({ available: false, model: null });
  const titleId = useId();
  const { group_a_label: a, group_b_label: b } = result.summary.groups;
  const meaning = (code: string) => schema?.entries.find((entry) => entry.code === code)?.meaning ?? null;
  const resultAt = result.finishedAt.toISOString();
  const tutorial = tourProject !== null && tourProject === projectId;

  useEffect(() => {
    void aiStatus().then(setAi);
  }, []);

  // Connections by how much they differ between the groups (pyENA's subtracted weights).
  const edges = [...result.summary.networks.subtracted_mean_network]
    .map((row) => ({ codes: edgeCodes(row.edge), weight: row.weight }))
    .filter((row) => row.codes[1] !== "")
    .sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight));
  const shown = allEdges ? edges : edges.slice(0, 4);
  const figures = (["subtracted_mean_network", "a_mean_network", "b_mean_network"] as const).map((id) => ({
    id,
    title: figureTitle(id, a, b),
  }));
  const main = figures[0];
  const sorted = [...threads].filter((thread) => thread.messages.length > 0).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  const noteCount = threads.reduce((sum, thread) => sum + thread.messages.filter((message) => message.noted).length, 0);

  const history = (
    <section aria-labelledby={`${titleId}-history`} data-tour="interpret-history">
      <h3 className="metadata pf-ink-secondary pf-cw__group" id={`${titleId}-history`}>
        <span className="pf-key pf-key--yours" aria-hidden="true" />
        Your conversations ({sorted.length})
      </h3>
      {sorted.length === 0 ? (
        <p className="small pf-note">Every question you ask is kept here with the analysis, to come back to.</p>
      ) : (
        <ul className="pf-chatlist">
          {sorted.map((thread) => (
            <li key={thread.key}>
              <button type="button" className="pf-chatlist__row pf-pick__row" onClick={() => request(thread.target)}>
                <span className="pf-chatlist__icon" aria-hidden="true">
                  <ChatIcon size={18} />
                </span>
                <span className="pf-chatlist__text">
                  <span className="pf-chatlist__top">
                    <span className="label">{targetLabel(thread.target)}</span>
                    <span className="small pf-note pf-chatlist__time">{when(thread.updatedAt)}</span>
                  </span>
                  <span className="small pf-chatlist__preview">{preview(thread)}</span>
                  {thread.resultAt !== resultAt && <span className="small pf-note">From an earlier run</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {noteCount > 0 && (
        <button type="button" className="ml-btn ml-btn--ghost pf-cw__action pf-cw__notes-link" onClick={() => useResultsTab.getState().setActive("report")}>
          {noteCount} {noteCount === 1 ? "answer" : "answers"} in your notes: open the Report
        </button>
      )}
    </section>
  );

  return (
    <>
      <div className="pf-cw__head">
        <div className="pf-cw__title">
          <p className="metadata pf-ink-secondary">Interpretation</p>
          <h2 className="pf-cw__heading" id={titleId}>
            Ask about these results
          </h2>
          <p className="small pf-note">Pick a suggestion, carry on a conversation, or just ask. Nothing is sent to the AI until you do.</p>
        </div>
        <button type="button" className="ml-btn ml-btn--ghost pf-cw__close" aria-label="Close the interpretation" onClick={close} data-tour="interpret-close">
          <CloseIcon size={18} />
        </button>
      </div>
      <div className="pf-cw__body pf-cw__home" data-tour="interpret-home">
        {/* A returning researcher's own conversations come first; a new analysis starts with what to ask about. */}
        {sorted.length > 0 && history}

        <section aria-labelledby={`${titleId}-suggest`}>
          <h3 className="metadata pf-ink-secondary pf-cw__group" id={`${titleId}-suggest`}>
            <span className="pf-key pf-key--suggested" aria-hidden="true" />
            Suggested: the biggest differences
          </h3>
          <ul className="pf-suggest" data-tour="interpret-picks">
            {shown.map(({ codes, weight }) => {
              const stronger = weight >= 0 ? a : b;
              const [x, y] = codes;
              const named = meaning(x) && meaning(y) ? `${meaning(x)} and ${meaning(y)}` : null;
              return (
                <li key={codes.join()}>
                  <button type="button" className="pf-suggest__card pf-pick__row" onClick={() => request(edgeTarget(x, y))} data-tour="interpret-pick">
                    <span className="pf-pick__text">
                      <span className="label">
                        {x} ↔ {y}
                      </span>
                      {named && <span className="small pf-suggest__meaning">{named}</span>}
                      <span className="small pf-suggest__tag">
                        Stronger in {stronger}, by {Math.abs(weight).toFixed(2)}
                      </span>
                    </span>
                    <ArrowIcon size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
          {edges.length > 4 && (
            <button type="button" className="ml-btn ml-btn--ghost pf-cw__action" aria-expanded={allEdges} onClick={() => setAllEdges(!allEdges)}>
              {allEdges ? "Show the biggest only" : `All ${edges.length} connections`}
            </button>
          )}
        </section>

        <section aria-labelledby={`${titleId}-figures`}>
          <h3 className="metadata pf-ink-secondary pf-cw__group" id={`${titleId}-figures`}>
            <span className="pf-key pf-key--suggested" aria-hidden="true" />
            Suggested: the figures
          </h3>
          <ul className="pf-suggest">
            {figures.map((figure) => (
              <li key={figure.id}>
                <button type="button" className="pf-suggest__card pf-pick__row" onClick={() => request({ kind: "figure", figureId: figure.id, title: figure.title })}>
                  <span className="pf-pick__text">
                    <span className="label">{figure.title}</span>
                    <span className="small pf-suggest__meaning">Read through its strongest connections</span>
                  </span>
                  <ArrowIcon size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {sorted.length === 0 && history}
      </div>
      <div className="pf-cw__foot">
        <Composer
          value={question}
          onChange={setQuestion}
          onSend={() => {
            request({ kind: "figure", figureId: main.id, title: main.title }, question);
            setQuestion("");
          }}
          placeholder="Ask anything about these results…"
          label={`Ask about the ${main.title.toLowerCase()}`}
          disabled={!(ai.available || tutorial)}
        />
        <p className="small pf-note pf-composer__about">Asked about the {main.title.toLowerCase()}, the figure that compares the groups.</p>
      </div>
    </>
  );
}

/** The panel's shell: docked, resizable from its left edge, closed with × or Esc. */
function Panel() {
  const active = useConnection((state) => state.active);
  const close = useConnection((state) => state.close);
  const width = useDockWidth((state) => state.width);
  const setWidth = useDockWidth((state) => state.setWidth);
  const resize = useRef<{ x: number; width: number } | null>(null);

  // Esc closes the panel (a modal, when one is open, takes Esc first).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".pf-modal-layer")) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  // The left edge widens or narrows the panel; the results take the rest.
  const onResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    resize.current = { x: event.clientX, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onResizeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!resize.current) return;
    setWidth(resize.current.width + (resize.current.x - event.clientX));
  };

  return (
    <aside className="pf-cw" role="complementary" aria-label="Interpretation" data-tour="interpret-window" style={{ ["--dock-w" as string]: `${width}px` }}>
      <div
        className="pf-cw__resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the interpretation panel"
        aria-valuemin={DOCK_MIN}
        aria-valuemax={DOCK_MAX}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={() => (resize.current = null)}
        onPointerCancel={() => (resize.current = null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") setWidth(width + 24);
          else if (event.key === "ArrowRight") setWidth(width - 24);
          else return;
          event.preventDefault();
        }}
        data-tour="interpret-resize"
      />
      {active ? <Thread key={targetKey(active)} /> : <Home />}
    </aside>
  );
}

/** The panel, docked beside the results while it is open on step 05. */
export function ConnectionDock() {
  const docked = useDocked();
  return docked ? <Panel /> : null;
}

/**
 * The Interpretation button above the results: the front door to the panel,
 * with how many conversations the analysis already holds.
 */
export function InterpretationButton() {
  const open = useConnection((state) => state.open);
  const openHome = useConnection((state) => state.openHome);
  const close = useConnection((state) => state.close);
  const count = useStore((state) => state.threads.filter((thread) => thread.messages.length > 0).length);
  return (
    <button
      type="button"
      className={`ml-btn ${open ? "ml-btn--secondary" : "ml-btn--primary"} pf-interpret-button`}
      aria-expanded={open}
      onClick={() => (open ? close() : openHome())}
      data-tour="interpret-button"
    >
      Interpretation
      {count > 0 && <span className="pf-interpret-button__count">{count}</span>}
    </button>
  );
}
