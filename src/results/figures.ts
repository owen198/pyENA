// The twelve figures pyENA's generate_analysis_outputs() draws, with the same
// plotting calls and the same file names (plan §11.3; pyENA README, "Output
// Files"). Each caption states exactly what is plotted (DataViz README).

import type { ModelConfig } from "../model/config";
import { fileSlug } from "./format";

export type FigureId =
  | "subtracted_mean_network"
  | "subtracted_network_with_points"
  | "group_points_overlay"
  | "a_points_ci"
  | "b_points_ci"
  | "a_mean_network"
  | "b_mean_network"
  | "a_network_with_points"
  | "b_network_with_points"
  | "individual_a_network"
  | "individual_b_network"
  | "subtracted_individual_network";

export type LegendKind =
  | "subtracted"
  | "subtracted-points"
  | "points-ci"
  | "points-ci-a"
  | "points-ci-b"
  | "mean-a"
  | "mean-b"
  | "points-a"
  | "points-b"
  | "individual-a"
  | "individual-b"
  | "subtracted-individual"
  | "subtracted-points-3d";

export interface FigureContext {
  a: string;
  b: string;
  nA: number;
  nB: number;
  codes: number;
  /** The individual comparison: a unit from each group. */
  focusA: string | null;
  focusB: string | null;
}

export interface FigureSpec {
  id: FigureId;
  section: string;
  legend: LegendKind;
  file: (ctx: FigureContext) => string;
  caption: (ctx: FigureContext) => string;
  alt: (ctx: FigureContext) => string;
}

const CI_BOX = "a dashed box spanning its 95% confidence interval on both dimensions";

export const FIGURES: FigureSpec[] = [
  {
    id: "subtracted_mean_network",
    section: "Subtracted network",
    legend: "subtracted",
    file: () => "subtracted_mean_network",
    caption: ({ a, b }) =>
      `Subtracted mean network, ${a} − ${b}. Each edge is the difference between the two groups' mean edge weights, drawn in the colour and sign of the group where the connection is stronger.`,
    alt: ({ a, b, codes }) => `Subtracted mean network of ${codes} codes, ${a} minus ${b}.`,
  },
  {
    id: "subtracted_network_with_points",
    section: "Subtracted network",
    legend: "subtracted-points",
    file: () => "subtracted_network_with_points",
    caption: ({ a, b, nA, nB }) =>
      `The subtracted mean network with every unit's projected point: ${a} (n = ${nA}) and ${b} (n = ${nB}). The larger marks are each group's mean point.`,
    alt: ({ a, b }) => `Subtracted mean network with the projected points of ${a} and ${b}.`,
  },
  {
    id: "group_points_overlay",
    section: "Projected points",
    legend: "points-ci",
    file: () => "group_points_overlay",
    caption: ({ a, b, nA, nB }) =>
      `Projected points for ${a} (n = ${nA}) and ${b} (n = ${nB}), each group's mean point, and ${CI_BOX}.`,
    alt: ({ a, b }) => `Projected points, means and 95% confidence intervals for ${a} and ${b}.`,
  },
  {
    id: "a_points_ci",
    section: "Projected points",
    legend: "points-ci-a",
    file: ({ a }) => `${fileSlug(a)}_points_ci`,
    caption: ({ a, nA }) => `Projected points for ${a} (n = ${nA}), its mean point, and ${CI_BOX}.`,
    alt: ({ a }) => `Projected points, mean and 95% confidence interval for ${a}.`,
  },
  {
    id: "b_points_ci",
    section: "Projected points",
    legend: "points-ci-b",
    file: ({ b }) => `${fileSlug(b)}_points_ci`,
    caption: ({ b, nB }) => `Projected points for ${b} (n = ${nB}), its mean point, and ${CI_BOX}.`,
    alt: ({ b }) => `Projected points, mean and 95% confidence interval for ${b}.`,
  },
  {
    id: "a_mean_network",
    section: "Mean networks",
    legend: "mean-a",
    file: ({ a }) => `${fileSlug(a)}_mean_network`,
    caption: ({ a, nA }) => `Mean network for ${a}: the average of its ${nA} units' normalized edge weights.`,
    alt: ({ a, codes }) => `Mean network of ${codes} codes for ${a}.`,
  },
  {
    id: "b_mean_network",
    section: "Mean networks",
    legend: "mean-b",
    file: ({ b }) => `${fileSlug(b)}_mean_network`,
    caption: ({ b, nB }) => `Mean network for ${b}: the average of its ${nB} units' normalized edge weights.`,
    alt: ({ b, codes }) => `Mean network of ${codes} codes for ${b}.`,
  },
  {
    id: "a_network_with_points",
    section: "Mean networks with points",
    legend: "points-a",
    file: ({ a }) => `${fileSlug(a)}_network_with_points`,
    caption: ({ a, nA }) => `Mean network for ${a} with its ${nA} projected points and their mean.`,
    alt: ({ a }) => `Mean network for ${a} with its projected points.`,
  },
  {
    id: "b_network_with_points",
    section: "Mean networks with points",
    legend: "points-b",
    file: ({ b }) => `${fileSlug(b)}_network_with_points`,
    caption: ({ b, nB }) => `Mean network for ${b} with its ${nB} projected points and their mean.`,
    alt: ({ b }) => `Mean network for ${b} with its projected points.`,
  },
  {
    id: "individual_a_network",
    section: "Individual comparison",
    legend: "individual-a",
    file: ({ a }) => `individual_${fileSlug(a)}_network`,
    caption: ({ a, focusA }) =>
      `The network for one unit of ${a}, ${focusA ?? "—"}: its own normalized edge weights and its projected point.`,
    alt: ({ focusA }) => `Individual network for the unit ${focusA ?? ""}.`,
  },
  {
    id: "individual_b_network",
    section: "Individual comparison",
    legend: "individual-b",
    file: ({ b }) => `individual_${fileSlug(b)}_network`,
    caption: ({ b, focusB }) =>
      `The network for one unit of ${b}, ${focusB ?? "—"}: its own normalized edge weights and its projected point.`,
    alt: ({ focusB }) => `Individual network for the unit ${focusB ?? ""}.`,
  },
  {
    id: "subtracted_individual_network",
    section: "Individual comparison",
    legend: "subtracted-individual",
    file: () => "subtracted_individual_network",
    caption: ({ focusA, focusB }) =>
      `${focusA ?? "—"} − ${focusB ?? "—"}: the difference between the two units' normalized edge weights, multiplied by 5 as generate_analysis_outputs does, with both units' projected points.`,
    alt: ({ focusA, focusB }) => `Subtracted network of two units, ${focusA ?? ""} minus ${focusB ?? ""}.`,
  },
];

