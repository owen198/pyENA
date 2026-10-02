// What the interface says while pyENA runs and when it stops (plan §10.2, §15).
// Every caption names a real step; every error names the cause and the fix.

import type { EngineError, RunPhase } from "../../engine/protocol";
import type { ModelConfig } from "../../model/config";

export const RUN_CAPTIONS: Record<RunPhase, string> = {
  boot: "Loading the analysis engine…",
  accumulate: "Accumulating co-occurrences…",
  rotate: "Normalizing and rotating the space…",
  networks: "Building mean and subtracted networks…",
  statistics: "Running group comparisons…",
  plot: "Drawing the network…",
  plotly: "Loading the 3D plotting library (the first time only)…",
  plot3d: "Drawing the 3D networks…",
};

/** Errors pyENA raised itself; its own message is shown verbatim beneath ours (pyENA README, Troubleshooting). */
export const LIBRARY_ERRORS = new Set<EngineError["kind"]>([
  "group_size",
  "zero_variance",
  "means_rotation",
  "means_rotation_empty",
  "singular",
  "chi_square_zero",
  "library",
]);

export function errorHeadline(error: EngineError, model: ModelConfig): string {
  const [a, b] = model.groups;
  switch (error.kind) {
    case "group_size": {
      const detail = error.detail ? JSON.parse(error.detail) : null;
      if (!detail) return error.message;
      const short: string[] = [];
      if (detail.n_x < detail.need) short.push(`${a} has ${detail.n_x} ${detail.n_x === 1 ? "unit" : "units"}`);
      if (detail.n_y < detail.need) short.push(`${b} has ${detail.n_y} ${detail.n_y === 1 ? "unit" : "units"}`);
      return `${short.join(" and ")}; the ${detail.test} needs at least ${detail.need} per group.`;
    }
    case "zero_variance":
      return "Both groups have zero variance on a dimension, so the Welch t-test cannot run. Check that the codes vary across units.";
    case "means_rotation":
      return "Means rotation requires a group column and two groups.";
    case "means_rotation_empty":
      return "Means rotation needs at least one unit in each group; one of the two groups has none.";
    case "singular":
      return "pyENA could not place the nodes: the least-squares system for node positions is singular. Usually some codes never appear after accumulation, some always co-occur in fixed proportions, or too few units remain.";
    case "chi_square_zero":
      return "A selected code never occurs in the two compared groups, so the chi-square test of code presence cannot run. Remove codes that never occur.";
    case "engine":
      return `The analysis engine stopped: ${error.message}`;
    case "library":
      return "pyENA stopped with an error it does not describe further.";
    default:
      return error.message;
  }
}
