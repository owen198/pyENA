import type { ReactNode } from "react";
import { count, interval, num, percent, pValue } from "../../results/format";
import { DIMENSION_LABEL, DIMENSIONS, mannWhitneyMethod } from "../../results/summary";
import { useStore } from "../../state/store";

const DIM_LABEL = DIMENSION_LABEL;

/** No statistic is stated without the test that produced it (README; plan §11.4). */
export function StatisticsTab() {
  const { summary, model } = useStore((state) => state.result)!;
  const { group_a_label: a, group_b_label: b } = summary.groups;
  const { welch_t_test, mann_whitney_u, anova, chi_square } = summary.statistics;
  const groups = (nx: number, ny: number) => `${a} n = ${nx} / ${b} n = ${ny}`;

  return (
    <>
      <section className="pf-section" aria-labelledby="stats-points">
        <div className="pf-section__head">
          <h3 className="pf-section__title" id="stats-points">
            Group comparisons on the projected points
          </h3>
        </div>
        <p className="small pf-ink-secondary pf-section__lead">
          Each test compares the two groups' projected points on one dimension. Every unit is one observation: {a}{" "}
          has {summary.points.group_a.n} units and {b} has {summary.points.group_b.n}. These tests evaluate differences
          in projected ENA positions; they do not test whether any single edge is independently significant.
          {model.dimensions === 3 &&
            " pyENA's summary compares the groups on dimensions 1 and 2; dimension 3 appears in the Model tab and the 3D networks."}
        </p>

        <div className="pf-tiles">
          {DIMENSIONS.map((dim) => {
            const test = welch_t_test[dim];
            return (
              <Tile key={`welch-${dim}`} test={`Welch t-test / ${DIM_LABEL[dim]}`} stat={`t = ${num(test.t_statistic)}`}>
                <Line>{pValue(test.p_value)}</Line>
                <Line>
                  df = {num(test.degrees_of_freedom, 1)} / Cohen's d = {num(test.cohens_d)}
                </Line>
                <Line>
                  Means {num(test.mean_x, 3)} and {num(test.mean_y, 3)}; 95% CI of the difference{" "}
                  {interval(test.confidence_interval_95, 3)}
                </Line>
                <Groups>{groups(test.n_x, test.n_y)}</Groups>
              </Tile>
            );
          })}
          {DIMENSIONS.map((dim) => {
            const test = mann_whitney_u[dim];
            return (
              <Tile key={`mw-${dim}`} test={`Mann-Whitney U test / ${DIM_LABEL[dim]}`} stat={`U = ${num(test.u_statistic, 0)}`}>
                <Line>{pValue(test.p_value)}</Line>
                <Line>
                  W (R) = {num(test.w_statistic_r_style, 0)} / r = {num(test.effect_r_approx)} (approximate)
                </Line>
                <Line>
                  Medians {num(test.median_x, 3)} and {num(test.median_y, 3)}
                </Line>
                <Groups>{groups(test.n_x, test.n_y)}</Groups>
                <span className="metadata pf-tile__test">Method: {mannWhitneyMethod(test)}</span>
              </Tile>
            );
          })}
          {DIMENSIONS.map((dim) => {
            const test = anova[dim];
            return (
              <Tile key={`anova-${dim}`} test={`One-way ANOVA / ${DIM_LABEL[dim]}`} stat={`F = ${num(test.f_statistic)}`}>
                <Line>{pValue(test.p_value)}</Line>
                <Line>df = 1, {test.n_x + test.n_y - 2}</Line>
                <Line>
                  Means {num(test.mean_x, 3)} and {num(test.mean_y, 3)}
                </Line>
                <Groups>{groups(test.n_x, test.n_y)}</Groups>
              </Tile>
            );
          })}
        </div>
      </section>

      <section className="pf-section" aria-labelledby="stats-means">
        <div className="pf-section__head">
          <h3 className="pf-section__title" id="stats-means">
            Mean projected points
          </h3>
        </div>
        <table className="pf-dtable">
          <thead>
            <tr>
              <th scope="col">Group</th>
              <th scope="col" className="is-num">n</th>
              <th scope="col" className="is-num">Mean, dim. 1</th>
              <th scope="col" className="is-num">95% CI, dim. 1</th>
              <th scope="col" className="is-num">Mean, dim. 2</th>
              <th scope="col" className="is-num">95% CI, dim. 2</th>
            </tr>
          </thead>
          <tbody>
            {([
              [a, summary.points.group_a],
              [b, summary.points.group_b],
            ] as const).map(([label, points]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="is-num">{points.n}</td>
                <td className="is-num">{num(points.mean_point[0], 3)}</td>
                <td className="is-num">{interval(points.confidence_interval_95.dimension_1, 3)}</td>
                <td className="is-num">{num(points.mean_point[1], 3)}</td>
                <td className="is-num">{interval(points.confidence_interval_95.dimension_2, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="pf-section" aria-labelledby="stats-chi">
        <div className="pf-section__head">
          <h3 className="pf-section__title" id="stats-chi">
            Chi-square test of code presence
          </h3>
        </div>
        <p className="small pf-ink-secondary pf-section__lead">
          {chi_square.basis} {a}: {count(chi_square.group_a_rows)} rows. {b}: {count(chi_square.group_b_rows)} rows.
          Unlike the tests above, it works on the original coded rows, not the ENA space: a frequency-based companion
          analysis.
        </p>
        <div className="pf-tiles" style={{ marginBottom: "var(--space-5)" }}>
          <Tile test="Chi-square test / All codes" stat={`χ² = ${num(chi_square.overall.chi_square)}`}>
            <Line>{pValue(chi_square.overall.p_value)}</Line>
            <Line>df = {chi_square.overall.degrees_of_freedom}</Line>
            <Groups>
              {a} {count(chi_square.group_a_rows)} rows / {b} {count(chi_square.group_b_rows)} rows
            </Groups>
          </Tile>
        </div>
        <table className="pf-dtable">
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col" className="is-num">{a}, present</th>
              <th scope="col" className="is-num">{b}, present</th>
              <th scope="col" className="is-num">{"χ²"}</th>
              <th scope="col" className="is-num">df</th>
              <th scope="col" className="is-num">p</th>
            </tr>
          </thead>
          <tbody>
            {chi_square.per_code.map((row) => (
              <tr key={row.code}>
                <th scope="row">{row.code}</th>
                <td className="is-num">
                  {count(row.group_a_present)} ({percent(row.group_a_rate)})
                </td>
                <td className="is-num">
                  {count(row.group_b_present)} ({percent(row.group_b_rate)})
                </td>
                <td className="is-num">{num(row.chi_square)}</td>
                <td className="is-num">{row.degrees_of_freedom}</td>
                <td className="is-num">{pValue(row.p_value).replace(/^p = /, "").replace(/^p /, "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

function Tile({ test, stat, children }: { test: string; stat: string; children: ReactNode }) {
  return (
    <div className="ml-card pf-tile">
      <span className="metadata pf-tile__test">{test}</span>
      <span className="pf-tile__stat">{stat}</span>
      {children}
    </div>
  );
}

function Line({ children }: { children: ReactNode }) {
  return <span className="pf-tile__line">{children}</span>;
}

function Groups({ children }: { children: ReactNode }) {
  return <span className="pf-tile__groups">{children}</span>;
}
