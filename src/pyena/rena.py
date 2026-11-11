from __future__ import annotations

import csv
import json
from .reporting import json_safe
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Mapping, Sequence

import numpy as np


Record = Mapping[str, object]
DEFAULT_FIGSIZE = (7, 7)


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
    eigenvalues = singular_values[:dims] ** 2 / max(len(points_for_projection) - 1, 1)
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
        raise ValueError("Means rotation is undefined when group mean networks coincide.")

    primary_axis = mean_diff / diff_norm
    residual = data - np.outer(data @ primary_axis, primary_axis)

    if dimensions <= 1:
        rotation = primary_axis.reshape(-1, 1)
        return rotation, np.array([], dtype=float)

    _, singular_values, vt = np.linalg.svd(residual, full_matrices=False)
    remainder = vt[: max(dimensions - 1, 0)].T
    rotation = np.column_stack([primary_axis, remainder[:, : dimensions - 1]])
    eigenvalues = np.array([], dtype=float)  # rENA means rotation does not supply eigenvalues.
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
    ordered: bool = False
    accumulation_options: dict[str, object] = field(default_factory=dict)


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
    rotation_method: str = "unknown"
    centroids: np.ndarray | None = None
    fit_metadata: dict[str, object] = field(default_factory=dict)
    rotation_set: object | None = None
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


def _test_vector(values: np.ndarray, minimum: int, name: str) -> np.ndarray:
    values = np.asarray(values, dtype=float)
    if values.ndim != 1 or not np.all(np.isfinite(values)):
        raise ValueError(f"{name} requires a finite one-dimensional sample.")
    if values.size < minimum:
        raise ValueError(f"{name} requires at least {minimum} observations per group.")
    return values


def ena_correlations(points: np.ndarray, centroids: np.ndarray) -> dict[str, dict[str, float]]:
    """rENA::ena.correlations: correlate all pairwise differences, per axis.

    These are not correlations of the original unit-coordinate columns.
    """
    from scipy import stats

    points, centroids = np.asarray(points, float), np.asarray(centroids, float)
    if points.ndim != 2 or points.shape != centroids.shape:
        raise ValueError("Points and centroids must have matching matrix shapes.")
    i, j = np.triu_indices(len(points), 1)
    p, c = points[i]-points[j], centroids[i]-centroids[j]
    result = {}
    for dim in range(points.shape[1]):
        valid = len(p) >= 2 and np.ptp(p[:, dim]) > 0 and np.ptp(c[:, dim]) > 0
        result[f"dimension_{dim+1}"] = {
            "pearson": float(stats.pearsonr(p[:, dim], c[:, dim]).statistic) if valid else float('nan'),
            "spearman": float(stats.spearmanr(p[:, dim], c[:, dim]).statistic) if valid else float('nan'),
        }
    return result


def ena_correlation(points: np.ndarray, centroids: np.ndarray, conf_level: float = .95) -> np.ndarray:
    """rENA::ena_correlation: Pearson r and Fisher CI using pair count.

    Reproduces the package formula; pairs share units and are not independent.
    """
    from scipy import stats

    if not 0 < conf_level < 1:
        raise ValueError("conf_level must be between zero and one.")
    correlations = ena_correlations(points, centroids)
    pair_count = len(points)*(len(points)-1)//2
    out = []
    for values in correlations.values():
        r = values["pearson"]
        if pair_count > 3 and np.isfinite(r):
            if abs(r) >= 1:
                lo = hi = r
            else:
                margin = stats.norm.ppf((1+conf_level)/2)/np.sqrt(pair_count-3)
                lo, hi = np.tanh([np.arctanh(r)-margin, np.arctanh(r)+margin])
        else:
            lo = hi = float('nan')
        out.append([r, float(lo), float(hi)])
    return np.asarray(out)


def summarize_group(
    ena_set: ENASet,
    metadata_key: str,
    group_value: object,
    method: Callable[[np.ndarray], float] = np.mean,
) -> dict[str, object]:
    """Aggregate each point/edge column, like rENA::ena.group(method=...).

    Pass np.median or a scalar callable for another summary statistic.
    """
    mask = group_mask(ena_set, metadata_key, group_value)
    if not mask.any():
        raise ValueError("The selected group contains no units.")
    return {
        "n": int(mask.sum()),
        "points": np.apply_along_axis(method, 0, ena_set.points[mask]),
        "line_weights": np.apply_along_axis(method, 0, ena_set.line_weights[mask]),
    }



