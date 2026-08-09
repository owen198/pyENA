from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Mapping, Sequence

import numpy as np


Record = Mapping[str, object]


def read_csv_records(path: str | Path) -> list[dict[str, object]]:
    with open(path, "r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        return [dict(row) for row in reader]


def _coerce_records(data: str | Path | Sequence[Record]) -> list[dict[str, object]]:
    if isinstance(data, (str, Path)):
        return read_csv_records(data)
    return [dict(row) for row in data]


def validate_rs_data(data_path: str | Path) -> None:
    data_path = Path(data_path)
    required_columns = {
        "UserName",
        "Condition",
        "GroupName",
        "ActivityNumber",
        "Data",
        "Technical.Constraints",
        "Performance.Parameters",
        "Client.and.Consultant.Requests",
        "Design.Reasoning",
        "Collaboration",
    }

    with data_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        fieldnames = set(reader.fieldnames or [])
        rows = list(reader)

    missing = sorted(required_columns - fieldnames)
    if missing:
        raise ValueError(
            "RS.data.csv is missing required columns: " + ", ".join(missing)
        )

    if len(rows) < 100:
        raise ValueError(
            f"RS.data.csv only has {len(rows)} rows. "
            "The handbook dataset rENA::RS.data should have 3824 rows."
        )


def _as_list(value: str | Sequence[str]) -> list[str]:
    if isinstance(value, str):
        return [value]
    return list(value)


def _merge_key(row: Mapping[str, object], columns: Sequence[str]) -> tuple[object, ...]:
    return tuple(row[column] for column in columns)


def _coerce_code_value(value: object) -> float:
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if text == "":
        return 0.0
    try:
        return float(text)
    except ValueError:
        lowered = text.lower()
        if lowered in {"true", "yes", "y"}:
            return 1.0
        return 0.0


def _vector_labels(codes: Sequence[str]) -> list[str]:
    labels: list[str] = []
    for right in range(1, len(codes)):
        for left in range(right):
            labels.append(f"{codes[left]}__{codes[right]}")
    return labels


def _row_code_vector(row: Mapping[str, object], codes: Sequence[str]) -> np.ndarray:
    return np.array([_coerce_code_value(row.get(code, 0.0)) for code in codes], dtype=float)


def _binary_presence(vector: np.ndarray) -> np.ndarray:
    return (vector > 0).astype(float)


def _vectorize_upper_triangle(matrix: np.ndarray) -> np.ndarray:
    values: list[float] = []
    for right in range(1, matrix.shape[0]):
        for left in range(right):
            values.append(float(matrix[left, right]))
    return np.asarray(values, dtype=float)


def _center_rows(matrix: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    if matrix.size == 0:
        return matrix.copy(), np.zeros((matrix.shape[1],), dtype=float)
    centered = matrix.copy()
    non_zero = np.linalg.norm(matrix, axis=1) > 0
    if np.any(non_zero):
        center = matrix[non_zero].mean(axis=0)
        centered[non_zero] = matrix[non_zero] - center
    else:
        center = matrix.mean(axis=0)
        centered = matrix - center
    return centered, center


def sphere_normalize(matrix: np.ndarray) -> np.ndarray:
    matrix = np.asarray(matrix, dtype=float)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return matrix / norms


def _build_node_weights(line_weights: np.ndarray, code_count: int) -> np.ndarray:
    node_weights = np.zeros((line_weights.shape[0], code_count), dtype=float)
    for row_idx in range(line_weights.shape[0]):
        z = 0
        for x in range(code_count - 1):
            for y in range(x + 1):
                node_weights[row_idx, x + 1] += 0.5 * line_weights[row_idx, z]
                node_weights[row_idx, y] += 0.5 * line_weights[row_idx, z]
                z += 1

    lengths = np.abs(node_weights).sum(axis=1, keepdims=True)
    lengths[lengths < 1e-4] = 1e-4
    return node_weights / lengths


def _format_singular_matrix_diagnostics(
    *,
    enadata: "ENAData",
    line_weights: np.ndarray,
    non_zero_mask: np.ndarray,
) -> str:
    active_line_weights = line_weights[non_zero_mask]
    code_count = len(enadata.codes)
    node_weights = _build_node_weights(active_line_weights, code_count)
    ss_a = node_weights.T @ node_weights
    node_rank = int(np.linalg.matrix_rank(node_weights))
    ss_a_rank = int(np.linalg.matrix_rank(ss_a))
    code_activity = np.abs(node_weights).sum(axis=0)
    inactive_codes = [
        code for code, activity in zip(enadata.codes, code_activity, strict=False) if activity < 1e-10
    ]
    low_variance_codes = [
        code
        for code, variance in zip(enadata.codes, np.var(node_weights, axis=0), strict=False)
        if variance < 1e-12
    ]

    details = [
        "Failed to estimate ENA node positions because the node-position least-squares matrix is singular.",
        f"codes={code_count}, total_units={line_weights.shape[0]}, active_units={active_line_weights.shape[0]}",
        f"node_weight_rank={node_rank}, system_rank={ss_a_rank}",
    ]
    if active_line_weights.shape[0] < code_count:
        details.append(
            "There are fewer active units than codes, so the system is underdetermined."
        )
    if inactive_codes:
        details.append("Inactive codes after accumulation: " + ", ".join(inactive_codes))
    if low_variance_codes and len(low_variance_codes) < code_count:
        details.append("Near-constant code columns: " + ", ".join(low_variance_codes))
    details.append(
        "This usually means some codes never appear, always co-occur in fixed proportions, "
        "or too few units remain after filtering zero line weights."
    )
    return "\n".join(details)


def svd_rotation(points_for_projection: np.ndarray, dimensions: int = 2) -> tuple[np.ndarray, np.ndarray]:
    _, singular_values, vt = np.linalg.svd(points_for_projection, full_matrices=False)
    dims = min(dimensions, vt.shape[0])
    rotation = vt[:dims].T
    eigenvalues = singular_values[:dims] ** 2
    return rotation, eigenvalues


def rotate_by_mean(
    points_for_projection: np.ndarray,
    group_a_mask: Sequence[bool],
    group_b_mask: Sequence[bool],
    dimensions: int = 2,
) -> tuple[np.ndarray, np.ndarray]:
    data = np.asarray(points_for_projection, dtype=float)
    data = data - data.mean(axis=0, keepdims=True)
    mask_a = np.asarray(group_a_mask, dtype=bool)
    mask_b = np.asarray(group_b_mask, dtype=bool)
    if not mask_a.any() or not mask_b.any():
        raise ValueError("Both groups must contain at least one unit for means rotation.")

    mean_diff = data[mask_a].mean(axis=0) - data[mask_b].mean(axis=0)
    diff_norm = np.linalg.norm(mean_diff)
    if diff_norm == 0:
        return svd_rotation(data, dimensions=dimensions)

    primary_axis = mean_diff / diff_norm
    residual = data - np.outer(data @ primary_axis, primary_axis)

    if dimensions <= 1:
        rotation = primary_axis.reshape(-1, 1)
        return rotation, np.array([diff_norm**2], dtype=float)

    _, singular_values, vt = np.linalg.svd(residual, full_matrices=False)
    remainder = vt[: max(dimensions - 1, 0)].T
    rotation = np.column_stack([primary_axis, remainder[:, : dimensions - 1]])
    eigenvalues = np.concatenate(([diff_norm**2], singular_values[: dimensions - 1] ** 2))
    return rotation, eigenvalues


@dataclass
class ENAData:
    records: list[dict[str, object]]
    codes: list[str]
    units: list[str]
    conversation: list[str]
    metadata: list[str]
    model: str
    window: str
    window_size_back: int | float
    window_size_forward: int | float
    unit_keys: list[tuple[object, ...]]
    conversation_keys: list[tuple[object, ...]]
    edge_labels: list[str]
    adjacency_vectors: np.ndarray
    accumulated_vectors: np.ndarray
    unit_labels: list[str]
    unit_metadata: list[dict[str, object]]
    trajectory_steps: list[tuple[object, ...]] | None = None


@dataclass
class ENASet:
    enadata: ENAData
    line_weights: np.ndarray
    points_for_projection: np.ndarray
    rotation_matrix: np.ndarray
    eigenvalues: np.ndarray
    points: np.ndarray
    center_vector: np.ndarray
    node_positions: np.ndarray

    @property
    def unit_labels(self) -> list[str]:
        return self.enadata.unit_labels

    @property
    def edge_labels(self) -> list[str]:
        return self.enadata.edge_labels


def find_unit_index(unit_labels: Sequence[str], target: str) -> int:
    try:
        return list(unit_labels).index(target)
    except ValueError as exc:
        raise ValueError(f"Could not find required unit label: {target}") from exc


def group_points(ena_set: ENASet, metadata_key: str, group_value: str) -> np.ndarray:
    mask = [meta[metadata_key] == group_value for meta in ena_set.enadata.unit_metadata]
    return ena_set.points[np.asarray(mask, dtype=bool)]


def group_mask(ena_set: ENASet, metadata_key: str, group_value: str) -> np.ndarray:
    return np.asarray(
        [meta[metadata_key] == group_value for meta in ena_set.enadata.unit_metadata],
        dtype=bool,
    )


def group_network(ena_set: ENASet, metadata_key: str, group_value: str) -> np.ndarray:
    return mean_network(ena_set, group_mask(ena_set, metadata_key, group_value))


def _validate_minimum_group_sizes(x: np.ndarray, y: np.ndarray, *, test_name: str, min_n: int) -> None:
    n_x = len(x)
    n_y = len(y)
    if n_x < min_n or n_y < min_n:
        raise ValueError(
            f"{test_name} requires at least {min_n} points per group, "
            f"but received n_x={n_x} and n_y={n_y}."
        )


def _validate_welch_variance(x: np.ndarray, y: np.ndarray) -> None:
    var_x = float(np.var(x, ddof=1))
    var_y = float(np.var(y, ddof=1))
    if var_x == 0.0 and var_y == 0.0:
        raise ValueError(
            "Welch t-test is undefined because both groups have zero variance on this ENA dimension."
        )


def welch_ttest(x: np.ndarray, y: np.ndarray) -> dict[str, float | list[float]]:
    from scipy import stats

    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    _validate_minimum_group_sizes(x, y, test_name="Welch t-test", min_n=2)
    var_x = float(np.var(x, ddof=1))
    var_y = float(np.var(y, ddof=1))
    _validate_welch_variance(x, y)
    result = stats.ttest_ind(x, y, equal_var=False)

    mean_diff = float(x.mean() - y.mean())
    n_x = len(x)
    n_y = len(y)
    se = np.sqrt(var_x / n_x + var_y / n_y)
    df = (var_x / n_x + var_y / n_y) ** 2 / (
        ((var_x / n_x) ** 2) / (n_x - 1) + ((var_y / n_y) ** 2) / (n_y - 1)
    )
    t_crit = stats.t.ppf(0.975, df)
    ci = [mean_diff - t_crit * se, mean_diff + t_crit * se]

    pooled_sd = np.sqrt(
        ((n_x - 1) * var_x + (n_y - 1) * var_y) / max((n_x + n_y - 2), 1)
    )
    cohens_d = 0.0 if pooled_sd == 0 else mean_diff / pooled_sd

    return {
        "t_statistic": float(result.statistic),
        "p_value": float(result.pvalue),
        "degrees_of_freedom": float(df),
        "mean_x": float(x.mean()),
        "mean_y": float(y.mean()),
        "sd_x": float(np.std(x, ddof=1)),
        "sd_y": float(np.std(y, ddof=1)),
        "n_x": int(n_x),
        "n_y": int(n_y),
        "confidence_interval_95": [float(ci[0]), float(ci[1])],
        "cohens_d": float(cohens_d),
    }


def mann_whitney(x: np.ndarray, y: np.ndarray) -> dict[str, float]:
    from scipy import stats

    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    _validate_minimum_group_sizes(x, y, test_name="Mann-Whitney U test", min_n=1)
    result = stats.mannwhitneyu(x, y, alternative="two-sided", method="exact")
    u_stat = float(result.statistic)
    u_complement = float(len(x) * len(y) - u_stat)
    w_stat = min(u_stat, u_complement)
    z_score = stats.norm.ppf(result.pvalue / 2.0) if result.pvalue > 0 else float("-inf")
    effect_r = abs(z_score) / np.sqrt(len(x) + len(y))
    return {
        "u_statistic": u_stat,
        "u_complement": u_complement,
        "w_statistic_r_style": w_stat,
        "p_value": float(result.pvalue),
        "median_x": float(np.median(x)),
        "median_y": float(np.median(y)),
        "n_x": int(len(x)),
        "n_y": int(len(y)),
        "effect_r_approx": float(effect_r),
    }


def summarize_group_point_tests(
    group_a_points: np.ndarray,
    group_b_points: np.ndarray,
    test_labels: tuple[str, str] = ("dimension_1", "dimension_2"),
) -> dict[str, dict[str, dict[str, float | list[float]]]]:
    group_a_points = np.asarray(group_a_points, dtype=float)
    group_b_points = np.asarray(group_b_points, dtype=float)
    return {
        "welch_t_test": {
            test_labels[0]: welch_ttest(group_a_points[:, 0], group_b_points[:, 0]),
            test_labels[1]: welch_ttest(group_a_points[:, 1], group_b_points[:, 1]),
        },
        "mann_whitney_u": {
            test_labels[0]: mann_whitney(group_a_points[:, 0], group_b_points[:, 0]),
            test_labels[1]: mann_whitney(group_a_points[:, 1], group_b_points[:, 1]),
        },
    }


def one_way_anova(x: np.ndarray, y: np.ndarray) -> dict[str, float]:
    from scipy import stats

    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    _validate_minimum_group_sizes(x, y, test_name="One-way ANOVA", min_n=2)
    result = stats.f_oneway(x, y)
    return {
        "f_statistic": float(result.statistic),
        "p_value": float(result.pvalue),
        "mean_x": float(x.mean()),
        "mean_y": float(y.mean()),
        "n_x": int(len(x)),
        "n_y": int(len(y)),
    }


def _pearson_correlation(x: np.ndarray, y: np.ndarray) -> float:
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    if x.size == 0 or y.size == 0:
        return 0.0
    if np.allclose(x, x[0]) or np.allclose(y, y[0]):
        return 0.0
    return float(np.corrcoef(x, y)[0, 1])


def _rankdata_average(values: np.ndarray) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty(len(values), dtype=float)
    sorted_values = values[order]
    idx = 0
    while idx < len(values):
        end = idx + 1
        while end < len(values) and sorted_values[end] == sorted_values[idx]:
            end += 1
        average_rank = (idx + 1 + end) / 2.0
        ranks[order[idx:end]] = average_rank
        idx = end
    return ranks


def _spearman_correlation(x: np.ndarray, y: np.ndarray) -> float:
    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    if x.size == 0 or y.size == 0:
        return 0.0
    return _pearson_correlation(_rankdata_average(x), _rankdata_average(y))


def summarize_goodness_of_fit(ena_set: ENASet) -> dict[str, object]:
    non_zero_mask = np.linalg.norm(ena_set.line_weights, axis=1) > 0
    if not np.any(non_zero_mask):
        return {
            "n_non_zero_units": 0,
            "co_registration_correlations": {},
            "summary": "No non-zero line weights were available to estimate co-registration fit.",
        }

    _, centroids = _least_squares_node_positions(
        ena_set.line_weights[non_zero_mask],
        ena_set.points[non_zero_mask],
        len(ena_set.enadata.codes),
    )
    centroid_mean = centroids.mean(axis=0)
    centered_centroids = centroids - centroid_mean
    observed_points = ena_set.points[non_zero_mask]

    correlations: dict[str, dict[str, float]] = {}
    for dim_idx in range(observed_points.shape[1]):
        key = f"dimension_{dim_idx + 1}"
        observed = observed_points[:, dim_idx]
        fitted = centered_centroids[:, dim_idx]
        correlations[key] = {
            "pearson": _pearson_correlation(observed, fitted),
            "spearman": _spearman_correlation(observed, fitted),
        }

    strong_fit = all(
        values["pearson"] > 0.9 and values["spearman"] > 0.9
        for values in correlations.values()
    )
    summary = (
        "Strong goodness of fit between the visualization and the original model."
        if strong_fit
        else "Co-registration fit is mixed; inspect dimension-level correlations before interpreting the visualization strongly."
    )
    return {
        "n_non_zero_units": int(np.sum(non_zero_mask)),
        "co_registration_correlations": correlations,
        "summary": summary,
    }


def summarize_chi_square(
    ena_set: ENASet,
    group_column: str,
    group_a_label: str,
    group_b_label: str,
) -> dict[str, object]:
    from scipy import stats

    records = ena_set.enadata.records
    codes = ena_set.enadata.codes
    group_a_rows = [row for row in records if row.get(group_column) == group_a_label]
    group_b_rows = [row for row in records if row.get(group_column) == group_b_label]

    group_a_counts = np.array(
        [sum(1 for row in group_a_rows if _coerce_code_value(row.get(code, 0.0)) > 0) for code in codes],
        dtype=float,
    )
    group_b_counts = np.array(
        [sum(1 for row in group_b_rows if _coerce_code_value(row.get(code, 0.0)) > 0) for code in codes],
        dtype=float,
    )

    contingency = np.vstack([group_a_counts, group_b_counts])
    chi2, p_value, dof, expected = stats.chi2_contingency(contingency)

    per_code = []
    total_a = max(len(group_a_rows), 1)
    total_b = max(len(group_b_rows), 1)
    for idx, code in enumerate(codes):
        present_a = int(group_a_counts[idx])
        present_b = int(group_b_counts[idx])
        absent_a = int(total_a - present_a)
        absent_b = int(total_b - present_b)
        code_table = np.array([[present_a, absent_a], [present_b, absent_b]], dtype=float)
        code_chi2, code_p, code_dof, code_expected = stats.chi2_contingency(code_table)
        per_code.append(
            {
                "code": str(code),
                "group_a_present": present_a,
                "group_b_present": present_b,
                "group_a_rate": float(present_a / total_a),
                "group_b_rate": float(present_b / total_b),
                "chi_square": float(code_chi2),
                "p_value": float(code_p),
                "degrees_of_freedom": int(code_dof),
                "expected": code_expected.tolist(),
            }
        )

    return {
        "basis": "Binary code presence counts per row within each group.",
        "group_a_rows": int(len(group_a_rows)),
        "group_b_rows": int(len(group_b_rows)),
        "overall": {
            "chi_square": float(chi2),
            "p_value": float(p_value),
            "degrees_of_freedom": int(dof),
            "observed": contingency.tolist(),
            "expected": expected.tolist(),
        },
        "per_code": per_code,
    }


def summarize_axis_interpretation(ena_set: ENASet, top_n: int = 3) -> dict[str, object]:
    coords = np.asarray(ena_set.node_positions, dtype=float)
    codes = ena_set.enadata.codes
    interpretations: dict[str, object] = {}
    for dim_idx in range(coords.shape[1]):
        dim_values = coords[:, dim_idx]
        pos_idx = np.argsort(dim_values)[::-1][:top_n]
        neg_idx = np.argsort(dim_values)[:top_n]
        interpretations[f"dimension_{dim_idx + 1}"] = {
            "basis": "Heuristic summary based on node positions in the co-registered ENA space.",
            "positive_pole_codes": [
                {"code": str(codes[idx]), "coordinate": float(dim_values[idx])}
                for idx in pos_idx
            ],
            "negative_pole_codes": [
                {"code": str(codes[idx]), "coordinate": float(dim_values[idx])}
                for idx in neg_idx
            ],
        }
    return interpretations


def _mean_point_and_ci(points: np.ndarray) -> dict[str, list[float] | int]:
    from scipy import stats

    points = np.asarray(points, dtype=float)
    mean = points.mean(axis=0)
    if len(points) > 1:
        ci_x = stats.t.interval(0.95, len(points) - 1, loc=mean[0], scale=stats.sem(points[:, 0]))
        ci_y = stats.t.interval(0.95, len(points) - 1, loc=mean[1], scale=stats.sem(points[:, 1]))
    else:
        ci_x = (mean[0], mean[0])
        ci_y = (mean[1], mean[1])
    return {
        "n": int(len(points)),
        "mean_point": [float(mean[0]), float(mean[1])],
        "median_point": [float(np.median(points[:, 0])), float(np.median(points[:, 1]))],
        "confidence_interval_95": {
            "dimension_1": [float(ci_x[0]), float(ci_x[1])],
            "dimension_2": [float(ci_y[0]), float(ci_y[1])],
        },
    }


def _edge_weight_table(edge_labels: Sequence[str], weights: np.ndarray) -> list[dict[str, float | str]]:
    weights = np.asarray(weights, dtype=float)
    return [
        {
            "edge": str(edge),
            "weight": float(weight),
        }
        for edge, weight in zip(edge_labels, weights)
    ]


def _top_edge_differences(
    edge_labels: Sequence[str],
    weights: np.ndarray,
    top_n: int = 5,
) -> dict[str, list[dict[str, float | str]]]:
    weights = np.asarray(weights, dtype=float)
    table = _edge_weight_table(edge_labels, weights)
    positive = sorted(
        (row for row in table if row["weight"] > 0),
        key=lambda row: float(row["weight"]),
        reverse=True,
    )[:top_n]
    negative = sorted(
        (row for row in table if row["weight"] < 0),
        key=lambda row: float(row["weight"]),
    )[:top_n]
    return {
        "group_a_stronger": positive,
        "group_b_stronger": negative,
    }


def summarize_ena_results(
    ena_set: ENASet,
    group_a_label: str,
    group_b_label: str,
    group_column: str,
    group_a_points: np.ndarray,
    group_b_points: np.ndarray,
    group_a_network: np.ndarray,
    group_b_network: np.ndarray,
    subtracted_mean_network: np.ndarray,
    top_n_edges: int = 5,
) -> dict[str, object]:
    total_variance = float(np.sum(ena_set.eigenvalues)) if ena_set.eigenvalues.size else 0.0
    explained_variance_ratio = (
        (ena_set.eigenvalues / total_variance).tolist() if total_variance > 0 else [0.0 for _ in ena_set.eigenvalues]
    )
    return {
        "groups": {
            "group_column": group_column,
            "group_a_label": group_a_label,
            "group_b_label": group_b_label,
        },
        "model": {
            "units": int(len(ena_set.unit_labels)),
            "edges": int(len(ena_set.edge_labels)),
            "codes": list(ena_set.enadata.codes),
            "rotation_dimensions": int(ena_set.points.shape[1]),
            "eigenvalues": [float(value) for value in ena_set.eigenvalues],
            "explained_variance_ratio": [float(value) for value in explained_variance_ratio],
        },
        "points": {
            "group_a": _mean_point_and_ci(group_a_points),
            "group_b": _mean_point_and_ci(group_b_points),
        },
        "statistics": {
            **summarize_group_point_tests(group_a_points, group_b_points),
            "anova": {
                "dimension_1": one_way_anova(group_a_points[:, 0], group_b_points[:, 0]),
                "dimension_2": one_way_anova(group_a_points[:, 1], group_b_points[:, 1]),
            },
            "chi_square": summarize_chi_square(
                ena_set,
                group_column=group_column,
                group_a_label=group_a_label,
                group_b_label=group_b_label,
            ),
            "goodness_of_fit": summarize_goodness_of_fit(ena_set),
        },
        "axis_interpretation": summarize_axis_interpretation(ena_set),
        "networks": {
            "group_a_mean_network": _edge_weight_table(ena_set.edge_labels, group_a_network),
            "group_b_mean_network": _edge_weight_table(ena_set.edge_labels, group_b_network),
            "subtracted_mean_network": _edge_weight_table(ena_set.edge_labels, subtracted_mean_network),
            "subtracted_mean_network_top_edges": _top_edge_differences(
                ena_set.edge_labels,
                subtracted_mean_network,
                top_n=top_n_edges,
            ),
        },
    }


def plot_points_with_ci(ax, points: np.ndarray, color: str, label: str) -> None:
    import matplotlib.pyplot as plt
    from scipy import stats

    ax.scatter(points[:, 0], points[:, 1], color=color, alpha=0.75, label=label)
    mean = points.mean(axis=0)
    ci_x = stats.t.interval(
        0.95, len(points) - 1, loc=mean[0], scale=stats.sem(points[:, 0])
    ) if len(points) > 1 else (mean[0], mean[0])
    ci_y = stats.t.interval(
        0.95, len(points) - 1, loc=mean[1], scale=stats.sem(points[:, 1])
    ) if len(points) > 1 else (mean[1], mean[1])

    ax.scatter([mean[0]], [mean[1]], color=color, marker="s", s=120, edgecolors="black", zorder=4)
    ax.add_patch(
        plt.Rectangle(
            (ci_x[0], ci_y[0]),
            ci_x[1] - ci_x[0],
            ci_y[1] - ci_y[0],
            fill=False,
            edgecolor=color,
            linewidth=1.5,
            linestyle="--",
        )
    )


def plot_point_set(
    ax,
    points: np.ndarray,
    color: str,
    label: str | None = None,
    alpha: float = 0.65,
    size: float = 25.0,
    show_mean: bool = True,
    mean_size: float = 100.0,
    zorder: int = 4,
) -> None:
    points = np.asarray(points, dtype=float)
    scatter_label = label if label is not None else None
    ax.scatter(
        points[:, 0],
        points[:, 1],
        color=color,
        alpha=alpha,
        s=size,
        zorder=zorder,
        label=scatter_label,
    )
    if show_mean and len(points) > 0:
        mean = points.mean(axis=0)
        ax.scatter(
            [mean[0]],
            [mean[1]],
            color=color,
            marker="s",
            s=mean_size,
            edgecolors="black",
            zorder=zorder + 1,
        )


def _apply_reference_axes(ax) -> None:
    ax.axhline(0, color="#cccccc", linewidth=0.8)
    ax.axvline(0, color="#cccccc", linewidth=0.8)


def create_points_ci_plot(
    points: np.ndarray,
    color: str,
    label: str,
    title: str,
    figsize: tuple[float, float] = (6, 6),
):
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=figsize)
    plot_points_with_ci(ax, points, color, label)
    ax.set_title(title)
    _apply_reference_axes(ax)
    ax.legend()
    return fig, ax


def create_points_ci_overlay_plot(
    point_groups: Sequence[tuple[np.ndarray, str, str]],
    title: str,
    figsize: tuple[float, float] = (7, 6),
):
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=figsize)
    for points, color, label in point_groups:
        plot_points_with_ci(ax, points, color, label)
    ax.set_title(title)
    _apply_reference_axes(ax)
    ax.legend()
    return fig, ax


