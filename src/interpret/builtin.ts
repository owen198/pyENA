// The platform's own results interpretation. It follows pyENA's skill,
// skills/interpret-ena-results/SKILL.md, in its order and by its rules:
//
//   1. where the groups sit in ENA space;
//   2. whether they differ on each dimension (Welch's t, Mann–Whitney U, ANOVA);
//   3. which connections make the difference (mean and subtracted networks,
//      read with the axis interpretation);
//   4. frequency and fit context (chi-square, goodness of fit), kept apart
//      from the point-space tests;
//   5. what the connections mean, closed with the coded data's own lines.
//
// Written as paragraphs, not a list. Every number comes from pyENA's
// statistical_summary.json; nothing is estimated here. It works offline, so
// it is always available; "Write with Claude" is the optional alternative.

import type { CodingSchema } from "../../shared/api";
import { meaningOf } from "../data/schema";
import type { ModelConfig } from "../model/config";
import { edgeCodes, interval, num, percent, pValue } from "../results/format";
import type { Dimension, EdgeWeight, ModelDimension, Summary } from "../results/summary";
import type { Excerpt } from "./excerpts";

export const ALPHA = 0.05;

export interface InterpretInput {
  summary: Summary;
  model: ModelConfig;
  schema: CodingSchema | null;
  excerpts: Excerpt[];
  /** The dataset's text column, or null when it has none. */
  textColumn: string | null;
}

const significant = (p: number) => Number.isFinite(p) && p < ALPHA;

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const DIMENSION_NUMBER: Record<ModelDimension, number> = { dimension_1: 1, dimension_2: 2, dimension_3: 3 };

export function writeInterpretation(input: InterpretInput): string {
  const { summary, model, schema } = input;
  // A code by its meaning when the schema gives one, keeping its name for reference.
  const name = (code: string) => {
    const meaning = meaningOf(schema, code);
    return meaning ? `${meaning} (${code})` : code;
  };
  const edge = (entry: EdgeWeight) => {
    const [first, second] = edgeCodes(entry.edge);
    return `${name(first)} and ${name(second)}`;
  };

  return [
    spaceParagraph(summary, model),
    testsParagraph(summary),
    networksParagraph(summary, edge, name),
    contextParagraph(summary, name),
    meaningParagraph(input, name),
  ].join("\n\n");
}

// 1. ENA space ---------------------------------------------------------------

