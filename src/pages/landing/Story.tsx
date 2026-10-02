import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEMO } from "../../content/demo";
import { SAMPLES } from "../../data/samples";
import { writeInterpretation } from "../../interpret/builtin";
import { edgeCodes, num, percent, pValue } from "../../results/format";
import { StoryStage, type StageId } from "./StoryStage";

const S = DEMO.summary;
const A = DEMO.groups.a;
const B = DEMO.groups.b;
const LINES = DEMO.document.lines;
const PRESET = SAMPLES.find((sample) => sample.id === "rs")!.preset;

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const pair = (edge: string) => edgeCodes(edge).join(" and ");

interface Step {
  stage: StageId;
  /** An anchor for the navigation, on the step that starts a part of the page. */
  id?: string;
  number: string;
  title: string;
  body: ReactNode;
  /** What the drawing shows, for screen readers. */
  label: string;
}

function steps(interpretation: string): Step[] {
  const t1 = S.statistics.welch_t_test.dimension_1;
  const u1 = S.statistics.mann_whitney_u.dimension_1;
  const f1 = S.statistics.anova.dimension_1;
  const fit = S.statistics.goodness_of_fit.co_registration_correlations;
  const heaviest = [...DEMO.edges].sort((x, y) => y.overall - x.overall)[0];
  const top = S.networks.subtracted_mean_network_top_edges;
  const poles = S.axis_interpretation.dimension_1;
  const meaning = interpretation.split("\n\n")[4] ?? "";

  return [
    {
      stage: "source",
      number: "01",
      title: "Research, as it was recorded",
      label: "Six lines of a design team's conversation, as a document.",
      body: (
        <p className="body">
          Six lines from RS.data, the design-team talk in the rENA handbook: conversation {DEMO.document.conversation.split(" / ")[1]}{" "}
          of the {A} condition, rows {LINES[0].row} to {LINES[LINES.length - 1].row} of the file's{" "}
          {DEMO.provenance.rows.toLocaleString("en-US")}.
        </p>
      ),
    },
    {
      stage: "extract",
      number: "02",
      title: "Each line carries its codes",
      label: "Each line is marked with its codes, and the codes leave the document as six nodes.",
      body: (
        <p className="body">
          The data marks every line for what it talks about. These six lines carry all six codes the analysis uses:{" "}
          {list(DEMO.codes)}.
        </p>
      ),
    },
    {
      stage: "connect",
      number: "03",
      title: "Codes that occur together connect",
      label: "Line by line, connections form between codes that occur within the stanza window.",
      body: (
        <p className="body">
          pyENA reads the talk through a moving stanza window of {DEMO.window} lines: each line's codes join the codes of
          that line and the {DEMO.window - 1} before it. In these six lines, {DEMO.connections.length} connections form,
          one line at a time.
        </p>
      ),
    },
    {
      stage: "bloom",
      number: "04",
      title: "Across every speaker, the network blooms",
      label: "The codes move to their places in the ENA space and the connections take their weights.",
      body: (
        <p className="body">
          Accumulated over all {DEMO.provenance.units} speakers, the connections gain weight and pyENA places each code
          in one shared space, drawn on its own graph paper. The thicker the line, the more often two codes connect; the
          heaviest here joins {heaviest.source} and {heaviest.target} ({num(heaviest.overall)}).
        </p>
      ),
    },
    {
      stage: "clusters",
      number: "05",
      title: "Each speaker becomes a point",
      label: "Closer in: every speaker's point, with the group means and their confidence intervals.",
      body: (
        <p className="body">
          Every speaker's network is projected into that space as one point. Closer in, the {S.points.group_a.n} speakers
          of {A} and the {S.points.group_b.n} of {B} gather on either side of the middle. The square and the diamond are
          the group means; the dashed boxes are their 95% confidence intervals.
        </p>
      ),
    },
    {
      stage: "analyze",
      number: "06",
      title: "The analysis, from the same network",
      label: "The subtracted network: connections stronger for each group, around the two group means.",
      body: (
        <>
          <p className="body">
            Subtracting one group's mean network from the other's shows which connections each made more: blue where {A}{" "}
            is stronger, red where {B} is.
          </p>
          <p className="body">
            On dimension 1 the groups separate: Welch's t({num(t1.degrees_of_freedom)}) = {num(t1.t_statistic)},{" "}
            {pValue(t1.p_value)}, Cohen's d = {num(t1.cohens_d)}, with {A} n = {t1.n_x} and {B} n = {t1.n_y}.
          </p>
        </>
      ),
    },
    {
      stage: "themes",
      id: "results",
      number: "07",
      title: "Themes: what the space is about",
      label: "The codes at the two ends of dimension 1.",
      body: (
        <>
          <p className="body">
            By node position, dimension 1 runs from {list((poles?.negative_pole_codes ?? []).slice(0, 2).map((pole) => pole.code))}{" "}
            to {list((poles?.positive_pole_codes ?? []).slice(0, 2).map((pole) => pole.code))}, which pyENA offers as a
            heuristic. How often each code occurs, per line:
          </p>
          <table className="st-table">
            <thead>
              <tr>
                <th scope="col" className="metadata">
                  Code
                </th>
                <th scope="col" className="metadata">
                  {A}
                </th>
                <th scope="col" className="metadata">
                  {B}
                </th>
                <th scope="col" className="metadata">
                  Chi-square
                </th>
              </tr>
            </thead>
            <tbody>
              {S.statistics.chi_square.per_code.map((row) => (
                <tr key={row.code}>
                  <th scope="row" className="label">
                    {row.code}
                  </th>
                  <td className="small pf-num">{percent(row.group_a_rate)}</td>
                  <td className="small pf-num">{percent(row.group_b_rate)}</td>
                  <td className="small pf-num">{pValue(row.p_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small pf-note">Chi-square compares how often codes occur, not where the groups sit in the space.</p>
        </>
      ),
    },
    {
      stage: "relationships",
      number: "08",
      title: "Relationships: which connections differ",
      label: "The subtracted network, coloured by the group each connection is stronger for.",
      body: (
        <div className="st-pairs">
          <div>
            <p className="metadata pf-ink-secondary">Stronger for {A}</p>
            <ol className="st-list">
              {top.group_a_stronger.slice(0, 3).map((entry) => (
                <li key={entry.edge} className="small">
                  {pair(entry.edge)} <span className="pf-note pf-num">{num(entry.weight)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="metadata pf-ink-secondary">Stronger for {B}</p>
            <ol className="st-list">
              {top.group_b_stronger.slice(0, 3).map((entry) => (
                <li key={entry.edge} className="small">
                  {pair(entry.edge)} <span className="pf-note pf-num">{num(Math.abs(entry.weight))}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ),
    },
    {
      stage: "evidence",
      number: "09",
      title: "Evidence: the talk behind them",
      label: "The two connections that differ most, with the lines of talk that carry them.",
      body: (
        <div className="st-quotes">
          {DEMO.excerpts.map((excerpt) => (
            <figure key={excerpt.unit} className="st-quote">
              <blockquote className="st-quote__text">“{excerpt.text}”</blockquote>
              <figcaption className="metadata pf-ink-secondary">
                {excerpt.unit.replace("::", " / ")} / {excerpt.codes.join(" + ")}
              </figcaption>
            </figure>
          ))}
        </div>
      ),
    },
    {
      stage: "charts",
      number: "10",
      title: "Charts: every test, with its numbers",
      label: "The speakers' points on dimensions 1 and 2, with the group means and confidence intervals.",
      body: (
        <ul className="st-tiles">
          <li className="ml-card">
            <span className="metadata pf-ink-secondary">Welch's t / dimension 1</span>
            <span className="st-tile__value pf-num">t = {num(t1.t_statistic)}</span>
            <span className="small pf-note">
              df {num(t1.degrees_of_freedom)}, {pValue(t1.p_value)}, d = {num(t1.cohens_d)}
            </span>
          </li>
          <li className="ml-card">
            <span className="metadata pf-ink-secondary">Mann–Whitney U / dimension 1</span>
            <span className="st-tile__value pf-num">U = {num(u1.u_statistic, 1)}</span>
            <span className="small pf-note">
              {pValue(u1.p_value)}, r = {num(u1.effect_r_approx)}
            </span>
          </li>
          <li className="ml-card">
            <span className="metadata pf-ink-secondary">ANOVA / dimension 1</span>
            <span className="st-tile__value pf-num">F = {num(f1.f_statistic)}</span>
            <span className="small pf-note">
              df 1, {f1.n_x + f1.n_y - 2}, {pValue(f1.p_value)}
            </span>
          </li>
          <li className="ml-card">
            <span className="metadata pf-ink-secondary">Goodness of fit</span>
            <span className="st-tile__value pf-num">
              {num(fit.dimension_1?.pearson ?? NaN)} / {num(fit.dimension_2?.pearson ?? NaN)}
            </span>
            <span className="small pf-note">Pearson, dimensions 1 and 2</span>
          </li>
        </ul>
      ),
    },
    {
      stage: "findings",
      number: "11",
      title: "Findings, written up",
      label: "The subtracted network and the group means: the analysis as a whole.",
      body: (
        <>
          <p className="body st-finding">{meaning}</p>
          <p className="small pf-note">
            The platform writes all five paragraphs, in the order pyENA's interpretation guide sets out, and every number
            in them comes from pyENA's summary.
          </p>
        </>
      ),
    },
  ];
}

/**
 * The walk-through: step texts scroll past a drawing that stays in place.
 * The step that crosses the reading line sets the drawing's state, so the page
 * moves in steps, never in a new picture every few pixels.
 */
export function Story() {
  const interpretation = useMemo(
    () =>
      writeInterpretation({ summary: S, model: PRESET, schema: null, excerpts: DEMO.excerpts, textColumn: "text" }),
    [],
  );
  const content = useMemo(() => steps(interpretation), [interpretation]);
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 899px)").matches;
    // Desktop: the middle of the window. Phone: just below the drawing pinned at the top.
    const rootMargin = narrow ? "-58% 0px -41% 0px" : "-49% 0px -50% 0px";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin },
    );
    refs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const stage = content[active].stage;
  return (
    <div className="st-story st-story--flip">
      <div className="st-story__stage" aria-live="polite">
        <div className="st-story__frame">
          <StoryStage stage={stage} label={content[active].label} />
          <p className="st-story__caption metadata pf-ink-secondary" aria-hidden="true">
            {content[active].number} / {STAGE_NAMES[stage]}
          </p>
        </div>
      </div>
      <ol className="st-story__steps">
        {content.map((step, index) => (
          <li
            key={step.stage}
            id={step.id}
            data-step={index}
            ref={(element) => {
              refs.current[index] = element;
            }}
            className={`st-step${index === active ? " is-active" : ""}${step.id === "results" ? " st-step--part" : ""}`}
          >
            {step.id === "results" && (
              <div className="st-step__part">
                <p className="metadata pf-ink-secondary">Results</p>
                <h2 className="st-h2">Explore the analysis</h2>
                <p className="body pf-note">The same space, read the way the platform lays out its results.</p>
              </div>
            )}
            <p className="metadata pf-ink-secondary">{step.number}</p>
            <h3 className="st-step__title">{step.title}</h3>
            <div className="st-step__body">{step.body}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const STAGE_NAMES: Record<StageId, string> = {
  source: "Source",
  extract: "Extract",
  connect: "Connect",
  bloom: "Bloom",
  clusters: "Clusters",
  analyze: "Analyze",
  themes: "Themes",
  relationships: "Relationships",
  evidence: "Evidence",
  charts: "Charts",
  findings: "Findings",
};