def create_network_plot(
    ena_set: ENASet,
    network: np.ndarray,
    title: str,
    figsize: tuple[float, float] = (7, 6),
    line_colors: tuple[str, str] = ("#ff0000", "#0000ff"),
):
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=figsize)
    plot_network(ena_set, network, title=title, ax=ax, colors=line_colors)
    return fig, ax


def create_network_with_point_groups_plot(
    ena_set: ENASet,
    network: np.ndarray,
    point_groups: Sequence[dict[str, object]],
    title: str,
    figsize: tuple[float, float] = (7, 6),
    show_legend: bool = False,
    line_colors: tuple[str, str] = ("#ff0000", "#0000ff"),
):
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=figsize)
    plot_network(ena_set, network, title=title, ax=ax, colors=line_colors)
    for group in point_groups:
        plot_point_set(
            ax,
            np.asarray(group["points"], dtype=float),
            str(group["color"]),
            label=str(group["label"]) if group.get("label") is not None else None,
            alpha=float(group.get("alpha", 0.65)),
            size=float(group.get("size", 25.0)),
            show_mean=bool(group.get("show_mean", True)),
            mean_size=float(group.get("mean_size", 100.0)),
            zorder=int(group.get("zorder", 4)),
        )
    if show_legend:
        ax.legend()
    return fig, ax


