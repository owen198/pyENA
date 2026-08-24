from __future__ import annotations

from pathlib import Path

import numpy as np

from .rena import (
    ENASet,
    _rescale,
    _vector_to_adjacency,
)


def plot_network_3d(
    ena_set: ENASet,
    network: np.ndarray,
    title: str | None = None,
    colors: tuple[str, str] = ("#ff0000", "#0000ff"),
    thickness: tuple[float, float] = (1.0, 8.0),
    node_size: float = 8.0,
):
    try:
        import plotly.graph_objects as go
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "plotly is required for 3D plotting. "
            "Install it with `pip install plotly`."
        ) from exc

    coords = np.asarray(
        ena_set.node_positions,
        dtype=float,
    )

    if coords.ndim != 2:
        raise ValueError(
            "ena_set.node_positions must be a 2D array."
        )

    if coords.shape[1] < 3:
        raise ValueError(
            "3D plotting requires at least 3 ENA dimensions. "
            f"Received node_positions shape {coords.shape}. "
            "Run ena(..., dimensions=3) first."
        )

    network = np.asarray(
        network,
        dtype=float,
    )

    adjacency = _vector_to_adjacency(
        network,
        ena_set.enadata.codes,
    )

    edge_records = []

    for left in range(
        len(ena_set.enadata.codes)
    ):
        for right in range(
            left + 1,
            len(ena_set.enadata.codes),
        ):
            weight = float(
                adjacency[left, right]
            )

            if weight != 0:
                edge_records.append(
                    (
                        weight,
                        left,
                        right,
                    )
                )

    fig = go.Figure()

    # ---------------------------------------------------------
    # Edges
    # ---------------------------------------------------------

    if edge_records:
        raw_weights = np.asarray(
            [
                abs(weight)
                for weight, _, _ in edge_records
            ],
            dtype=float,
        )

        scaled_widths = _rescale(
            raw_weights,
            thickness,
            from_range=(
                float(raw_weights.min()),
                float(raw_weights.max()),
            ),
        )

        for edge_idx, (
            weight,
            left,
            right,
        ) in enumerate(edge_records):

            edge_color = (
                colors[0]
                if weight >= 0
                else colors[1]
            )

            left_label = (
                ena_set.enadata.codes[left]
            )

            right_label = (
                ena_set.enadata.codes[right]
            )

            fig.add_trace(
                go.Scatter3d(
                    x=[
                        coords[left, 0],
                        coords[right, 0],
                    ],
                    y=[
                        coords[left, 1],
                        coords[right, 1],
                    ],
                    z=[
                        coords[left, 2],
                        coords[right, 2],
                    ],
                    mode="lines",
                    line=dict(
                        color=edge_color,
                        width=float(
                            scaled_widths[
                                edge_idx
                            ]
                        ),
                    ),
                    hovertemplate=(
                        f"{left_label} ↔ {right_label}"
                        "<br>"
                        f"Weight: {weight:.4f}"
                        "<extra></extra>"
                    ),
                    showlegend=False,
                )
            )

    # ---------------------------------------------------------
    # Nodes
    # ---------------------------------------------------------

    node_hover = []

    for code, xyz in zip(
        ena_set.enadata.codes,
        coords,
    ):
        node_hover.append(
            (
                f"<b>{code}</b>"
                f"<br>Dimension 1: {xyz[0]:.4f}"
                f"<br>Dimension 2: {xyz[1]:.4f}"
                f"<br>Dimension 3: {xyz[2]:.4f}"
            )
        )

    fig.add_trace(
        go.Scatter3d(
            x=coords[:, 0],
            y=coords[:, 1],
            z=coords[:, 2],
            mode="markers+text",
            marker=dict(
                size=node_size,
                color="#222222",
            ),
            text=ena_set.enadata.codes,
            textposition="top center",
            hovertext=node_hover,
            hovertemplate=(
                "%{hovertext}"
                "<extra></extra>"
            ),
            name="Codes",
        )
    )

    # ---------------------------------------------------------
    # Layout
    # ---------------------------------------------------------

    fig.update_layout(
        title=(
            title
            or "3D ENA Network"
        ),
        scene=dict(
            xaxis_title=(
                "ENA Dimension 1"
            ),
            yaxis_title=(
                "ENA Dimension 2"
            ),
            zaxis_title=(
                "ENA Dimension 3"
            ),
            aspectmode="data",
        ),
        margin=dict(
            l=0,
            r=0,
            b=0,
            t=50,
        ),
    )

    return fig