function spaceParagraph(summary: Summary, model: ModelConfig): string {
  const { group_a_label: a, group_b_label: b } = summary.groups;
  const pa = summary.points.group_a;
  const pb = summary.points.group_b;
  const side = (value: number) => (value < 0 ? "negative" : "positive");
  const sentences: string[] = [];

  sentences.push(
    `In the ENA space, the ${pa.n} units of ${a} have a mean point at (${num(pa.mean_point[0])}, ${num(pa.mean_point[1])}) and the ${pb.n} units of ${b} a mean point at (${num(pb.mean_point[0])}, ${num(pb.mean_point[1])}).`,
  );
  const [x1, x2] = [pa.mean_point[0], pb.mean_point[0]];
  sentences.push(
    side(x1) !== side(x2)
      ? `On Dimension 1, ${a} lies on the ${side(x1)} side and ${b} on the ${side(x2)} side.`
      : `Both groups lie on the ${side(x1)} side of Dimension 1, ${Math.abs(x1) > Math.abs(x2) ? a : b} further from the origin.`,
  );

  const overlaps = (dimension: Dimension) => {
    const [lowA, highA] = pa.confidence_interval_95[dimension];
    const [lowB, highB] = pb.confidence_interval_95[dimension];
    return lowA <= highB && lowB <= highA;
  };
  const o1 = overlaps("dimension_1");
  const o2 = overlaps("dimension_2");
  sentences.push(
    `Their 95% confidence intervals ${o1 ? "overlap" : "do not overlap"} on Dimension 1 (${a} ${interval(pa.confidence_interval_95.dimension_1)}, ${b} ${interval(pb.confidence_interval_95.dimension_1)}) and ${o2 ? "overlap" : "do not overlap"} on Dimension 2 (${a} ${interval(pa.confidence_interval_95.dimension_2)}, ${b} ${interval(pb.confidence_interval_95.dimension_2)}).`,
  );
  sentences.push(
    !o1 && o2
      ? "The groups therefore separate along Dimension 1, while Dimension 2 does not distinguish them clearly."
      : o1 && !o2
        ? "The groups therefore separate along Dimension 2, while Dimension 1 does not distinguish them clearly."
        : !o1 && !o2
          ? "The groups therefore separate on both dimensions."
          : "By this measure, neither dimension separates the groups clearly.",
  );

  if (model.rotation === "mean") {
    sentences.push(
      "Because the space uses means rotation, Dimension 1 is placed through the two group means, so it is the axis on which a difference between the groups would appear.",
    );
  }
  const ratios = summary.model.explained_variance_ratio;
  if (ratios.length >= 2) {
    const parts = ratios.slice(0, model.dimensions).map((ratio, index) => `${percent(ratio)} for Dimension ${index + 1}`);
    sentences.push(
      `pyENA reports explained variance ratios of ${list(parts)}; this describes how much of the retained variance each plotted dimension represents, not whether the group difference is meaningful.`,
    );
  }
  if (model.dimensions === 3) {
    sentences.push(
      "The model also retains a third dimension. pyENA's group tests cover Dimensions 1 and 2, so the third appears here only in fit and axis interpretation.",
    );
  }
  return sentences.join(" ");
}

// 2. Statistical comparison --------------------------------------------------

function testsParagraph(summary: Summary): string {
  const { group_a_label: a, group_b_label: b } = summary.groups;
  const { welch_t_test, mann_whitney_u, anova } = summary.statistics;
  const sentences: string[] = [`Using α = .05, the tests compare the groups' projected positions on each dimension.`];

  (["dimension_1", "dimension_2"] as Dimension[]).forEach((dimension) => {
    const index = DIMENSION_NUMBER[dimension];
    const t = welch_t_test[dimension];
    const u = mann_whitney_u[dimension];
    const f = anova[dimension];

    sentences.push(
      `On Dimension ${index}, a Welch's t test found ${significant(t.p_value) ? "a statistically significant difference" : "no statistically significant difference"} between ${a} (M = ${num(t.mean_x)}, SD = ${num(t.sd_x)}, N = ${t.n_x}) and ${b} (M = ${num(t.mean_y)}, SD = ${num(t.sd_y)}, N = ${t.n_y}); t(${num(t.degrees_of_freedom)}) = ${num(t.t_statistic)}, ${pValue(t.p_value)}, Cohen's d = ${num(t.cohens_d)}.`,
    );
    const agrees = significant(u.p_value) === significant(t.p_value);
    sentences.push(
      `A Mann–Whitney U test ${
        agrees
          ? significant(u.p_value)
            ? "also found a significant difference"
            : "likewise found no significant difference"
          : significant(u.p_value)
            ? "did find a significant difference"
            : "did not find a significant difference"
      } (${a} Mdn = ${num(u.median_x)}, ${b} Mdn = ${num(u.median_y)}; U = ${num(u.u_statistic, 1)}, ${pValue(u.p_value)}, r = ${num(u.effect_r_approx)}).`,
    );
    sentences.push(
      Number.isNaN(f.p_value)
        ? `ANOVA's p value is not defined on this dimension (NaN), so it adds no evidence here.`
        : `As a companion statistic, ANOVA gives F(1, ${f.n_x + f.n_y - 2}) = ${num(f.f_statistic)}, ${pValue(f.p_value)}.`,
    );

    const verdicts = [t.p_value, u.p_value, f.p_value].filter((p) => Number.isFinite(p)).map(significant);
    if (verdicts.every((verdict) => verdict === verdicts[0])) {
      sentences.push(
        verdicts[0]
          ? `The tests converge: ${a} and ${b} differ systematically in their positions on Dimension ${index}, which summarise the overall structure of their networks rather than any single connection.`
          : `The tests converge: Dimension ${index} does not meaningfully distinguish the groups.`,
      );
    } else {
      sentences.push(`The parametric and non-parametric tests disagree on Dimension ${index}, so it should be interpreted cautiously.`);
    }
  });
  return sentences.join(" ");
}