def create_individual_network_plot(
    ena_set: ENASet,
    network: np.ndarray,
    point: np.ndarray,
    point_color: str,
    title: str,
    point_label: str | None = None,
    figsize: tuple[float, float] = (7, 6),
    point_size: float = 80.0,
    show_legend: bool = False,
    line_colors: tuple[str, str] = ("#ff0000", "#0000ff"),
):
    return create_network_with_point_groups_plot(
        ena_set=ena_set,
        network=network,
        point_groups=[
            {
                "points": point,
                "color": point_color,
                "label": point_label,
                "size": point_size,
                "show_mean": False,
                "zorder": 5,
            }
        ],
        title=title,
        figsize=figsize,
        show_legend=show_legend,
        line_colors=line_colors,
    )


def save_figure(fig, path: str | Path) -> None:
    import matplotlib.pyplot as plt

    fig.tight_layout()
    fig.savefig(path, dpi=200, bbox_inches="tight")
    plt.close(fig)


def generate_analysis_outputs(
    ena_set: ENASet,
    output_dir: str | Path,
    group_a_label: str = "FirstGame",
    group_b_label: str = "SecondGame",
    group_column: str = "Condition",
    group_a_color: str = "#ff0000",
    group_b_color: str = "#0000ff",
    group_a_line_colors: tuple[str, str] = ("#ff0000", "#0000ff"),
    group_b_line_colors: tuple[str, str] = ("#ff0000", "#0000ff"),
    subtracted_line_colors: tuple[str, str] = ("#ff0000", "#0000ff"),
    focus_unit_a: str = "FirstGame::steven z",
    focus_unit_b: str = "SecondGame::samuel o",
    individual_subtracted_network_multiplier: float = 5.0,
) -> dict[str, object]:
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True)

    group_a_network = group_network(ena_set, group_column, group_a_label)
    group_b_network = group_network(ena_set, group_column, group_b_label)
    subtracted_mean_network = subtract_networks(group_a_network, group_b_network)
    group_a_points = group_points(ena_set, group_column, group_a_label)
    group_b_points = group_points(ena_set, group_column, group_b_label)

    unit_labels = ena_set.unit_labels
    focus_unit_a_index = find_unit_index(unit_labels, focus_unit_a)
    focus_unit_b_index = find_unit_index(unit_labels, focus_unit_b)

    focus_unit_a_label = unit_labels[focus_unit_a_index]
    focus_unit_b_label = unit_labels[focus_unit_b_index]
    focus_unit_a_network = ena_set.line_weights[focus_unit_a_index]
    focus_unit_b_network = ena_set.line_weights[focus_unit_b_index]
    focus_unit_a_point = ena_set.points[focus_unit_a_index:focus_unit_a_index + 1]
    focus_unit_b_point = ena_set.points[focus_unit_b_index:focus_unit_b_index + 1]
    subtracted_individual_network = (
        subtract_networks(focus_unit_a_network, focus_unit_b_network)
        * individual_subtracted_network_multiplier
    )

    analysis_summary = summarize_ena_results(
        ena_set=ena_set,
        group_a_label=group_a_label,
        group_b_label=group_b_label,
        group_column=group_column,
        group_a_points=group_a_points,
        group_b_points=group_b_points,
        group_a_network=group_a_network,
        group_b_network=group_b_network,
        subtracted_mean_network=subtracted_mean_network,
    )

    figures: list[tuple[object, Path]] = []
    figures.append((
        create_network_plot(
            ena_set,
            group_a_network,
            title=f"{group_a_label} Mean Network",
            line_colors=group_a_line_colors,
        )[0],
        output_dir / f"{group_a_label.lower()}_mean_network.png",
    ))
    figures.append((
        create_network_plot(
            ena_set,
            group_b_network,
            title=f"{group_b_label} Mean Network",
            line_colors=group_b_line_colors,
        )[0],
        output_dir / f"{group_b_label.lower()}_mean_network.png",
    ))
    figures.append((
        create_network_plot(
            ena_set,
            subtracted_mean_network,
            title=f"Subtracted Mean Network: {group_a_label} - {group_b_label}",
            line_colors=subtracted_line_colors,
        )[0],
        output_dir / "subtracted_mean_network.png",
    ))
    figures.append((
        create_points_ci_plot(
            group_a_points,
            group_a_color,
            group_a_label,
            f"{group_a_label} Points, Mean, and 95% CI",
        )[0],
        output_dir / f"{group_a_label.lower()}_points_ci.png",
    ))
    figures.append((
        create_points_ci_plot(
            group_b_points,
            group_b_color,
            group_b_label,
            f"{group_b_label} Points, Mean, and 95% CI",
        )[0],
        output_dir / f"{group_b_label.lower()}_points_ci.png",
    ))
    figures.append((
        create_points_ci_overlay_plot(
            [
                (group_a_points, group_a_color, group_a_label),
                (group_b_points, group_b_color, group_b_label),
            ],
            title=f"{group_a_label} vs {group_b_label} Points, Means, and 95% CI",
        )[0],
        output_dir / "group_points_overlay.png",
    ))
    figures.append((
        create_network_with_point_groups_plot(
            ena_set,
            group_a_network,
            point_groups=[{"points": group_a_points, "color": group_a_color}],
            title=f"{group_a_label} Mean Network and Points",
            line_colors=group_a_line_colors,
        )[0],
        output_dir / f"{group_a_label.lower()}_network_with_points.png",
    ))
    figures.append((
        create_network_with_point_groups_plot(
            ena_set,
            group_b_network,
            point_groups=[{"points": group_b_points, "color": group_b_color}],
            title=f"{group_b_label} Mean Network and Points",
            line_colors=group_b_line_colors,
        )[0],
        output_dir / f"{group_b_label.lower()}_network_with_points.png",
    ))
    figures.append((
        create_network_with_point_groups_plot(
            ena_set,
            subtracted_mean_network,
            point_groups=[
                {"points": group_a_points, "color": group_a_color, "label": group_a_label, "alpha": 0.55},
                {"points": group_b_points, "color": group_b_color, "label": group_b_label, "alpha": 0.55},
            ],
            title="Subtracted Mean Network with Group Points",
            show_legend=True,
            line_colors=subtracted_line_colors,
        )[0],
        output_dir / "subtracted_network_with_points.png",
    ))
    figures.append((
        create_individual_network_plot(
            ena_set,
            focus_unit_a_network,
            focus_unit_a_point,
            group_a_color,
            title=f"Individual Network: {focus_unit_a_label}",
            line_colors=group_a_line_colors,
        )[0],
        output_dir / f"individual_{group_a_label.lower()}_network.png",
    ))
    figures.append((
        create_individual_network_plot(
            ena_set,
            focus_unit_b_network,
            focus_unit_b_point,
            group_b_color,
            title=f"Individual Network: {focus_unit_b_label}",
            line_colors=group_b_line_colors,
        )[0],
        output_dir / f"individual_{group_b_label.lower()}_network.png",
    ))
    figures.append((
        create_network_with_point_groups_plot(
            ena_set,
            subtracted_individual_network,
            point_groups=[
                {
                    "points": focus_unit_a_point,
                    "color": group_a_color,
                    "label": focus_unit_a_label,
                    "size": 80,
                    "show_mean": False,
                    "zorder": 5,
                },
                {
                    "points": focus_unit_b_point,
                    "color": group_b_color,
                    "label": focus_unit_b_label,
                    "size": 80,
                    "show_mean": False,
                    "zorder": 5,
                },
            ],
            title=f"Subtracted network: {focus_unit_a_label} (red) - {focus_unit_b_label} (blue)",
            show_legend=True,
            line_colors=subtracted_line_colors,
        )[0],
        output_dir / "subtracted_individual_network.png",
    ))

    for fig, path in figures:
        save_figure(fig, path)

    summary_path = output_dir / "statistical_summary.json"
    summary_path.write_text(json.dumps(analysis_summary, indent=2), encoding="utf-8")

    return {
        "stats_summary": analysis_summary["statistics"],
        "analysis_summary": analysis_summary,
        "group_a_points": group_a_points,
        "group_b_points": group_b_points,
        "group_a_network": group_a_network,
        "group_b_network": group_b_network,
        "subtracted_mean_network": subtracted_mean_network,
        "focus_unit_a_label": focus_unit_a_label,
        "focus_unit_b_label": focus_unit_b_label,
        "generated_files": sorted(path.name for _, path in figures) + [summary_path.name],
    }


