// The Report tab: what the researcher keeps from the analysis, read full width.
// Notes first (the answers kept with "Add to notes" in the Interpretation
// panel, with where each came from), then the whole model in words. Asking
// happens in the Interpretation panel; its conversations are listed on the
// panel's home. Notes and conversations go into the ZIP download too.

import { useConnection } from "../../interpret/connection";
import { targetLabel } from "../../interpret/evidence";
import { notesText } from "../../results/exports";
import { useStore } from "../../state/store";
import { DownloadIcon } from "../../ui/marks";
import { download } from "../../ui/primitives";
import { AnswerActions, toggleNote } from "../interpret/ConnectionWindow";
import { InterpretationTab } from "./InterpretationTab";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const paragraphs = (text: string) =>
  text.split(/\n{2,}/).map((paragraph, index) => (
    <p key={index} className="body">
      {paragraph}
    </p>
  ));

/** The answers the researcher added to the analysis's notes, with where each came from. */
function Notes() {
  const threads = useStore((state) => state.threads);
  const projectName = useStore((state) => state.project?.name ?? "analysis");
  const openSaved = useConnection((state) => state.openSaved);
  const notes = threads.flatMap((thread) =>
    thread.messages.flatMap((message, index) => {
      if (message.role !== "assistant" || !message.noted) return [];
      const asked = [...thread.messages.slice(0, index)].reverse().find((entry) => entry.role === "user");
      return [{ thread, index, message, asked: asked?.text ?? "" }];
    }),
  );
  return (
    <section className="pf-section" aria-labelledby="interpret-notes">
      <div className="pf-section__head">
        <h3 className="pf-section__title pf-cw__group" id="interpret-notes">
          <span className="pf-key pf-key--yours" aria-hidden="true" />
          Your notes
        </h3>
        <span className="metadata pf-ink-secondary">{notes.length} kept</span>
      </div>
      {notes.length === 0 ? (
        <p className="small pf-note">
          Ask in <b>Interpretation</b>, above the results, and press <b>Add to notes</b> under an answer to keep it here.
          Notes are saved with the analysis and included in the ZIP download.
        </p>
      ) : (
        <>
          <ol className="pf-notes">
            {notes.map(({ thread, index, message, asked }) => (
              <li key={`${thread.key}-${index}`} className="pf-notes__item">
                <div className="pf-notes__head">
                  <span className="label">{targetLabel(thread.target)}</span>
                  <span className="small pf-note">
                    {asked ? `“${asked}”` : ""} / {when(message.createdAt)}
                  </span>
                </div>
                <div className="pf-notes__text">{paragraphs(message.text)}</div>
                <div className="pf-row pf-row--tight">
                  <AnswerActions text={message.text} noted onNote={() => toggleNote(thread, index)} />
                  <button type="button" className="ml-btn ml-btn--ghost pf-cw__action" onClick={() => openSaved(thread.target)}>
                    Open in Interpretation
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="pf-row">
            <button
              type="button"
              className="ml-btn ml-btn--secondary pf-download"
              onClick={() => download(`${projectName.replace(/[^\w.-]+/g, "_")}_notes.md`, notesText(threads), "text/markdown;charset=utf-8")}
            >
              <DownloadIcon size={16} />
              Download notes
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export function ReportTab() {
  return (
    <div className="pf-interpret-ws" data-tour="report">
      <div className="pf-interpret-ws__head">
        <span className="ml-tag ml-tag--brand">
          <span className="ml-tag-dot" />
          Demo
        </span>
        <p className="small pf-note">
          Written interpretation is a demonstration feature: read it alongside the results, and check it against them.
        </p>
      </div>
      <Notes />
      <section className="pf-section" aria-labelledby="interpret-model">
        <div className="pf-section__head">
          <h3 className="pf-section__title" id="interpret-model">
            The whole model
          </h3>
        </div>
        <InterpretationTab />
      </section>
    </div>
  );
}
