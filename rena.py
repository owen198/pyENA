from __future__ import annotations

import csv
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


def welch_ttest(x: np.ndarray, y: np.ndarray) -> dict[str, float | list[float]]:
    from scipy import stats

    x = np.asarray(x, dtype=float)
    y = np.asarray(y, dtype=float)
    result = stats.ttest_ind(x, y, equal_var=False)

    mean_diff = float(x.mean() - y.mean())
    var_x = float(np.var(x, ddof=1))
    var_y = float(np.var(y, ddof=1))
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


def save_figure(fig, path: str | Path) -> None:
    import matplotlib.pyplot as plt

    fig.savefig(path, dpi=200, bbox_inches="tight")
    plt.close(fig)


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
    node_weights = node_weights / lengths

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
        node_positions, centroids = _least_squares_node_positions(
            line_weights[non_zero_mask],
            points[non_zero_mask],
            len(enadata.codes),
        )
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
    x_pad = x_span * 0.2
    y_pad = y_span * 0.2

    ax.set_title(title or "ENA Network")
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlim(x_min - x_pad, x_max + x_pad)
    ax.set_ylim(y_min - y_pad, y_max + y_pad)
    ax.axhline(0, color="#cccccc", linewidth=0.8)
    ax.axvline(0, color="#cccccc", linewidth=0.8)
    return ax