def accumulate_data(
    data: str | Path | Sequence[Record],
    codes: Sequence[str],
    units: Sequence[str],
    conversation: Sequence[str],
    metadata: Sequence[str] | None = None,
    model: str = "EndPoint",
    window: str = "MovingStanzaWindow",
    window_size_back: int | float = 1,
    window_size_forward: int | float = 0,
    weight_by: str | Callable[[np.ndarray], np.ndarray] = "binary",
) -> ENAData:
    records = _coerce_records(data)
    code_columns = _as_list(codes)
    unit_columns = _as_list(units)
    conversation_columns = _as_list(conversation)
    metadata_columns = _as_list(metadata or [])
    model = model.strip()
    window = window.strip()

    row_codes = np.vstack([_row_code_vector(row, code_columns) for row in records])
    if weight_by == "binary":
        row_codes = _binary_presence(row_codes)
    elif callable(weight_by):
        row_codes = np.vstack([weight_by(row) for row in row_codes])
    else:
        raise ValueError("weight_by must be 'binary' or a callable.")

    unit_keys = [_merge_key(row, unit_columns) for row in records]
    conversation_keys = [_merge_key(row, conversation_columns) for row in records]
    if window == "Conversation":
        conversation_keys = [tuple(list(conv_key) + list(unit_key)) for conv_key, unit_key in zip(conversation_keys, unit_keys)]
        window_size_back = math.inf
        window_size_forward = 0
    convo_key_strings = ["::".join(map(str, key)) for key in conversation_keys]

    row_vectors: list[np.ndarray] = []
    row_unit_keys: list[tuple[object, ...]] = []
    row_conversation_keys: list[tuple[object, ...]] = []

    for idx, current_codes in enumerate(row_codes):
        current_conversation = convo_key_strings[idx]
        if window == "Conversation":
            indices = [
                row_index
                for row_index, conversation_key in enumerate(convo_key_strings)
                if conversation_key == current_conversation
            ]
        else:
            indices = []
            back_limit = idx if math.isinf(window_size_back) else max(0, idx - (int(window_size_back) - 1))
            forward_limit = len(records) - 1 if math.isinf(window_size_forward) else min(len(records) - 1, idx + int(window_size_forward))
            for candidate in range(back_limit, forward_limit + 1):
                if convo_key_strings[candidate] == current_conversation:
                    indices.append(candidate)

        stanza_codes = row_codes[indices]
        stanza_sum = stanza_codes.sum(axis=0)
        window_vector = _vectorize_upper_triangle(np.outer(stanza_sum, stanza_sum))

        if window != "Conversation":
            past_indices = [candidate for candidate in indices if candidate < idx]
            if past_indices:
                past_sum = row_codes[past_indices].sum(axis=0)
                window_vector = window_vector - _vectorize_upper_triangle(np.outer(past_sum, past_sum))

            future_indices = [candidate for candidate in indices if candidate > idx]
            if future_indices:
                future_sum = row_codes[future_indices].sum(axis=0)
                window_vector = window_vector - _vectorize_upper_triangle(np.outer(future_sum, future_sum))

        if weight_by == "binary":
            window_vector = (window_vector > 0).astype(float)

        row_vectors.append(window_vector)
        row_unit_keys.append(unit_keys[idx])
        row_conversation_keys.append(conversation_keys[idx])

    row_matrix = np.vstack(row_vectors) if row_vectors else np.empty((0, len(_vector_labels(code_columns))))
    edge_labels = _vector_labels(code_columns)

    if model == "EndPoint":
        grouped: dict[tuple[object, ...], np.ndarray] = {}
        grouped_meta: dict[tuple[object, ...], dict[str, object]] = {}
        for row_idx, unit_key in enumerate(row_unit_keys):
            grouped.setdefault(unit_key, np.zeros(row_matrix.shape[1], dtype=float))
            grouped[unit_key] += row_matrix[row_idx]
            grouped_meta.setdefault(
                unit_key,
                {column: records[row_idx].get(column) for column in metadata_columns},
            )
        accumulated_keys = list(grouped.keys())
        accumulated_matrix = np.vstack([grouped[key] for key in accumulated_keys])
        unit_metadata = [grouped_meta[key] for key in accumulated_keys]
        unit_labels = ["::".join(map(str, key)) for key in accumulated_keys]
        trajectory_steps = None
    elif model in {"AccumulatedTrajectory", "SeparateTrajectory"}:
        grouped_rows: dict[tuple[tuple[object, ...], tuple[object, ...]], np.ndarray] = {}
        grouped_meta = {}
        for row_idx, unit_key in enumerate(row_unit_keys):
            combo_key = (unit_key, row_conversation_keys[row_idx])
            grouped_rows.setdefault(combo_key, np.zeros(row_matrix.shape[1], dtype=float))
            grouped_rows[combo_key] += row_matrix[row_idx]
            grouped_meta.setdefault(
                combo_key,
                {column: records[row_idx].get(column) for column in metadata_columns},
            )

        ordered_combo_keys = list(grouped_rows.keys())
        if model == "AccumulatedTrajectory":
            running: dict[tuple[object, ...], np.ndarray] = {}
            accumulated_rows = []
            for unit_key, convo_key in ordered_combo_keys:
                running.setdefault(unit_key, np.zeros(row_matrix.shape[1], dtype=float))
                running[unit_key] += grouped_rows[(unit_key, convo_key)]
                accumulated_rows.append(running[unit_key].copy())
        else:
            accumulated_rows = [grouped_rows[key] for key in ordered_combo_keys]

        accumulated_matrix = np.vstack(accumulated_rows)
        unit_labels = [
            "::".join(map(str, unit_key)) + "::" + "::".join(map(str, convo_key))
            for unit_key, convo_key in ordered_combo_keys
        ]
        unit_metadata = [grouped_meta[key] for key in ordered_combo_keys]
        accumulated_keys = [key[0] for key in ordered_combo_keys]
        trajectory_steps = [key[1] for key in ordered_combo_keys]
    else:
        raise ValueError("model must be EndPoint, AccumulatedTrajectory, or SeparateTrajectory.")

    return ENAData(
        records=records,
        codes=code_columns,
        units=unit_columns,
        conversation=conversation_columns,
        metadata=metadata_columns,
        model=model,
        window=window,
        window_size_back=window_size_back,
        window_size_forward=window_size_forward,
        unit_keys=accumulated_keys,
        conversation_keys=row_conversation_keys,
        edge_labels=edge_labels,
        adjacency_vectors=row_matrix,
        accumulated_vectors=accumulated_matrix,
        unit_labels=unit_labels,
        unit_metadata=unit_metadata,
        trajectory_steps=trajectory_steps,
    )