// 3. Mean and subtracted networks, with the axis interpretation --------------

function networksParagraph(summary: Summary, edge: (entry: EdgeWeight) => string, name: (code: string) => string): string {
  const { group_a_label: a, group_b_label: b } = summary.groups;
  const { networks } = summary;
  const strongest = (network: EdgeWeight[]) =>
    [...network]
      .filter((entry) => entry.weight > 0)
      .sort((x, y) => y.weight - x.weight)
      .slice(0, 3)
      .map((entry) => `between ${edge(entry)} (${num(entry.weight)})`);
  const sentences: string[] = [];

  const topA = strongest(networks.group_a_mean_network);
  const topB = strongest(networks.group_b_mean_network);
  sentences.push(
    `In the mean network of ${a}, the strongest connections are ${list(topA) || "absent"}; in the mean network of ${b}, they are ${list(topB) || "absent"}.`,
  );

  const { group_a_stronger, group_b_stronger } = networks.subtracted_mean_network_top_edges;
  const difference = (entries: EdgeWeight[]) =>
    entries.slice(0, 3).map((entry) => `between ${edge(entry)} (a difference of ${num(Math.abs(entry.weight))})`);
  const strongerA = difference(group_a_stronger);
  const strongerB = difference(group_b_stronger);
  sentences.push(
    `The subtracted network shows what makes the groups different: connections are stronger for ${a} ${list(strongerA) || "nowhere"}, and stronger for ${b} ${list(strongerB) || "nowhere"}.`,
  );
  sentences.push("A connection missing from the subtracted network may simply be one the groups share to a similar degree.");

  const axis = summary.axis_interpretation.dimension_1;
  if (axis && axis.positive_pole_codes.length > 0 && axis.negative_pole_codes.length > 0) {
    const pole = (codes: { code: string }[]) => list(codes.slice(0, 2).map((entry) => name(entry.code)));
    sentences.push(
      `By node position, Dimension 1 runs from ${pole(axis.negative_pole_codes)} at its negative end to ${pole(axis.positive_pole_codes)} at its positive end, which pyENA offers as a heuristic.`,
    );
    const sideA = summary.points.group_a.mean_point[0] < 0 ? axis.negative_pole_codes : axis.positive_pole_codes;
    const nearA = new Set(sideA.map((entry) => entry.code));
    const topCodes = group_a_stronger[0] ? edgeCodes(group_a_stronger[0].edge) : [];
    const shared = topCodes.filter((code) => nearA.has(code));
    sentences.push(
      shared.length > 0
        ? `It agrees with the subtracted network: the connection that most favours ${a} involves ${list(shared.map(name))}, which sits toward ${a}'s side of Dimension 1.`
        : "It should be read together with the subtracted network rather than on its own.",
    );
  }
  return sentences.join(" ");
}

// 4. Frequency and fit context -----------------------------------------------