def welch_ttest(x: np.ndarray, y: np.ndarray) -> dict[str, object]:
    """Two-sided Welch test; absolute Cohen's d matches rENA::fun_cohens.d.

    signed_cohens_d retains the directional effect reported by older pyENA.
    """
    from scipy import stats

    x = _test_vector(x, 2, "Welch t-test")
    y = _test_vector(y, 2, "Welch t-test")
    nx, ny = len(x), len(y)
    vx, vy = x.var(ddof=1), y.var(ddof=1)
    se = np.sqrt(vx / nx + vy / ny)
    if se < 10 * np.finfo(float).eps * max(abs(x.mean()), abs(y.mean())) or se == 0:
        raise ValueError("Welch t-test is undefined: data are essentially constant.")
    result = stats.ttest_ind(x, y, equal_var=False)
    df = (vx/nx + vy/ny)**2 / ((vx/nx)**2/(nx-1) + (vy/ny)**2/(ny-1))
    diff = float(x.mean() - y.mean())
    margin = stats.t.ppf(.975, df) * se
    pooled = np.sqrt(((nx-1)*vx + (ny-1)*vy)/(nx+ny-2))
    signed_d = diff / pooled
    return {
        "t_statistic": float(result.statistic), "p_value": float(result.pvalue),
        "degrees_of_freedom": float(df), "standard_error": float(se),
        "mean_x": float(x.mean()), "mean_y": float(y.mean()),
        "sd_x": float(x.std(ddof=1)), "sd_y": float(y.std(ddof=1)),
        "n_x": nx, "n_y": ny,
        "confidence_interval_95": [float(diff-margin), float(diff+margin)],
        "cohens_d": float(abs(signed_d)), "signed_cohens_d": float(signed_d),
        "alternative": "two-sided", "null_difference": 0.0,
        "method": "Welch Two Sample t-test",
    }


def mann_whitney(x: np.ndarray, y: np.ndarray) -> dict[str, object]:
    """Match stats::wilcox.test defaults in R 4.5.2 (rENA 0.3.0).

    R's two-sample W is the first sample's U, not min(Ux, Uy).
    """
    from scipy import stats

    x = _test_vector(x, 1, "Mann-Whitney U")
    y = _test_vector(y, 1, "Mann-Whitney U")
    combined = np.concatenate([x, y])
    ties = np.unique(combined).size != combined.size
    exact = len(x) < 50 and len(y) < 50 and not ties
    method = "exact" if exact else "asymptotic"
    result = stats.mannwhitneyu(x, y, alternative="two-sided", method=method,
                                use_continuity=not exact)
    u = float(result.statistic)
    other = float(len(x)*len(y)-u)
    # R returns an undefined p-value when every observation is identical.
    p = float('nan') if np.unique(combined).size == 1 else float(result.pvalue)
    z = stats.norm.ppf(p/2)
    return {
        "u_statistic": u, "u_complement": other, "u_min": min(u, other),
        "w_statistic_r_style": u, "p_value": p,
        "median_x": float(np.median(x)), "median_y": float(np.median(y)),
        "n_x": len(x), "n_y": len(y),
        "effect_r_approx": float(abs(z)/np.sqrt(len(combined))),
        "rank_biserial_correlation": 2*u/(len(x)*len(y))-1,
        "method": method, "ties_present": bool(ties),
        "continuity_correction": not exact, "alternative": "two-sided",
        "null_location_shift": 0.0,
    }