def _least_squares_node_positions(line_weights: np.ndarray, points: np.ndarray, code_count: int) -> np.ndarray:
    dims = points.shape[1]
    node_weights = _build_node_weights(line_weights, code_count)

    ss_a = node_weights.T @ node_weights
    ss_x = np.zeros((dims, code_count), dtype=float)
    for dim_idx in range(dims):
        ss_b = node_weights.T @ points[:, dim_idx]
        ss_x[dim_idx, :] = np.linalg.solve(ss_a, ss_b)

    centroids = (ss_x @ node_weights.T).T
    return ss_x.T, centroids


def make_set(
    enadata: ENAData,
    dimensions: int = 2,
    rotation: str = "svd",
    group_column: str | None = None,
    groups: tuple[object, object] | None = None,
) -> ENASet:
    line_weights = sphere_normalize(enadata.accumulated_vectors)
    points_for_projection, center_vector = _center_rows(line_weights)

    if rotation == "svd":
        rotation_matrix, eigenvalues = svd_rotation(points_for_projection, dimensions=dimensions)
    elif rotation == "mean":
        if group_column is None or groups is None:
            raise ValueError("group_column and groups are required for means rotation.")
        metadata_values = [meta.get(group_column) for meta in enadata.unit_metadata]
        group_a_mask = [value == groups[0] for value in metadata_values]
        group_b_mask = [value == groups[1] for value in metadata_values]
        rotation_matrix, eigenvalues = rotate_by_mean(
            points_for_projection,
            group_a_mask=group_a_mask,
            group_b_mask=group_b_mask,
            dimensions=dimensions,
        )
    else:
        raise ValueError("rotation must be 'svd' or 'mean'.")

    points = points_for_projection @ rotation_matrix
    if rotation == "mean" and group_column is not None and groups is not None and points.shape[1] > 0:
        metadata_values = [meta.get(group_column) for meta in enadata.unit_metadata]
        group_a_mask = np.asarray([value == groups[0] for value in metadata_values], dtype=bool)
        group_b_mask = np.asarray([value == groups[1] for value in metadata_values], dtype=bool)
        if group_a_mask.any() and group_b_mask.any():
            mean_a = points[group_a_mask, 0].mean()
            mean_b = points[group_b_mask, 0].mean()
            # Match rENA orientation where the first group's mean is typically on the negative side.
            if mean_a > mean_b:
                rotation_matrix[:, 0] *= -1
                points[:, 0] *= -1
        if points.shape[1] > 1 and group_a_mask.any() and group_b_mask.any():
            median_a_dim2 = np.median(points[group_a_mask, 1])
            median_b_dim2 = np.median(points[group_b_mask, 1])
            # Match rENA handbook output where both groups' second-dimension medians are negative.
            if median_a_dim2 > 0 or median_b_dim2 > 0:
                rotation_matrix[:, 1] *= -1
                points[:, 1] *= -1

    non_zero_mask = np.linalg.norm(line_weights, axis=1) > 0
    if np.any(non_zero_mask):
        try:
            node_positions, centroids = _least_squares_node_positions(
                line_weights[non_zero_mask],
                points[non_zero_mask],
                len(enadata.codes),
            )
        except np.linalg.LinAlgError as exc:
            raise ValueError(
                _format_singular_matrix_diagnostics(
                    enadata=enadata,
                    line_weights=line_weights,
                    non_zero_mask=non_zero_mask,
                )
            ) from exc
        centroid_mean = centroids.mean(axis=0)
        node_positions = node_positions - centroid_mean
    else:
        node_positions = np.zeros((len(enadata.codes), points.shape[1]), dtype=float)

    return ENASet(
        enadata=enadata,
        line_weights=line_weights,
        points_for_projection=points_for_projection,
        rotation_matrix=rotation_matrix,
        eigenvalues=eigenvalues,
        points=points,
        center_vector=center_vector,
        node_positions=node_positions,
    )