export const FIGURE_IDS = FIGURES.map((figure) => figure.id);

// ---------------------------------------------------------------------------
// 3D: the four interactive networks pyENA's generate_analysis_outputs_3d draws
// ---------------------------------------------------------------------------

export type Figure3dId = "subtracted_3d_network_with_points" | "subtracted_3d_network" | "a_3d_network" | "b_3d_network";

export interface Figure3dSpec {
  id: Figure3dId;
  legend: "subtracted" | "mean-a" | "mean-b" | "subtracted-points-3d";
  file: (ctx: FigureContext) => string;
  caption: (ctx: FigureContext) => string;
  alt: (ctx: FigureContext) => string;
}

export const FIGURES_3D: Figure3dSpec[] = [
  {
    id: "subtracted_3d_network_with_points",
    legend: "subtracted-points-3d",
    file: () => "subtracted_3d_network_with_points",
    caption: ({ a, b, nA, nB }) =>
      `The subtracted mean network in three dimensions, with every unit's projected point: ${a} (n = ${nA}, circles) and ${b} (n = ${nB}, squares). Diamonds are each group's mean point.`,
    alt: ({ a, b }) => `Interactive 3D subtracted network with the projected points of ${a} and ${b}.`,
  },
  {
    id: "subtracted_3d_network",
    legend: "subtracted",
    file: () => "subtracted_3d_network",
    caption: ({ a, b }) =>
      `Subtracted mean network, ${a} \u2212 ${b}, placed on all three dimensions. Each edge takes the colour of the group where the connection is stronger.`,
    alt: ({ a, b }) => `Interactive 3D subtracted network, ${a} minus ${b}.`,
  },
  {
    id: "a_3d_network",
    legend: "mean-a",
    file: ({ a }) => `${fileSlug(a)}_3d_network`,
    caption: ({ a }) => `Mean network for ${a} in three dimensions.`,
    alt: ({ a }) => `Interactive 3D mean network for ${a}.`,
  },
  {
    id: "b_3d_network",
    legend: "mean-b",
    file: ({ b }) => `${fileSlug(b)}_3d_network`,
    caption: ({ b }) => `Mean network for ${b} in three dimensions.`,
    alt: ({ b }) => `Interactive 3D mean network for ${b}.`,
  },
];

/** Figures that change when the individual comparison's units change. */
export const INDIVIDUAL_FIGURES: FigureId[] = ["individual_a_network", "individual_b_network", "subtracted_individual_network"];

const WINDOW_LABEL = { MovingStanzaWindow: "Moving stanza window", Conversation: "Whole conversation" };

/** The metadata line beneath every figure: the configuration that produced it. */
export function figureProvenance(model: ModelConfig, commit: string): string {
  const window =
    model.window === "Conversation"
      ? WINDOW_LABEL.Conversation
      : `${WINDOW_LABEL.MovingStanzaWindow} ${model.windowBack} back / ${model.windowForward} forward`;
  const rotation = model.rotation === "mean" ? "Means rotation" : "SVD rotation";
  return ["EndPoint", window, rotation, `${model.dimensions} dimensions`, `${model.codes.length} codes`, `pyENA ${commit.slice(0, 7)}`].join(
    " / ",
  );
}