def plot_network_with_points_3d(
    ena_set: ENASet,
    network: np.ndarray,
    point_groups: list[dict[str, object]],
    title: str | None = None,
    colors: tuple[str, str] = (
        "#ff0000",
        "#0000ff",
    ),
    thickness: tuple[
        float,
        float,
    ] = (
        1.0,
        8.0,
    ),
    node_size: float = 8.0,
):
    try:
        import plotly.graph_objects as go
    except ModuleNotFoundError as exc:
        raise ModuleNotFoundError(
            "plotly is required for 3D plotting. "
            "Install it with `pip install plotly`."
        ) from exc

    fig = plot_network_3d(
        ena_set=ena_set,
        network=network,
        title=title,
        colors=colors,
        thickness=thickness,
        node_size=node_size,
    )

    # ---------------------------------------------------------
    # Unit points
    # ---------------------------------------------------------

    for group in point_groups:

        points = np.asarray(
            group["points"],
            dtype=float,
        )

        if (
            points.ndim != 2
            or points.shape[1] < 3
        ):
            raise ValueError(
                "3D point groups must have "
                "shape (n, 3) or greater."
            )

        color = str(
            group.get(
                "color",
                "#666666",
            )
        )

        label = str(
            group.get(
                "label",
                "Group",
            )
        )

        size = float(
            group.get(
                "size",
                5.0,
            )
        )

        alpha = float(
            group.get(
                "alpha",
                0.75,
            )
        )

        unit_labels = group.get(
            "unit_labels"
        )

        # -----------------------------------------------------
        # Hover labels
        # -----------------------------------------------------

        if unit_labels is None:
            hover_text = [
                (
                    f"<b>{label}</b>"
                    f"<br>Dimension 1: "
                    f"{point[0]:.4f}"
                    f"<br>Dimension 2: "
                    f"{point[1]:.4f}"
                    f"<br>Dimension 3: "
                    f"{point[2]:.4f}"
                )
                for point in points
            ]

        else:
            hover_text = [
                (
                    f"<b>{unit_label}</b>"
                    f"<br>Group: {label}"
                    f"<br>Dimension 1: "
                    f"{point[0]:.4f}"
                    f"<br>Dimension 2: "
                    f"{point[1]:.4f}"
                    f"<br>Dimension 3: "
                    f"{point[2]:.4f}"
                )
                for unit_label, point
                in zip(
                    unit_labels,
                    points,
                )
            ]

        # -----------------------------------------------------
        # Individual unit points
        # -----------------------------------------------------

        fig.add_trace(
            go.Scatter3d(
                x=points[:, 0],
                y=points[:, 1],
                z=points[:, 2],
                mode="markers",
                marker=dict(
                    size=size,
                    color=color,
                    opacity=alpha,
                ),
                hovertext=hover_text,
                hovertemplate=(
                    "%{hovertext}"
                    "<extra></extra>"
                ),
                name=label,
            )
        )

        # -----------------------------------------------------
        # Group mean point
        # -----------------------------------------------------

        if bool(
            group.get(
                "show_mean",
                True,
            )
        ):
            mean_point = (
                points.mean(
                    axis=0
                )
            )

            mean_size = float(
                group.get(
                    "mean_size",
                    9.0,
                )
            )

            fig.add_trace(
                go.Scatter3d(
                    x=[
                        mean_point[0]
                    ],
                    y=[
                        mean_point[1]
                    ],
                    z=[
                        mean_point[2]
                    ],
                    mode="markers",
                    marker=dict(
                        size=mean_size,
                        color=color,
                        symbol="diamond",
                        line=dict(
                            color="black",
                            width=2,
                        ),
                    ),
                    hovertemplate=(
                        f"<b>{label} Mean</b>"
                        f"<br>Dimension 1: "
                        f"{mean_point[0]:.4f}"
                        f"<br>Dimension 2: "
                        f"{mean_point[1]:.4f}"
                        f"<br>Dimension 3: "
                        f"{mean_point[2]:.4f}"
                        "<extra></extra>"
                    ),
                    name=(
                        f"{label} Mean"
                    ),
                    showlegend=True,
                )
            )

    return fig