def ena(
    data: str | Path | Sequence[Record],
    codes: Sequence[str],
    units: Sequence[str],
    conversation: Sequence[str],
    metadata: Sequence[str] | None = None,
    model: str = "EndPoint",
    window: str = "MovingStanzaWindow",
    window_size_back: int | float = 1,
    window_size_forward: int | float = 0,
    rotation: str = "svd",
    dimensions: int = 2,
    group_column: str | None = None,
    groups: tuple[object, object] | None = None,
) -> ENASet:
    enadata = accumulate_data(
        data=data,
        codes=codes,
        units=units,
        conversation=conversation,
        metadata=metadata,
        model=model,
        window=window,
        window_size_back=window_size_back,
        window_size_forward=window_size_forward,
    )
    return make_set(
        enadata=enadata,
        dimensions=dimensions,
        rotation=rotation,
        group_column=group_column,
        groups=groups,
    )


def mean_network(ena_set: ENASet, mask: Sequence[bool] | None = None) -> np.ndarray:
    matrix = ena_set.line_weights
    if mask is not None:
        matrix = matrix[np.asarray(mask, dtype=bool)]
    if matrix.shape[0] == 0:
        return np.zeros((matrix.shape[1],), dtype=float)
    return matrix.mean(axis=0)


def subtract_networks(network_a: np.ndarray, network_b: np.ndarray) -> np.ndarray:
    return np.asarray(network_a, dtype=float) - np.asarray(network_b, dtype=float)