def summarize_group_point_tests(
    group_a_points: np.ndarray,
    group_b_points: np.ndarray,
    test_labels: Sequence[str] | None = None,
) -> dict[str, dict[str, dict[str, float | list[float]]]]:
    group_a_points = np.asarray(group_a_points, dtype=float)
    group_b_points = np.asarray(group_b_points, dtype=float)

    if group_a_points.ndim != 2 or group_b_points.ndim != 2:
        raise ValueError("Group point arrays must both be two-dimensional.")
    if group_a_points.shape[1] != group_b_points.shape[1]:
        raise ValueError(
            "Group point arrays must have the same number of ENA dimensions, "
            f"but received {group_a_points.shape[1]} and {group_b_points.shape[1]}."
        )
    if group_a_points.shape[1] == 0:
        raise ValueError("Group point arrays must contain at least one ENA dimension.")

    if test_labels is None:
        labels = [f"dimension_{dim_idx + 1}" for dim_idx in range(group_a_points.shape[1])]
    else:
        labels = list(test_labels)
        if len(labels) != group_a_points.shape[1]:
            raise ValueError(
                "test_labels must contain one label per ENA dimension, "
                f"but received {len(labels)} labels for {group_a_points.shape[1]} dimensions."
            )

    return {
        "welch_t_test": {
            label: welch_ttest(group_a_points[:, dim_idx], group_b_points[:, dim_idx])
            for dim_idx, label in enumerate(labels)
        },
        "mann_whitney_u": {
            label: mann_whitney(group_a_points[:, dim_idx], group_b_points[:, dim_idx])
            for dim_idx, label in enumerate(labels)
        },
    }


