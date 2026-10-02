import type { ReactNode } from "react";
import { useState } from "react";
import { edgeCodes, num, percent } from "../../results/format";
import { useConnection } from "../../interpret/connection";
import { edgeTarget, targetKey } from "../../interpret/evidence";
import { DIMENSION_LABEL, MODEL_DIMENSIONS, type EdgeWeight, type PoleCode } from "../../results/summary";
import { useStore } from "../../state/store";


/** Fit, axes and edges: the model itself, beneath the comparison (plan §11.5–11.7). */
export function ModelTab() {
  const { summary } = useStore((state) => state.result)!;
  const fit = summary.statistics.goodness_of_fit;

  return (
    <>
      <section className="pf-section" aria-labelledby="model-fit">
        <div className="pf-section__head">
          <h3 className="pf-section__title" id="model-fit">
            Goodness of fit
          </h3>
          <span className="metadata pf-ink-secondary">
            {fit.n_non_zero_units} of {summary.model.units} units with non-zero edge weights
          </span>
        </div>
        {/* pyENA's own sentence, verbatim: it already carries the right hedge. */}
        <p className="body pf-fit-summary" style={{ marginBottom: "var(--space-2)" }}>
          {fit.summary}
        </p>
        <p className="small pf-ink-secondary pf-section__lead">
          Fit describes how closely the visualization matches the model, not how far apart the groups are. A clear
          visual gap between groups does not by itself mean a strong fit.
        </p>
        <table className="pf-dtable">
          <caption className="pf-visually-hidden">Co-registration correlations by dimension</caption>
          <thead>
            <tr>
              <th scope="col">Co-registration</th>
              <th scope="col" className="is-num">Pearson</th>
              <th scope="col" className="is-num">Spearman</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_DIMENSIONS.filter((dim) => fit.co_registration_correlations[dim]).map((dim) => (
              <tr key={dim}>
                <th scope="row">{DIMENSION_LABEL[dim]}</th>
                <td className="is-num">{num(fit.co_registration_correlations[dim]!.pearson, 3)}</td>
                <td className="is-num">{num(fit.co_registration_correlations[dim]!.spearman, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pf-section" aria-labelledby="model-variance">
        <div className="pf-section__head">
          <h3 className="pf-section__title" id="model-variance">
            Eigenvalues
          </h3>
        </div>
        <table className="pf-dtable">
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col" className="is-num">Eigenvalue</th>
              <th scope="col" className="is-num">Explained variance ratio</th>
            </tr>
          </thead>
          <tbody>
            {summary.model.eigenvalues.map((value, index) => (
              <tr key={index}>
                <th scope="row">{DIMENSION_LABEL[MODEL_DIMENSIONS[index]] ?? `Dimension ${index + 1}`}</th>
                <td className="is-num">{num(value, 3)}</td>
                <td className="is-num">{percent(summary.model.explained_variance_ratio[index])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small pf-ink-secondary" style={{ marginTop: "var(--space-3)" }}>
          pyENA computes this ratio over the {summary.model.rotation_dimensions} retained dimensions.
        </p>
      </section>

      <section className="pf-section" aria-labelledby="model-axes">
        <div className="pf-section__head">
          <h3 className="pf-section__title" id="model-axes">
            Axes
          </h3>
        </div>
        <p className="small pf-ink-secondary pf-section__lead">
          The poles orient interpretation. Read them with the mean and subtracted networks, not as a conclusion on their
          own.
        </p>
        {MODEL_DIMENSIONS.filter((dim) => summary.axis_interpretation[dim]).map((dim) => {
          const axis = summary.axis_interpretation[dim]!;
          return (
            <div key={dim} style={{ marginBottom: "var(--space-6)" }}>
              <p className="label" style={{ marginBottom: "var(--space-1)" }}>
                {DIMENSION_LABEL[dim]}
              </p>
              <p className="small pf-ink-secondary" style={{ marginBottom: "var(--space-3)" }}>
                {axis.basis}
              </p>
              <div className="pf-poles">
                <PoleTable title="Positive pole" codes={axis.positive_pole_codes} />
                <PoleTable title="Negative pole" codes={axis.negative_pole_codes} />
              </div>
            </div>
          );
        })}
      </section>

      <EdgesSection />
    </>
  );
}

function PoleTable({ title, codes }: { title: string; codes: PoleCode[] }) {
  return (
    <table className="pf-dtable">
      <thead>
        <tr>
          <th scope="col">{title}</th>
          <th scope="col" className="is-num">Node coordinate</th>
        </tr>
      </thead>
      <tbody>
        {codes.map((code) => (
          <tr key={code.code}>
            <th scope="row">{code.code}</th>
            <td className="is-num">{num(code.coordinate, 3)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Edges: weights per group and their difference, colour always with a sign.
// ---------------------------------------------------------------------------

type SortKey = "edge" | "a" | "b" | "sub";

function EdgesSection() {
  const { summary } = useStore((state) => state.result)!;
  const { colorA, colorB } = useStore((state) => state.figures);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "sub", descending: true });
  const { group_a_label: a, group_b_label: b } = summary.groups;
  const { group_a_mean_network, group_b_mean_network, subtracted_mean_network, subtracted_mean_network_top_edges } =
    summary.networks;

  const rows = subtracted_mean_network.map((row, index) => ({
    edge: row.edge,
    a: group_a_mean_network[index].weight,
    b: group_b_mean_network[index].weight,
    sub: row.weight,
  }));
  rows.sort((left, right) => {
    const order =
      sort.key === "edge" ? left.edge.localeCompare(right.edge) : (left[sort.key] as number) - (right[sort.key] as number);
    return sort.descending ? -order : order;
  });

  const header = (key: SortKey, label: string, numeric = true) => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        className={numeric ? "is-num" : undefined}
        aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}
      >
        <button
          type="button"
          className="pf-sort"
          onClick={() => setSort({ key, descending: active ? !sort.descending : key !== "edge" })}
        >
          {label}
          {active && <span aria-hidden="true">{sort.descending ? "↓" : "↑"}</span>}
        </button>
      </th>
    );
  };

  return (
    <section className="pf-section" aria-labelledby="model-edges">
      <div className="pf-section__head">
        <h3 className="pf-section__title" id="model-edges">
          Edges
        </h3>
        <span className="metadata pf-ink-secondary">{summary.model.edges} edges</span>
      </div>

      <div className="pf-poles" style={{ marginBottom: "var(--space-6)" }}>
        <TopEdges title={`Stronger in ${a}`} rows={subtracted_mean_network_top_edges.group_a_stronger} color={colorA} />
        <TopEdges title={`Stronger in ${b}`} rows={subtracted_mean_network_top_edges.group_b_stronger} color={colorB} />
      </div>

      <table className="pf-dtable">
        <caption className="pf-visually-hidden">Mean edge weights by group and their difference</caption>
        <thead>
          <tr>
            {header("edge", "Edge", false)}
            {header("a", `${a} mean`)}
            {header("b", `${b} mean`)}
            {header("sub", `Subtracted, ${a} − ${b}`)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <EdgeRow key={row.edge} edge={row.edge}>
              <td className="is-num">{num(row.a, 3)}</td>
              <td className="is-num">{num(row.b, 3)}</td>
              <td className="is-num">
                <SignedWeight value={row.sub} colorA={colorA} colorB={colorB} />
              </td>
            </EdgeRow>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/**
 * A table row with the edge's name and a visible Ask button that opens its
 * conversation in the Interpretation panel; the row stays marked while it is open.
 */
function EdgeRow({ edge, children }: { edge: string; children: ReactNode }) {
  const request = useConnection((state) => state.request);
  const [x, y] = edgeCodes(edge);
  const target = edgeTarget(x, y);
  const active = useConnection((state) => state.open && state.active !== null && targetKey(state.active) === targetKey(target));
  return (
    <tr className={`pf-edge-row${active ? " is-interpreting" : ""}`} data-tour="edge-row">
      <th scope="row">
        <span className="pf-edge-name">
          {x} – {y}
          <button type="button" className="pf-edge-ask" aria-label={`Ask about ${x} and ${y}`} aria-pressed={active} onClick={() => request(target)}>
            Ask
          </button>
        </span>
      </th>
      {children}
    </tr>
  );
}

function SignedWeight({ value, colorA, colorB }: { value: number; colorA: string; colorB: string }) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return (
    <span className="pf-sign">
      {value !== 0 && <span className="pf-sign__bar" style={{ background: value > 0 ? colorA : colorB }} aria-hidden="true" />}
      {sign}
      {num(Math.abs(value), 3)}
    </span>
  );
}

function TopEdges({ title, rows, color }: { title: string; rows: EdgeWeight[]; color: string }) {
  return (
    <table className="pf-dtable">
      <thead>
        <tr>
          <th scope="col">
            <span className="pf-sign">
              <span className="pf-sign__bar" style={{ background: color }} aria-hidden="true" />
              {title}
            </span>
          </th>
          <th scope="col" className="is-num">Difference</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={2} className="pf-ink-secondary">
              No edges.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <EdgeRow key={row.edge} edge={row.edge}>
              <td className="is-num">
                {row.weight > 0 ? "+" : "−"}
                {num(Math.abs(row.weight), 3)}
              </td>
            </EdgeRow>
          ))
        )}
      </tbody>
    </table>
  );
}
