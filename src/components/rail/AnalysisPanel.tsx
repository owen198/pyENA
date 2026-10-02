import { useState } from "react";
import { configFileJson, downloadSession, edgesCsv } from "../../results/exports";
import { useStore } from "../../state/store";
import { download, FlagNote } from "../../ui/primitives";
import { DownloadIcon } from "../../ui/marks";
import { errorHeadline } from "../canvas/runCopy";

export function AnalysisPanel() {
  const source = useStore((state) => state.source);
  const run = useStore((state) => state.run);
  const result = useStore((state) => state.result);
  const figures = useStore((state) => state.figures);
  const focusUnits = useStore((state) => state.focusUnits);
  const threads = useStore((state) => state.threads);
  const interpretations = useStore((state) => state.interpretations);
  const setStep = useStore((state) => state.setStep);
  const model = useStore((state) => state.model);
  const [zipState, setZipState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  if (!source) return null;

  if (run.status === "running") {
    return (
      <p className="small">
        Analysing {source.table.rows.length.toLocaleString("en-US")} rows from {source.fileName}. The current step is
        shown beside the network.
      </p>
    );
  }

  if (run.status === "failed" && run.error) {
    return (
      <>
        <FlagNote>{errorHeadline(run.error, model)}</FlagNote>
        <button type="button" className="ml-btn ml-btn--secondary" onClick={() => setStep(3)}>
          Edit configuration
        </button>
      </>
    );
  }

  if (!result) return null;
  const { summary } = result;
  const { group_a_label: a, group_b_label: b } = summary.groups;

  return (
    <>
      <div className="ml-source">
        <span className="ml-source__id">
          Run / {result.finishedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
        </span>
        <div className="ml-source__title">{result.fileName}</div>
        <div className="ml-source__meta">
          <span>{summary.model.units} units</span>
          <span>{summary.model.codes.length} codes</span>
          <span>{summary.model.edges} edges</span>
        </div>
        <div className="ml-source__meta">
          <span>
            {a} n = {summary.points.group_a.n}
          </span>
          <span>
            {b} n = {summary.points.group_b.n}
          </span>
        </div>
      </div>

      <section className="pf-exports" aria-labelledby="exports-title">
        <p className="metadata pf-ink-secondary" id="exports-title">
          Downloads
        </p>
        <ul className="pf-exports__list">
          <ExportRow
            title="Statistical summary"
            file="statistical_summary.json"
            onClick={() => download("statistical_summary.json", result.summaryJson, "application/json")}
          />
          <ExportRow
            title="Configuration"
            file="config.json"
            onClick={() => download("config.json", configFileJson(source, result.model, figures), "application/json")}
          />
          <ExportRow title="Edge weights" file="edges.csv" onClick={() => download("edges.csv", edgesCsv(result), "text/csv")} />
        </ul>
        <button
          type="button"
          className="ml-btn ml-btn--primary pf-btn--block"
          disabled={zipState.busy}
          onClick={() => {
            setZipState({ busy: true, error: null });
            downloadSession(source, result, figures, focusUnits, { threads, interpretations })
              .then(() => setZipState({ busy: false, error: null }))
              .catch((error: Error) => setZipState({ busy: false, error: error.message }));
          }}
        >
          <DownloadIcon size={18} />
          {zipState.busy ? "Preparing every file…" : "Download everything (ZIP)"}
        </button>
        <p className="small pf-note">
          The summary, configuration, edge weights, every figure{result.model.dimensions === 3 ? ", the 3D pages" : ""}, the
          Python script, and your notes and interpretations. Single figures download from the Network tab.
        </p>
        {zipState.error && <FlagNote>{zipState.error}</FlagNote>}
      </section>

      <button type="button" className="ml-btn ml-btn--ghost" onClick={() => setStep(3)}>
        Edit configuration
      </button>
    </>
  );
}

function ExportRow({ title, file, onClick }: { title: string; file: string; onClick: () => void }) {
  return (
    <li className="pf-export">
      <span className="pf-export__text">
        <span className="label">{title}</span>
        <span className="small pf-note">{file}</span>
      </span>
      <button type="button" className="ml-btn ml-btn--secondary pf-download" aria-label={`Download ${file}`} onClick={onClick}>
        <DownloadIcon size={16} />
        Download
      </button>
    </li>
  );
}