def one_way_anova(x: np.ndarray, y: np.ndarray) -> dict[str, float]:
    """Two-group classical ANOVA using nonnegative sums of squares.

    Computing the between-group term from the mean difference avoids the
    negative roundoff F values (and NaN p values) that f_oneway can return when
    means-rotation groups coincide on a residual dimension.
    """
    from scipy import stats

    x = _test_vector(x, 2, "One-way ANOVA")
    y = _test_vector(y, 2, "One-way ANOVA")
    n_x, n_y = len(x), len(y)
    mean_x, mean_y = float(x.mean()), float(y.mean())
    between = (n_x * n_y / (n_x + n_y)) * (mean_x - mean_y) ** 2
    within = float(np.sum((x - mean_x) ** 2) + np.sum((y - mean_y) ** 2))
    if within == 0:
        f_statistic = float("inf") if between > 0 else float("nan")
    else:
        f_statistic = between / (within / (n_x + n_y - 2))
    return {
        "f_statistic": float(f_statistic),
        "p_value": float(stats.f.sf(f_statistic, 1, n_x + n_y - 2)),
        "mean_x": mean_x,
        "mean_y": mean_y,
        "n_x": n_x,
        "n_y": n_y,
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
    from .pipeline import network_centroids
    centroids = ena_set.centroids
    if centroids is None:
        centroids = network_centroids(ena_set.line_weights, ena_set.node_positions, ena_set.enadata)
    return {
        "co_registration_correlations": ena_correlations(ena_set.points, centroids),
        "pearson_confidence_interval_95": ena_correlation(ena_set.points, centroids).tolist(),
        "n_units": len(ena_set.points),
        "n_pairs": len(ena_set.points)*(len(ena_set.points)-1)//2,
        "definition": "Pairwise point differences versus pairwise network-centroid differences (rENA)",
        "ci_note": "Fisher interval reproduces the package pair-count formula; pairs share units.",
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


def _mean_point_and_ci(points: np.ndarray) -> dict[str, object]:
    from scipy import stats

    points = np.asarray(points, dtype=float)
    if points.ndim != 2 or not len(points) or not np.all(np.isfinite(points)):
        raise ValueError("Group summaries require a non-empty finite points matrix.")
    n = len(points)
    mean = points.mean(axis=0)
    sd = points.std(axis=0, ddof=1) if n > 1 else np.full(points.shape[1], np.nan)
    margin = stats.t.ppf(.975, n-1) * sd / np.sqrt(n) if n > 1 else sd
    iqr = np.percentile(points, 75, axis=0) - np.percentile(points, 25, axis=0)
    return {
        "n": n, "mean_point": mean.tolist(),
        "median_point": np.median(points, axis=0).tolist(),
        "sd": sd.tolist(), "iqr": iqr.tolist(),
        "confidence_interval_95": {f"dimension_{i+1}": [float(mean[i]-margin[i]), float(mean[i]+margin[i])]
                                   for i in range(points.shape[1])},
        "outlier_interval_offsets": [[float(-1.5*v), float(1.5*v)] for v in iqr],
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
    total_variance = float(np.var(ena_set.points_for_projection, axis=0, ddof=1).sum())
    explained_variance_ratio = (np.var(ena_set.points, axis=0, ddof=1) / total_variance
                                if total_variance > 0 else np.full(ena_set.points.shape[1], np.nan))
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
            "eigenvalues": ena_set.eigenvalues.tolist() if ena_set.eigenvalues.size else None,
            "rotation_method": ena_set.rotation_method,
            "ordered": ena_set.enadata.ordered,
            "explained_variance_ratio": [float(value) for value in explained_variance_ratio],
        },
        "points": {
            "group_a": _mean_point_and_ci(group_a_points),
            "group_b": _mean_point_and_ci(group_b_points),
        },
        "statistics": {
            **summarize_group_point_tests(group_a_points, group_b_points),
            "anova": {
                f"dimension_{dim_idx + 1}": one_way_anova(
                    group_a_points[:, dim_idx],
                    group_b_points[:, dim_idx],
                )
                for dim_idx in range(group_a_points.shape[1])
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


def _set_square_axis_limits(
    ax,
    x_min: float,
    x_max: float,
    y_min: float,
    y_max: float,
    pad_ratio: float = 0.3,
) -> None:
    x_center = (x_min + x_max) / 2.0
    y_center = (y_min + y_max) / 2.0
    square_span = max(x_max - x_min, y_max - y_min, 1e-9)
    padded_half_span = square_span * (1.0 + pad_ratio) / 2.0
    ax.set_xlim(x_center - padded_half_span, x_center + padded_half_span)
    ax.set_ylim(y_center - padded_half_span, y_center + padded_half_span)


def create_points_ci_plot(
    points: np.ndarray,
    color: str,
    label: str,
    title: str,
    figsize: tuple[float, float] = DEFAULT_FIGSIZE,
):
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=figsize)
    plot_points_with_ci(ax, points, color, label)
    _apply_reference_axes(ax)
    ax.legend()
    return fig, ax


def create_points_ci_overlay_plot(
    point_groups: Sequence[tuple[np.ndarray, str, str]],
    title: str,
    figsize: tuple[float, float] = DEFAULT_FIGSIZE,
):
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=figsize)
    for points, color, label in point_groups:
        plot_points_with_ci(ax, points, color, label)
    _apply_reference_axes(ax)
    ax.legend()
    return fig, ax


def create_network_plot(
    ena_set: ENASet,
    network: np.ndarray,
    title: str,
    figsize: tuple[float, float] = DEFAULT_FIGSIZE,
    show_legend: bool = False,
    legend_labels: tuple[str, str] = ("Positive edges", "Negative edges"),
    line_colors: tuple[str, str] = ("#ff0000", "#0000ff"),
):
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=figsize)
    plot_network(
        ena_set,
        network,
        title=title,
        ax=ax,
        colors=line_colors,
        show_legend=show_legend,
        legend_labels=legend_labels,
    )
    return fig, ax


def create_network_with_point_groups_plot(
    ena_set: ENASet,
    network: np.ndarray,
    point_groups: Sequence[dict[str, object]],
    title: str,
    figsize: tuple[float, float] = DEFAULT_FIGSIZE,
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
    figsize: tuple[float, float] = DEFAULT_FIGSIZE,
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
    fig.savefig(path, dpi=300)
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
            show_legend=True,
            legend_labels=(
                f"Stronger in {group_a_label}",
                f"Stronger in {group_b_label}",
            ),
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
    summary_path.write_text(json.dumps(json_safe(analysis_summary), indent=2, allow_nan=False), encoding="utf-8")

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
    data: str | Path | Sequence[Record], codes: Sequence[str], units: Sequence[str],
    conversation: Sequence[str], metadata: Sequence[str] | None = None,
    model: str = "EndPoint", window: str = "MovingStanzaWindow",
    window_size_back: int | float = 1, window_size_forward: int | float = 0,
    weight_by: str | Callable = "binary", *, mask: np.ndarray | None = None,
    ordered: bool = False, include_self: bool = True,
) -> ENAData:
    """Accumulate finite nonnegative codes in input order within each conversation.

    Backward zero and one both include the current row. Conversation windows
    aggregate once per unit/conversation. A callable transforms each edge value
    after co-occurrence construction, as in rENA's weight.by.

    Ordered windows represent prior-code -> current-code transitions; this
    explicit convention is experimental and is not tma context-tensor parity.
    """
    if ordered:
        import warnings
        warnings.warn("Ordered accumulation uses native temporal-transition semantics; rENA/tma context-tensor parity is not established.",RuntimeWarning,stacklevel=2)
    records = _coerce_records(data)
    if not records:
        raise ValueError("ENA accumulation requires at least one input row.")
    codes, units, conversation = _as_list(codes), _as_list(units), _as_list(conversation)
    metadata = _as_list(metadata or [])
    if len(codes) < 2 or len(set(codes)) != len(codes) or not units or not conversation:
        raise ValueError("Provide distinct codes (at least two), unit and conversation columns.")
    for row in records:
        missing = set(codes + units + conversation + metadata) - row.keys()
        if missing:
            raise ValueError(f"Missing input columns: {sorted(missing)}")
    if model not in {"EndPoint", "AccumulatedTrajectory", "SeparateTrajectory"}:
        raise ValueError("Unsupported ENA model.")
    if window not in {"MovingStanzaWindow", "Conversation"}:
        raise ValueError("Unsupported ENA window.")
    for size in [window_size_back, window_size_forward]:
        if not (np.isposinf(size) or (np.isfinite(size) and size >= 0 and int(size) == size)):
            raise ValueError("Window sizes must be nonnegative integers or positive infinity.")
    if not callable(weight_by) and weight_by not in {"binary", "count", "counts"}:
        raise ValueError("weight_by must be 'binary', 'count' or a scalar callable.")
    row_codes = np.array([[_coerce_code_value(r[c]) for c in codes] for r in records], float)
    if not np.isfinite(row_codes).all() or (row_codes < 0).any():
        raise ValueError("ENA code values must be finite and nonnegative.")
    pairs = ([(i, j) for j in range(len(codes)) for i in range(len(codes))
              if include_self or i != j] if ordered else
             [(i,j) for j in range(1,len(codes)) for i in range(j)])
    labels = [f"{codes[i]}{'->' if ordered else '__'}{codes[j]}" for i,j in pairs]
    if mask is None:
        edge_mask = np.ones(len(pairs))
    else:
        mask = np.asarray(mask, float)
        edge_mask = np.array([mask[i,j] for i,j in pairs]) if mask.shape == (len(codes),len(codes)) else mask
        if edge_mask.shape != (len(pairs),) or not np.isfinite(edge_mask).all():
            raise ValueError("mask must be a finite code-by-code matrix or edge vector.")
    unit_keys = [_merge_key(r, units) for r in records]
    conv_keys = [_merge_key(r, conversation) for r in records]
    contexts = {}
    for i,k in enumerate(conv_keys):
        key = (k, unit_keys[i]) if window == "Conversation" else k
        contexts.setdefault(key, []).append(i)
    row_vectors, row_units, row_convs, row_indices = [], [], [], []
    def transform(matrix):
        v = np.array([matrix[i,j] for i,j in pairs])
        if weight_by == "binary":
            v = (v > 0).astype(float)
        elif callable(weight_by):
            v = np.array([weight_by(float(x)) for x in v],float)
        if not np.isfinite(v).all():
            raise ValueError("weight_by produced nonfinite values.")
        return v
    for indices in contexts.values():
        if window == "Conversation":
            summed = row_codes[indices].sum(axis=0)
            if ordered:
                raise ValueError("Ordered Conversation windows are ambiguous; use MovingStanzaWindow.")
            row_vectors.append(transform(np.outer(summed,summed)))
            row_units.append(unit_keys[indices[0]]);row_convs.append(conv_keys[indices[0]]);row_indices.append(indices[0])
            continue
        for local, idx in enumerate(indices):
            start = 0 if np.isinf(window_size_back) else max(0,local-max(int(window_size_back)-1,0))
            stop = len(indices) if np.isinf(window_size_forward) else min(len(indices),local+int(window_size_forward)+1)
            selected = indices[start:stop]
            if ordered:
                past = indices[start:local]
                mat = np.outer(row_codes[past].sum(axis=0),row_codes[idx]) if past else np.zeros((len(codes),len(codes)))
                if window_size_forward:
                    future = indices[local+1:stop]
                    mat += np.outer(row_codes[idx],row_codes[future].sum(axis=0))
            else:
                summed = row_codes[selected].sum(axis=0)
                mat = np.outer(summed,summed)
                # rENA 0.3.0 subtracts a head count based on the REQUESTED
                # forward window, including when the window is truncated at
                # the end. Preserve that observable count-weight behavior.
                head_count = (max(0, len(selected)-1-int(window_size_forward))
                              if window_size_back > 1 and local > 0 and np.isfinite(window_size_forward) else 0)
                for subset in (selected[:head_count],indices[local+1:stop]):
                    if subset:
                        part = row_codes[subset].sum(axis=0)
                        mat -= np.outer(part,part)
            row_vectors.append(transform(mat));row_units.append(unit_keys[idx]);row_convs.append(conv_keys[idx]);row_indices.append(idx)
    # Restore input appearance order after grouping contexts.
    order = np.argsort(row_indices,kind="stable")
    row_vectors = np.asarray(row_vectors)[order]
    row_units = [row_units[i] for i in order];row_convs=[row_convs[i] for i in order]
    row_indices = [row_indices[i] for i in order]
    grouped, group_meta = {}, {}
    for v,u,c,idx in zip(row_vectors,row_units,row_convs,row_indices):
        key = u if model == "EndPoint" else (u,c)
        grouped.setdefault(key,np.zeros(len(pairs)))
        grouped[key] += v
        group_meta.setdefault(key,{col:records[idx][col] for col in metadata})
    keys = list(grouped)
    # rENA's accumulated trajectories are grouped by unit, retaining step appearance order.
    if model == "AccumulatedTrajectory":
        keys = [k for u in dict.fromkeys(row_units) for k in keys if k[0] == u]
    accumulated, running = [], {}
    for k in keys:
        v = grouped[k].copy()
        if model == "AccumulatedTrajectory":
            running.setdefault(k[0],np.zeros(len(pairs)));running[k[0]] += v;v=running[k[0]].copy()
        accumulated.append(v * edge_mask)
    options = dict(weight_by=weight_by, mask=None if mask is None else np.asarray(mask).copy(),
                   include_self=include_self)
    return ENAData(records=records,codes=codes,units=units,conversation=conversation,metadata=metadata,
        model=model,window=window,window_size_back=window_size_back,window_size_forward=window_size_forward,
        unit_keys=keys if model == "EndPoint" else [k[0] for k in keys],
        conversation_keys=conv_keys,edge_labels=labels,adjacency_vectors=row_vectors,
        accumulated_vectors=np.array(accumulated),unit_labels=["::".join(map(str,k if model == "EndPoint" else k[0]+k[1])) for k in keys],
        unit_metadata=[group_meta[k] for k in keys],trajectory_steps=None if model == "EndPoint" else [k[1] for k in keys],
        ordered=ordered,accumulation_options=options)


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


def make_set(enadata: ENAData, dimensions: int = 2, rotation="svd",
             group_column: str | None = None, groups: tuple | None = None, **options) -> ENASet:
    from .pipeline import fit_model
    try:
        return fit_model(enadata, dimensions=dimensions, rotation=rotation,
                         group_column=group_column, groups=groups, **options)
    except np.linalg.LinAlgError as exc:
        if enadata.ordered:
            raise ValueError("Directed node positioning failed: rank-deficient system. Choose node_position_method='lstsq' explicitly to use a robust solver.") from exc
        weights=sphere_normalize(enadata.accumulated_vectors)
        raise ValueError(_format_singular_matrix_diagnostics(
            enadata=enadata,line_weights=weights,non_zero_mask=np.linalg.norm(weights,axis=1)>0)) from exc


def ena(data, codes, units, conversation, metadata=None, model="EndPoint",
        window="MovingStanzaWindow", window_size_back=1, window_size_forward=0,
        rotation="svd", dimensions=2, group_column=None, groups=None, *,
        weight_by="binary", mask=None, ordered=False, include_self=True, **options):
    enadata = accumulate_data(data, codes, units, conversation, metadata, model, window,
                             window_size_back, window_size_forward, weight_by,
                             mask=mask, ordered=ordered, include_self=include_self)
    return make_set(enadata, dimensions, rotation, group_column, groups, **options)


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
    show_legend: bool = False,
    legend_labels: tuple[str, str] = ("Positive edges", "Negative edges"),
    thickness: tuple[float, float] = (0.25, 2.25),
    saturation: tuple[float, float] = (0.15, 1.0),
    opacity: tuple[float, float] = (0.15, 0.95),
    scale_weights: bool = False,
    thin_lines_in_front: bool = False,
    multiplier: float = 1.0,
    node_size: tuple[float, float] = (15.0, 55.0),
):
    if ena_set.enadata.ordered:
        from .visualization import ena_plot, add_network
        import matplotlib.pyplot as plt
        plot=ena_plot(ena_set,title or 'Directed ENA')
        if ax is not None:
            plt.close(plot.figure);plot.figure=ax.figure;plot.ax=ax
        add_network(plot,network,colors=colors,multiplier=multiplier*5,thin_lines_in_front=thin_lines_in_front)
        return plot.ax
    try:
        import matplotlib.pyplot as plt
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "matplotlib is required for plotting. Install it with `pip install matplotlib`."
        ) from exc

    if ax is None:
        _, ax = plt.subplots(figsize=DEFAULT_FIGSIZE)

    legend_handles = None
    if show_legend:
        from matplotlib.lines import Line2D

        legend_handles = [
            Line2D([0], [0], color=colors[0], lw=2.5, label=legend_labels[0]),
            Line2D([0], [0], color=colors[1], lw=2.5, label=legend_labels[1]),
        ]

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

    ax.set_aspect("equal", adjustable="box")
    _set_square_axis_limits(ax, x_min, x_max, y_min, y_max)
    _apply_reference_axes(ax)
    if legend_handles is not None:
        ax.legend(handles=legend_handles)
    return ax


