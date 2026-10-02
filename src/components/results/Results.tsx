import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { staleReason } from "../../model/config";
import { useStore } from "../../state/store";
import { ConnectionMark } from "../../ui/marks";
import { DataTable } from "../canvas/DataTable";
import { InterpretationButton } from "../interpret/ConnectionWindow";
import { ReportTab } from "./InterpretationWorkspace";
import { ModelTab } from "./ModelTab";
import { NetworkTab } from "./NetworkTab";
import { StatisticsTab } from "./StatisticsTab";
import { useResultsTab, type TabId } from "./tabs";
import { useConnection } from "../../interpret/connection";
import { useSession } from "../../state/session";
import { FIGURE_NOTICE, INTERPRET_HINT, markNoticeSeen, useTour } from "../../tutorial/state";
import { CloseIcon } from "../../ui/marks";

const TABS = [
  { id: "data", label: "Data" },
  { id: "network", label: "Network" },
  { id: "statistics", label: "Statistics" },
  { id: "model", label: "Model" },
  { id: "report", label: "Report" },
] as const satisfies readonly { id: TabId; label: string }[];

/**
 * Once per account, under the Interpretation button: what it is for. Gone for
 * good when dismissed or when the panel is first opened; never during the
 * tutorial, which teaches the button itself.
 */
function InterpretationHint() {
  const user = useSession((state) => state.user);
  const touring = useTour((state) => state.phase !== "closed");
  const open = useConnection((state) => state.open);
  const notices = user?.settings.notices ?? [];
  const seen = notices.includes(INTERPRET_HINT);
  // An account that finished the tutorial before this existed gets the corner notice instead.
  const cornerNotice = user?.settings.tutorial === "completed" && !notices.includes(FIGURE_NOTICE);
  useEffect(() => {
    if (open && user && !seen) markNoticeSeen(INTERPRET_HINT);
  }, [open, user, seen]);
  if (!user || seen || touring || open || cornerNotice) return null;
  return (
    <p className="small pf-interpret-hint" role="note">
      Ask what any connection means, with the lines of data behind each answer.
      <button type="button" className="ml-btn ml-btn--ghost pf-interpret-hint__close" aria-label="Dismiss this tip" onClick={() => markNoticeSeen(INTERPRET_HINT)}>
        <CloseIcon size={14} />
      </button>
    </p>
  );
}

export function Results() {
  const result = useStore((state) => state.result)!;
  const model = useStore((state) => state.model);
  const figuresStale = useStore((state) => state.figuresStale);
  const setStep = useStore((state) => state.setStep);
  const [active, setActive] = useState<TabId>(() => useResultsTab.getState().take() ?? "network");
  const pendingTab = useResultsTab((state) => state.pending);

  // A tab asked for from outside the tabs (an old Interpretation link, the tutorial) opens once.
  useEffect(() => {
    const tab = useResultsTab.getState().take();
    if (tab) setActive(tab);
  }, [pendingTab]);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const bodyRef = useRef<HTMLDivElement>(null);

  // Each tab opens at its top, not at the scroll position the last tab was left at.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    bodyRef.current?.closest(".pf-canvas")?.scrollTo({ top: 0 });
  }, [active]);

  // Stale results stay visible but are never shown as current (plan §6.3).
  const reason =
    staleReason(model, result.model) ??
    (figuresStale ? "Figure options changed since this was run; the engine restarted, so re-run to redraw." : null);
  const { group_a_label: a, group_b_label: b } = result.summary.groups;

  const onKeyDown = (event: KeyboardEvent) => {
    const index = TABS.findIndex((tab) => tab.id === active);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault();
    setActive(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  return (
    <div className={`pf-results${reason ? " is-stale" : ""}`}>
      <div className="pf-results__head">
        <div className="pf-canvas__head">
          <h2 className="pf-canvas__title">
            {a} and {b}
          </h2>
          <span className="metadata pf-ink-secondary">
            {result.summary.model.units} units / {result.summary.model.codes.length} codes /{" "}
            {result.model.rotation === "mean" ? "means rotation" : "SVD rotation"}
          </span>
        </div>
        <div className="pf-results__ask">
          <InterpretationButton />
          <InterpretationHint />
        </div>
      </div>

      {reason && (
        <div className="pf-stale" role="status">
          <span className="ml-tag ml-tag--accent">
            <span className="ml-tag-dot" />
            Stale
          </span>
          <p className="small">{reason} Re-run the analysis to bring the results up to date.</p>
          <button type="button" className="ml-btn ml-btn--secondary" onClick={() => setStep(4)}>
            Go to Run analysis
          </button>
        </div>
      )}

      <div className="ml-tabs pf-tabs" role="tablist" aria-label="Results" data-tour="results-tabs" onKeyDown={onKeyDown}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            className="ml-tab"
            id={`tab-${tab.id}`}
            aria-controls={`panel-${tab.id}`}
            aria-selected={active === tab.id}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
          >
            {tab.id === "network" && <ConnectionMark size={24} />}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="pf-results__body" ref={bodyRef}>
        {TABS.map((tab) => (
          <div
            key={tab.id}
            className={`ml-tabpanel pf-panel${tab.id === "data" ? " pf-panel--data" : ""}`}
            role="tabpanel"
            id={`panel-${tab.id}`}
            aria-labelledby={`tab-${tab.id}`}
            hidden={active !== tab.id}
            tabIndex={0}
          >
            {active === tab.id && tab.id === "data" && <DataTable />}
            {active === tab.id && tab.id === "network" && <NetworkTab />}
            {active === tab.id && tab.id === "statistics" && <StatisticsTab />}
            {active === tab.id && tab.id === "model" && <ModelTab />}
            {active === tab.id && tab.id === "report" && <ReportTab />}
          </div>
        ))}
      </div>
    </div>
  );
}