function contextParagraph(summary: Summary, name: (code: string) => string): string {
  const { group_a_label: a, group_b_label: b } = summary.groups;
  const { chi_square, goodness_of_fit } = summary.statistics;
  const sentences: string[] = [];

  const basis = chi_square.basis.replace(/\.$/, "");
  sentences.push(
    `A chi-square test of code frequency (${basis.charAt(0).toLowerCase()}${basis.slice(1)}) found χ²(${chi_square.overall.degrees_of_freedom}) = ${num(chi_square.overall.chi_square)}, ${pValue(chi_square.overall.p_value)}. It compares how often codes occur in each group, not where the groups sit in the ENA space, so it complements the tests above rather than repeating them.`,
  );
  const clearest = chi_square.per_code
    .filter((entry) => significant(entry.p_value))
    .sort((x, y) => x.p_value - y.p_value)
    .slice(0, 3)
    .map(
      (entry) =>
        `${name(entry.code)} (in ${percent(entry.group_a_rate)} of ${a}'s rows and ${percent(entry.group_b_rate)} of ${b}'s, ${pValue(entry.p_value)})`,
    );
  sentences.push(
    clearest.length > 0
      ? `The clearest differences in frequency are for ${list(clearest)}.`
      : "No single code differs in frequency between the groups at α = .05.",
  );

  const correlations = Object.entries(goodness_of_fit.co_registration_correlations) as [
    ModelDimension,
    { pearson: number; spearman: number },
  ][];
  if (correlations.length > 0) {
    const parts = correlations.map(
      ([dimension, value]) =>
        `Pearson ${num(value.pearson)} and Spearman ${num(value.spearman)} on Dimension ${DIMENSION_NUMBER[dimension]}`,
    );
    const values = correlations.flatMap(([, value]) => [value.pearson, value.spearman]);
    const high = values.every((value) => value >= 0.9);
    sentences.push(
      `The co-registration correlations are ${list(parts)}. ${
        high
          ? "They are consistently high, so the plotted space closely reflects the model's geometry"
          : "They are not uniformly high, so the plotted positions should be read with some caution"
      }${goodness_of_fit.summary ? `; pyENA summarises this as "${goodness_of_fit.summary.replace(/\.$/, "")}"` : ""}. Goodness of fit describes how faithful the visualization is to the model, not how large the group difference is.`,
    );
  }
  return sentences.join(" ");
}

// 5. Substantive meaning and the original data -------------------------------

function meaningParagraph(input: InterpretInput, name: (code: string) => string): string {
  const { summary, excerpts, textColumn } = input;
  const { group_a_label: a, group_b_label: b } = summary.groups;
  const { group_a_stronger, group_b_stronger } = summary.networks.subtracted_mean_network_top_edges;
  const sentences: string[] = [];

  const welch = summary.statistics.welch_t_test;
  const separated = significant(welch.dimension_1.p_value) || significant(welch.dimension_2.p_value);
  const pair = (entry: EdgeWeight | undefined) => {
    if (!entry) return null;
    const [first, second] = edgeCodes(entry.edge);
    return `${name(first)} with ${name(second)}`;
  };
  const pairA = pair(group_a_stronger[0]);
  const pairB = pair(group_b_stronger[0]);
  if (pairA && pairB) {
    sentences.push(
      `Taken together, the point distribution and the subtracted network ${separated ? "indicate" : "suggest, although the tests do not confirm a systematic difference in overall structure,"} that ${a}'s discourse more often connected ${pairA}, whereas ${b}'s more often connected ${pairB}.`,
    );
  } else if (pairA || pairB) {
    sentences.push(`Taken together, the subtracted network ${separated ? "indicates" : "suggests"} that ${pairA ? a : b}'s discourse more often connected ${pairA ?? pairB}.`);
  }

  if (!textColumn) {
    sentences.push(
      "The dataset has no column of text, so these connections cannot be tied back to what was said here; returning to the original discourse for the connections above would close the interpretive loop.",
    );
  } else if (excerpts.length === 0) {
    sentences.push(
      `No single line in the ${textColumn} column carries both codes of these connections; they form across lines within the stanza window, so the original conversations are the place to see them in context.`,
    );
  } else {
    excerpts.forEach((excerpt) => {
      sentences.push(
        `In ${excerpt.group}, a line from ${excerpt.unit} coded for both ${excerpt.codes[0]} and ${excerpt.codes[1]} reads: "${excerpt.text}"`,
      );
    });
    sentences.push("Lines like these show what the stronger connections looked like in the discourse itself.");
  }
  return capitalise(sentences.join(" "));
}
