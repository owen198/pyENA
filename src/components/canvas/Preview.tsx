import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { matchSchema, type SchemaMatch } from "../../data/schema";
import { useStore } from "../../state/store";
import { DataTable } from "./DataTable";

const TABS = [
  { id: "dataset", label: "Dataset" },
  { id: "schema", label: "Coding schema" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** 02 Preview data: the dataset and the coding schema, each in its own tab. */
export function Preview() {
  const source = useStore((state) => state.source)!;
  const schema = useStore((state) => state.schema);
  const [active, setActive] = useState<TabId>("dataset");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const bodyRef = useRef<HTMLDivElement>(null);

  // Each tab opens at its top.
  useEffect(() => {
    bodyRef.current?.querySelector(".pf-table-wrap")?.scrollTo({ top: 0 });
    bodyRef.current?.closest(".pf-canvas")?.scrollTo({ top: 0 });
  }, [active]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = TABS.findIndex((tab) => tab.id === active);
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length;
    setActive(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  return (
    <div className="pf-results">
      <div className="pf-canvas__head">
        <h2 className="pf-canvas__title">{active === "schema" && schema ? schema.fileName : source.fileName}</h2>
        <span className="metadata pf-ink-secondary">
          {active === "schema"
            ? schema
              ? `${schema.entries.length} codes`
              : "No coding schema"
            : `${source.table.rows.length.toLocaleString("en-US")} rows / ${source.table.columns.length} columns`}
        </span>
      </div>
      <div className="ml-tabs pf-tabs" role="tablist" aria-label="Preview" onKeyDown={onKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            className="ml-tab"
            id={`preview-tab-${tab.id}`}
            aria-controls={`preview-panel-${tab.id}`}
            aria-selected={active === tab.id}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
          >
            {tab.label}
            {tab.id === "schema" && schema && <span className="metadata pf-tab__count">{schema.entries.length}</span>}
          </button>
        ))}
      </div>
      <div className="pf-results__body" ref={bodyRef}>
        <div
          className="ml-tabpanel pf-panel pf-panel--data"
          role="tabpanel"
          id="preview-panel-dataset"
          aria-labelledby="preview-tab-dataset"
          hidden={active !== "dataset"}
        >
          {active === "dataset" && <DataTable />}
        </div>
        <div
          className="ml-tabpanel pf-panel"
          role="tabpanel"
          id="preview-panel-schema"
          aria-labelledby="preview-tab-schema"
          hidden={active !== "schema"}
          tabIndex={0}
        >
          {active === "schema" && <SchemaTable />}
        </div>
      </div>
    </div>
  );
}

const MATCH_LABEL: Record<SchemaMatch, string> = {
  selected: "Selected code",
  "in data": "In the dataset",
  "not in data": "Not in the dataset",
};

function SchemaTable() {
  const schema = useStore((state) => state.schema);
  const source = useStore((state) => state.source)!;
  const codes = useStore((state) => state.model.codes);
  const setStep = useStore((state) => state.setStep);

  if (!schema) {
    return (
      <div className="ml-empty">
        <div className="ml-empty__eyebrow">No coding schema</div>
        <p className="ml-empty__body">
          A coding schema lists each code and what it means. It is optional; with one, the preview, the settings and
          the interpretation name codes by their meaning.
        </p>
        <button type="button" className="ml-btn ml-btn--secondary" onClick={() => setStep(1)}>
          Add one on Upload data
        </button>
      </div>
    );
  }

  const match = matchSchema(schema, source.table.columns, codes);
  const inData = match.entries.length - match.missing;
  return (
    <div className="pf-stack">
      <p className="small">
        {inData} of {match.entries.length} codes in {schema.fileName} are columns of {source.fileName}.
        {schema.codeColumn && schema.meaningColumn
          ? ` Codes were read from the ${schema.codeColumn} column and meanings from ${schema.meaningColumn}.`
          : " The file has no header, so the first column was read as the code and the second as its meaning."}
      </p>
      {match.undescribed.length > 0 && (
        <p className="small pf-note">
          Selected codes the schema does not describe: {match.undescribed.join(", ")}.
        </p>
      )}
      <table className="pf-schema-table">
        <thead>
          <tr>
            <th scope="col" className="metadata">
              Code
            </th>
            <th scope="col" className="metadata">
              Meaning
            </th>
            <th scope="col" className="metadata">
              In this analysis
            </th>
          </tr>
        </thead>
        <tbody>
          {match.entries.map((entry) => (
            <tr key={entry.code}>
              <th scope="row" className="label">
                {entry.code}
              </th>
              <td className="small">{entry.meaning || <span className="pf-note">No meaning given</span>}</td>
              <td>
                <span className={`ml-tag${entry.match === "selected" ? " ml-tag--brand" : ""}`}>
                  {entry.match === "selected" && <span className="ml-tag-dot" />}
                  {MATCH_LABEL[entry.match]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