def save_figure_html(
    fig,
    path: str | Path,
) -> None:
    path = Path(path)

    path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    fig.write_html(
        str(path),
        include_plotlyjs=True,
        full_html=True,
    )

def generate_analysis_outputs_3d(
    ena_set: ENASet,
    group_column: str,
    groups: tuple[str, str],
    output_dir: str | Path = "outputs_3d",
    group_colors: tuple[str, str] = ("#ff0000", "#0000ff"),
    thickness: tuple[float, float] = (1.0, 8.0),
    node_size: float = 8.0,
    point_size: float = 5.0,
    point_alpha: float = 0.7,
    show_mean: bool = True,
) -> dict[str, Path]:
    from .rena import (
        group_network,
        group_points,
    )

    if len(groups) != 2:
        raise ValueError(
            "generate_analysis_outputs_3d currently requires exactly two groups."
        )

    output_dir = Path(output_dir)
    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    group_a, group_b = groups
    color_a, color_b = group_colors

    # ---------------------------------------------------------
    # Group networks
    # ---------------------------------------------------------

    network_a = group_network(
        ena_set,
        group_column,
        group_a,
    )

    network_b = group_network(
        ena_set,
        group_column,
        group_b,
    )

    subtracted_network = (
        network_a
        - network_b
    )

    # ---------------------------------------------------------
    # Group points
    # ---------------------------------------------------------

    points_a = group_points(
        ena_set,
        group_column,
        group_a,
    )

    points_b = group_points(
        ena_set,
        group_column,
        group_b,
    )

    # ---------------------------------------------------------
    # Group A network
    # ---------------------------------------------------------

    fig_a = plot_network_3d(
        ena_set=ena_set,
        network=network_a,
        title=f"{group_a} 3D ENA Network",
        colors=(
            color_a,
            color_a,
        ),
        thickness=thickness,
        node_size=node_size,
    )

    path_a = (
        output_dir
        / f"{group_a.lower()}_3d_network.html"
    )

    save_figure_html(
        fig_a,
        path_a,
    )

    # ---------------------------------------------------------
    # Group B network
    # ---------------------------------------------------------

    fig_b = plot_network_3d(
        ena_set=ena_set,
        network=network_b,
        title=f"{group_b} 3D ENA Network",
        colors=(
            color_b,
            color_b,
        ),
        thickness=thickness,
        node_size=node_size,
    )

    path_b = (
        output_dir
        / f"{group_b.lower()}_3d_network.html"
    )

    save_figure_html(
        fig_b,
        path_b,
    )

    # ---------------------------------------------------------
    # Subtracted network
    # ---------------------------------------------------------

    subtracted_fig = plot_network_3d(
        ena_set=ena_set,
        network=subtracted_network,
        title=(
            "Subtracted 3D ENA Network: "
            f"{group_a} - {group_b}"
        ),
        colors=(
            color_a,
            color_b,
        ),
        thickness=thickness,
        node_size=node_size,
    )

    subtracted_path = (
        output_dir
        / "subtracted_3d_network.html"
    )

    save_figure_html(
        subtracted_fig,
        subtracted_path,
    )

    # ---------------------------------------------------------
    # Subtracted network + group points
    # ---------------------------------------------------------

    points_fig = plot_network_with_points_3d(
        ena_set=ena_set,
        network=subtracted_network,
        point_groups=[
            {
                "points": points_a,
                "color": color_a,
                "label": group_a,
                "size": point_size,
                "alpha": point_alpha,
                "show_mean": show_mean,
            },
            {
                "points": points_b,
                "color": color_b,
                "label": group_b,
                "size": point_size,
                "alpha": point_alpha,
                "show_mean": show_mean,
            },
        ],
        title=(
            f"3D ENA: "
            f"{group_a} vs {group_b}"
        ),
        colors=(
            color_a,
            color_b,
        ),
        thickness=thickness,
        node_size=node_size,
    )

    points_path = (
        output_dir
        / "subtracted_3d_network_with_points.html"
    )

    save_figure_html(
        points_fig,
        points_path,
    )

    # ---------------------------------------------------------
    # Return generated paths
    # ---------------------------------------------------------

    return {
        "group_a_network": path_a,
        "group_b_network": path_b,
        "subtracted_network": subtracted_path,
        "subtracted_network_with_points": points_path,
    }