def _vector_to_adjacency(vector: np.ndarray, codes: Sequence[str]) -> np.ndarray:
    size = len(codes)
    matrix = np.zeros((size, size), dtype=float)
    z = 0
    for right in range(1, size):
        for left in range(right):
            matrix[left, right] = vector[z]
            matrix[right, left] = vector[z]
            z += 1
    return matrix


def _rescale(values: np.ndarray, to_range: tuple[float, float], from_range: tuple[float, float] | None = None) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    if values.size == 0:
        return values.copy()
    if from_range is None:
        low = float(np.min(values))
        high = float(np.max(values))
    else:
        low, high = from_range
    to_low, to_high = to_range
    if math.isclose(high, low):
        return np.full(values.shape, (to_low + to_high) / 2.0, dtype=float)
    scaled = (values - low) / (high - low)
    return to_low + scaled * (to_high - to_low)


def plot_network(
    ena_set: ENASet,
    network: np.ndarray,
    title: str | None = None,
    ax=None,
    colors: tuple[str, str] = ("#ff0000", "#0000ff"),
    thickness: tuple[float, float] = (0.25, 2.25),
    saturation: tuple[float, float] = (0.15, 1.0),
    opacity: tuple[float, float] = (0.15, 0.95),
    scale_weights: bool = False,
    thin_lines_in_front: bool = False,
    multiplier: float = 1.0,
    node_size: tuple[float, float] = (15.0, 55.0),
):
    try:
        import matplotlib.pyplot as plt
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "matplotlib is required for plotting. Install it with `pip install matplotlib`."
        ) from exc

    if ax is None:
        _, ax = plt.subplots(figsize=(6, 6))

    adjacency = _vector_to_adjacency(network, ena_set.enadata.codes)
    coords = ena_set.node_positions
    if coords.shape[1] < 2:
        coords = np.column_stack([coords[:, 0], np.zeros(coords.shape[0])])

    edge_records: list[tuple[float, int, int]] = []
    for left in range(len(ena_set.enadata.codes)):
        for right in range(left + 1, len(ena_set.enadata.codes)):
            weight = float(adjacency[left, right])
            if weight != 0:
                edge_records.append((weight, left, right))

    if edge_records:
        raw = np.array([abs(weight) for weight, _, _ in edge_records], dtype=float)
        scaled_basis = raw.copy()
        if scale_weights and raw.max() > 0:
            scaled_basis = raw / raw.max()

        edge_thickness = _rescale(scaled_basis, thickness, from_range=(float(scaled_basis.min()), float(scaled_basis.max())))
        edge_saturation = _rescale(scaled_basis, saturation, from_range=(float(scaled_basis.min()), float(scaled_basis.max())))
        edge_opacity = _rescale(scaled_basis, opacity, from_range=(float(scaled_basis.min()), float(scaled_basis.max())))

        draw_order = np.argsort(edge_thickness)
        if thin_lines_in_front:
            draw_order = draw_order[::-1]

        import matplotlib.colors as mcolors

        pos_rgb = np.array(mcolors.to_rgb(colors[0]))
        neg_rgb = np.array(mcolors.to_rgb(colors[1]))
        white = np.array([1.0, 1.0, 1.0])
        node_weights = np.zeros(len(ena_set.enadata.codes), dtype=float)

        for idx in draw_order:
            weight, left, right = edge_records[idx]
            base = pos_rgb if weight >= 0 else neg_rgb
            sat = edge_saturation[idx]
            color = tuple(white * (1.0 - sat) + base * sat)
            node_weights[left] += abs(edge_thickness[idx])
            node_weights[right] += abs(edge_thickness[idx])
            ax.plot(
                [coords[left, 0], coords[right, 0]],
                [coords[left, 1], coords[right, 1]],
                linewidth=float(edge_thickness[idx]) * multiplier,
                color=color,
                alpha=float(edge_opacity[idx]),
            )
        if np.any(node_weights > 0):
            scaled_node_sizes = _rescale(
                node_weights / max(float(np.max(np.abs(node_weights))), 1e-9),
                node_size,
            )
        else:
            scaled_node_sizes = np.full(len(ena_set.enadata.codes), node_size[1], dtype=float)
    else:
        scaled_node_sizes = np.full(len(ena_set.enadata.codes), node_size[1], dtype=float)

    ax.scatter(coords[:, 0], coords[:, 1], color="#222222", s=scaled_node_sizes, zorder=3)
    for idx, label in enumerate(ena_set.enadata.codes):
        ax.text(coords[idx, 0], coords[idx, 1], f" {label}", va="center", ha="left")

    x_min = float(np.min(coords[:, 0]))
    x_max = float(np.max(coords[:, 0]))
    y_min = float(np.min(coords[:, 1]))
    y_max = float(np.max(coords[:, 1]))
    x_span = max(x_max - x_min, 1e-9)
    y_span = max(y_max - y_min, 1e-9)
    x_pad = x_span * 0.3
    y_pad = y_span * 0.3

    ax.set_title(title or "ENA Network")
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlim(x_min - x_pad, x_max + x_pad)
    ax.set_ylim(y_min - y_pad, y_max + y_pad)
    _apply_reference_axes(ax)
    return ax
