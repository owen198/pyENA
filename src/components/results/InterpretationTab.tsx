import { useEffect, useMemo, useState } from "react";
import type { Interpretation, InterpretRequest, InterpretStatus } from "../../../shared/api";
import { api, ApiError } from "../../api/client";
import { writeInterpretation } from "../../interpret/builtin";
import { findExcerpts, findTextColumn } from "../../interpret/excerpts";
import { useStore } from "../../state/store";
import { DownloadIcon } from "../../ui/marks";
import { download, FlagNote } from "../../ui/primitives";
import { windowSentence } from "../rail/ConfigPanel";

const BUILT_IN = "built-in";

let statusRequest: Promise<InterpretStatus> | null = null;
/** Whether the server can ask an AI (Claude or OpenAI); asked once per page load. */
function claudeStatus(): Promise<InterpretStatus> {
  statusRequest ??= api<InterpretStatus>("GET", "/interpret/status").catch(() => ({ available: false, model: null }));
  return statusRequest;
}

function authorLabel(author: string): string {
  if (author === BUILT_IN) return "Built-in writer";
  return author.startsWith("claude") ? `Claude (${author})` : `OpenAI (${author})`;
}

/**
 * A written interpretation of the results, in the order and by the rules of
 * pyENA's own skill (skills/interpret-ena-results). The built-in writer works
 * offline; Claude writes one when the server is configured for it.
 */
export function InterpretationTab() {
  const result = useStore((state) => state.result)!;
  const source = useStore((state) => state.source);
  const schema = useStore((state) => state.schema);
  const interpretations = useStore((state) => state.interpretations);
  const addInterpretation = useStore((state) => state.addInterpretation);
  const [claude, setClaude] = useState<InterpretStatus>({ available: false, model: null });
  const ai = claude.provider ?? "Claude";
  const company = ai === "OpenAI" ? "OpenAI" : "Anthropic";
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const resultAt = result.finishedAt.toISOString();

  useEffect(() => {
    void claudeStatus().then(setClaude);
  }, []);

  const input = useMemo(() => {
    const textColumn = source ? findTextColumn(source.table.profiles, result.model) : null;
    const excerpts = source ? findExcerpts(source.table.rows, result.model, result.summary, textColumn) : [];
    return { summary: result.summary, model: result.model, schema, excerpts, textColumn };
  }, [result, source, schema]);

  const forThisRun = interpretations.filter((entry) => entry.resultAt === resultAt);
  const earlier = interpretations.filter((entry) => entry.resultAt !== resultAt).reverse();
  const current = forThisRun[forThisRun.length - 1] ?? null;

  const writeBuiltIn = () => {
    const text = writeInterpretation(input);
    // Read the store itself, not this render's copy, so a second call in the
    // same moment (React's development double-mount) never writes it twice.
    const latest = useStore.getState().interpretations.filter((entry) => entry.resultAt === resultAt).at(-1);
    if (latest?.author === BUILT_IN && latest.text === text) return;
    addInterpretation({ text, createdAt: new Date().toISOString(), author: BUILT_IN, resultAt });
  };

  // The built-in interpretation is written as soon as the tab opens: it is
  // deterministic, instant and offline, so there is nothing to wait for.
  useEffect(() => {
    if (!useStore.getState().interpretations.some((entry) => entry.resultAt === resultAt)) writeBuiltIn();
  }, [resultAt]);

  const askClaude = async () => {
    setAsking(true);
    setError(null);
    const [a, b] = [result.summary.groups.group_a_label, result.summary.groups.group_b_label];
    const request: InterpretRequest = {
      summaryJson: result.summaryJson,
      schema: schema?.entries ?? [],
      context: {
        fileName: result.fileName,
        groupColumn: result.summary.groups.group_column,
        groups: [a, b],
        rotation: result.model.rotation,
        dimensions: result.model.dimensions,
        window:
          result.model.window === "Conversation"
            ? "the whole conversation as the window"
            : `a moving stanza window: ${windowSentence(result.model.windowBack, result.model.windowForward)}`,
        excerpts: input.excerpts,
      },
    };
    try {
      const reply = await api<{ text: string; model: string; truncated: boolean }>("POST", "/interpret", request);
      const entry: Interpretation = { text: reply.text, createdAt: new Date().toISOString(), author: reply.model, resultAt };
      addInterpretation(entry);
      if (reply.truncated) setError(`${ai}'s answer reached its length limit, so its last paragraph may be cut short.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : `${ai} could not be reached. The built-in interpretation is still here.`);
    } finally {
      setAsking(false);
    }
  };

  const fileName = `interpretation_${result.summary.groups.group_a_label}_${result.summary.groups.group_b_label}.txt`.replace(/[^\w.-]+/g, "_");

  return (
    <div className="pf-interpret">
      <p className="small pf-note pf-interpret__lead">
        Written in the order pyENA's interpretation guide sets out: where the groups sit, whether they differ, which
        connections make the difference, frequency and fit, then what it means. Every number is from
        statistical_summary.json{schema ? `, and codes are named by their meaning in ${schema.fileName}` : ""}.
      </p>

      <div className="pf-row">
        <button type="button" className="ml-btn ml-btn--secondary" data-tour="interpret-write" onClick={writeBuiltIn} disabled={asking}>
          Write again
        </button>
        {claude.available && (
          <button type="button" className="ml-btn ml-btn--primary" data-tour="interpret-claude" onClick={() => void askClaude()} disabled={asking}>
            {asking ? `${ai} is writing…` : `Write with ${ai}`}
          </button>
        )}
      </div>
      {claude.available && (
        <p className="small pf-note">
          Write with {ai} sends pyENA's summary, the coding schema and {input.excerpts.length === 0 ? "no excerpts" : `${input.excerpts.length} short excerpts`} to{" "}
          {company} through this platform's server. The dataset itself is not sent.
        </p>
      )}
      {error && <FlagNote>{error}</FlagNote>}

      {current && (
        <article className="pf-interpret__text" aria-live="polite" data-tour="interpret-text">
          <p className="metadata pf-ink-secondary">
            {authorLabel(current.author)} /{" "}
            {new Date(current.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </p>
          {current.text.split(/\n{2,}/).map((paragraph, index) => (
            <p key={index} className="body">
              {paragraph}
            </p>
          ))}
          <div className="pf-row">
            <button
              type="button"
              className="ml-btn ml-btn--ghost"
              onClick={() => {
                void navigator.clipboard.writeText(current.text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                });
              }}
            >
              {copied ? "Copied" : "Copy text"}
            </button>
            <button
              type="button"
              className="ml-btn ml-btn--secondary pf-download"
              onClick={() => download(fileName, current.text, "text/plain;charset=utf-8")}
            >
              <DownloadIcon size={16} />
              Download
            </button>
          </div>
        </article>
      )}

      {(forThisRun.length > 1 || earlier.length > 0) && (
        <details className="pf-disclosure">
          <summary>Earlier interpretations ({forThisRun.length - 1 + earlier.length})</summary>
          <ol className="pf-interpret__history">
            {[...forThisRun.slice(0, -1).reverse(), ...earlier].map((entry) => (
              <li key={entry.createdAt}>
                <p className="metadata pf-ink-secondary">
                  {authorLabel(entry.author)} / {new Date(entry.createdAt).toLocaleString("en-GB")}
                  {entry.resultAt !== resultAt && " / an earlier run"}
                </p>
                <p className="small">{entry.text.split(/\n{2,}/)[0]}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