def fun_cohens_d(x, y):
    """rENA's absolute pooled-sample-SD Cohen's d (including undefined values)."""
    x=_test_vector(x,2,"Cohen's d");y=_test_vector(y,2,"Cohen's d")
    pooled=np.sqrt(((len(x)-1)*np.var(x,ddof=1)+(len(y)-1)*np.var(y,ddof=1))/(len(x)+len(y)-2))
    with np.errstate(divide='ignore',invalid='ignore'):
        return float(np.divide(abs(np.mean(x)-np.mean(y)),pooled))


def ena_group(ena_set, by, method=np.mean, names=None):
    """Aggregate points and edge columns by metadata, group keys or a row mask."""
    n=len(ena_set.points)
    if isinstance(by,str):keys=[m[by] for m in ena_set.enadata.unit_metadata]
    else:
        values=np.asarray(by)
        if values.dtype==bool:
            if values.shape!=(n,):raise ValueError("Group mask length mismatch.")
            if not values.any():raise ValueError("Group is empty.")
            return {names or 'selected':{'n':int(values.sum()),
                'points':np.apply_along_axis(method,0,ena_set.points[values]),
                'line_weights':np.apply_along_axis(method,0,ena_set.line_weights[values])}}
        keys=[tuple(k) if isinstance(k,(list,np.ndarray)) else k for k in by]
    if len(keys)!=n:raise ValueError("One grouping value per unit is required.")
    result={}
    for key in dict.fromkeys(keys):
        mask=np.array([k==key for k in keys])
        result[key]={'n':int(mask.sum()),'points':np.apply_along_axis(method,0,ena_set.points[mask]),
                      'line_weights':np.apply_along_axis(method,0,ena_set.line_weights[mask])}
    return result