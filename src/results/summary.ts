// The shape of summarize_ena_results() (rena.py:638). The results panel
// renders these keys; it does not invent a display schema (plan §11.1).

export interface WelchTest {
  t_statistic: number;
  p_value: number;
  degrees_of_freedom: number;
  mean_x: number;
  mean_y: number;
  sd_x: number;
  sd_y: number;
  n_x: number;
  n_y: number;
  confidence_interval_95: [number, number];
  cohens_d: number;
}

export interface MannWhitneyTest {
  u_statistic: number;
  u_complement: number;
  w_statistic_r_style: number;
  p_value: number;
  median_x: number;
  median_y: number;
  n_x: number;
  n_y: number;
  effect_r_approx: number;
}

export interface AnovaTest {
  f_statistic: number;
  p_value: number;
  mean_x: number;
  mean_y: number;
  n_x: number;
  n_y: number;
}

export interface ChiSquareCode {
  code: string;
  group_a_present: number;
  group_b_present: number;
  group_a_rate: number;
  group_b_rate: number;
  chi_square: number;
  p_value: number;
  degrees_of_freedom: number;
}

export interface GroupPoints {
  n: number;
  mean_point: [number, number];
  median_point: [number, number];
  confidence_interval_95: { dimension_1: [number, number]; dimension_2: [number, number] };
}

export interface EdgeWeight {
  edge: string;
  weight: number;
}

export interface PoleCode {
  code: string;
  coordinate: number;
}

/** The dimensions pyENA's group tests cover: always 1 and 2. */
export type Dimension = "dimension_1" | "dimension_2";
/** The dimensions fit and axis interpretation cover: every retained one. */
export type ModelDimension = Dimension | "dimension_3";

export interface Summary {
  groups: { group_column: string; group_a_label: string; group_b_label: string };
  model: {
    units: number;
    edges: number;
    codes: string[];
    rotation_dimensions: number;
    eigenvalues: number[];
    explained_variance_ratio: number[];
  };
  points: { group_a: GroupPoints; group_b: GroupPoints };
  statistics: {
    welch_t_test: Record<Dimension, WelchTest>;
    mann_whitney_u: Record<Dimension, MannWhitneyTest>;
    anova: Record<Dimension, AnovaTest>;
    chi_square: {
      basis: string;
      group_a_rows: number;
      group_b_rows: number;
      overall: { chi_square: number; p_value: number; degrees_of_freedom: number };
      per_code: ChiSquareCode[];
    };
    goodness_of_fit: {
      n_non_zero_units: number;
      co_registration_correlations: Partial<Record<ModelDimension, { pearson: number; spearman: number }>>;
      summary: string;
    };
  };
  axis_interpretation: Partial<
    Record<ModelDimension, { basis: string; positive_pole_codes: PoleCode[]; negative_pole_codes: PoleCode[] }>
  >;
  networks: {
    group_a_mean_network: EdgeWeight[];
    group_b_mean_network: EdgeWeight[];
    subtracted_mean_network: EdgeWeight[];
    subtracted_mean_network_top_edges: { group_a_stronger: EdgeWeight[]; group_b_stronger: EdgeWeight[] };
  };
}

export const DIMENSIONS: Dimension[] = ["dimension_1", "dimension_2"];
export const MODEL_DIMENSIONS: ModelDimension[] = ["dimension_1", "dimension_2", "dimension_3"];

export const DIMENSION_LABEL: Record<ModelDimension, string> = {
  dimension_1: "Dimension 1 (x)",
  dimension_2: "Dimension 2 (y)",
  dimension_3: "Dimension 3 (z)",
};

/**
 * Read statistical_summary.json as pyENA writes it. Python's json module writes
 * NaN and Infinity for undefined values (scipy's ANOVA p-value on a dimension
 * with no spread, for one), which JSON itself does not allow. They are read
 * back as numbers here; the exported file keeps them verbatim, as the CLI does.
 */
export function parseSummary(text: string): Summary {
  const marked = text.replace(/(?<=[:[,]\s*)(-?Infinity|NaN)(?=\s*[,\]}])/g, (token) => `"__pyena_${token}__"`);
  return JSON.parse(marked, (_key, value) => {
    if (value === "__pyena_NaN__") return NaN;
    if (value === "__pyena_Infinity__") return Infinity;
    if (value === "__pyena_-Infinity__") return -Infinity;
    return value;
  }) as Summary;
}

/** pyENA picks the Mann-Whitney method by group size (rena.py mann_whitney). */
export function mannWhitneyMethod(test: MannWhitneyTest): "exact" | "asymptotic" {
  return Math.max(test.n_x, test.n_y) > 300 ? "asymptotic" : "exact";
}
