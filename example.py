from __future__ import annotations

import json
from pathlib import Path

import matplotlib.pyplot as plt

from rena import (
    ena,
    find_unit_index,
    group_points,
    mann_whitney,
    mean_network,
    plot_network,
    plot_point_set,
    plot_points_with_ci,
    save_figure,
    subtract_networks,
    validate_rs_data,
    welch_ttest,
)

FIRST_COLOR = "#ff0000"
SECOND_COLOR = "#0000ff"


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    data_path = base_dir / "RS.data.csv"
    output_dir = base_dir / "outputs"
    output_dir.mkdir(exist_ok=True)
    validate_rs_data(data_path)

    codes = [
        "Data",
        "Technical.Constraints",
        "Performance.Parameters",
        "Client.and.Consultant.Requests",
        "Design.Reasoning",
        "Collaboration",
    ]

    ena_set = ena(
        data=data_path,
        units=["Condition", "UserName"],
        conversation=["Condition", "GroupName"],
        metadata=["Condition", "GroupName"],
        codes=codes,
        model="EndPoint",
        window="MovingStanzaWindow",
        window_size_back=4,
        rotation="mean",
        group_column="Condition",
        groups=("FirstGame", "SecondGame"),
    )

    conditions = [meta["Condition"] for meta in ena_set.enadata.unit_metadata]
    first_mask = [value == "FirstGame" for value in conditions]
    second_mask = [value == "SecondGame" for value in conditions]

    first_network = mean_network(ena_set, first_mask)
    second_network = mean_network(ena_set, second_mask)
    diff_network = subtract_networks(first_network, second_network)
    first_points = group_points(ena_set, "Condition", "FirstGame")
    second_points = group_points(ena_set, "Condition", "SecondGame")

    unit_labels = ena_set.unit_labels
    first_unit_index = find_unit_index(unit_labels, "FirstGame::steven z")
    second_unit_index = find_unit_index(unit_labels, "SecondGame::samuel o")

    first_unit_label = unit_labels[first_unit_index]
    second_unit_label = unit_labels[second_unit_index]
    first_unit_network = ena_set.line_weights[first_unit_index]
    second_unit_network = ena_set.line_weights[second_unit_index]
    first_unit_point = ena_set.points[first_unit_index:first_unit_index + 1]
    second_unit_point = ena_set.points[second_unit_index:second_unit_index + 1]
    diff_unit_network = subtract_networks(first_unit_network, second_unit_network) * 5

    stats_summary = {
        "welch_t_test": {
            "dimension_1": welch_ttest(first_points[:, 0], second_points[:, 0]),
            "dimension_2": welch_ttest(first_points[:, 1], second_points[:, 1]),
        },
        "mann_whitney_u": {
            "dimension_1": mann_whitney(first_points[:, 0], second_points[:, 0]),
            "dimension_2": mann_whitney(first_points[:, 1], second_points[:, 1]),
        },
    }

    print("Units:", len(ena_set.unit_labels))
    print("Edges:", len(ena_set.edge_labels))
    print("First five point coordinates:")
    for label, point in list(zip(ena_set.unit_labels, ena_set.points))[:5]:
        print(label, point.round(4).tolist())
    print("\nStatistical summary:")
    print(json.dumps(stats_summary, indent=2))

    ax = plot_network(ena_set, first_network, title="FirstGame Mean Network")
    save_figure(ax.figure, output_dir / "firstgame_mean_network.png")

    ax = plot_network(ena_set, second_network, title="SecondGame Mean Network")
    save_figure(ax.figure, output_dir / "secondgame_mean_network.png")

    ax = plot_network(ena_set, diff_network, title="Subtracted Mean Network: FirstGame - SecondGame")
    save_figure(ax.figure, output_dir / "subtracted_mean_network.png")

    fig, ax = plt.subplots(figsize=(6, 6))
    plot_points_with_ci(ax, first_points, FIRST_COLOR, "FirstGame")
    ax.set_title("FirstGame Points, Mean, and 95% CI")
    ax.axhline(0, color="#cccccc", linewidth=0.8)
    ax.axvline(0, color="#cccccc", linewidth=0.8)
    ax.legend()
    save_figure(fig, output_dir / "firstgame_points_ci.png")

    fig, ax = plt.subplots(figsize=(6, 6))
    plot_points_with_ci(ax, second_points, SECOND_COLOR, "SecondGame")
    ax.set_title("SecondGame Points, Mean, and 95% CI")
    ax.axhline(0, color="#cccccc", linewidth=0.8)
    ax.axvline(0, color="#cccccc", linewidth=0.8)
    ax.legend()
    save_figure(fig, output_dir / "secondgame_points_ci.png")

    fig, ax = plt.subplots(figsize=(7, 6))
    plot_points_with_ci(ax, first_points, FIRST_COLOR, "FirstGame")
    plot_points_with_ci(ax, second_points, SECOND_COLOR, "SecondGame")
    ax.set_title("FirstGame vs SecondGame Points, Means, and 95% CI")
    ax.axhline(0, color="#cccccc", linewidth=0.8)
    ax.axvline(0, color="#cccccc", linewidth=0.8)
    ax.legend()
    save_figure(fig, output_dir / "group_points_overlay.png")

    fig, ax = plt.subplots(figsize=(7, 6))
    plot_network(ena_set, first_network, title="FirstGame Mean Network and Points", ax=ax)
    plot_point_set(ax, first_points, FIRST_COLOR)
    save_figure(fig, output_dir / "firstgame_network_with_points.png")

    fig, ax = plt.subplots(figsize=(7, 6))
    plot_network(ena_set, second_network, title="SecondGame Mean Network and Points", ax=ax)
    plot_point_set(ax, second_points, SECOND_COLOR)
    save_figure(fig, output_dir / "secondgame_network_with_points.png")

    fig, ax = plt.subplots(figsize=(7, 6))
    plot_network(ena_set, diff_network, title="Subtracted Mean Network with Group Points", ax=ax)
    plot_point_set(ax, first_points, FIRST_COLOR, label="FirstGame", alpha=0.55)
    plot_point_set(ax, second_points, SECOND_COLOR, label="SecondGame", alpha=0.55)
    ax.legend()
    save_figure(fig, output_dir / "subtracted_network_with_points.png")

    fig, ax = plt.subplots(figsize=(7, 6))
    plot_network(ena_set, first_unit_network, title=f"Individual Network: {first_unit_label}", ax=ax)
    plot_point_set(ax, first_unit_point, FIRST_COLOR, size=80, show_mean=False, zorder=5)
    save_figure(fig, output_dir / "individual_firstgame_network.png")

    fig, ax = plt.subplots(figsize=(7, 6))
    plot_network(ena_set, second_unit_network, title=f"Individual Network: {second_unit_label}", ax=ax)
    plot_point_set(ax, second_unit_point, SECOND_COLOR, size=80, show_mean=False, zorder=5)
    save_figure(fig, output_dir / "individual_secondgame_network.png")

    fig, ax = plt.subplots(figsize=(7, 6))
    plot_network(
        ena_set,
        diff_unit_network,
        title=f"Subtracted network: {first_unit_label} (red) - {second_unit_label} (blue)",
        ax=ax,
    )
    plot_point_set(ax, first_unit_point, FIRST_COLOR, label=first_unit_label, size=80, show_mean=False, zorder=5)
    plot_point_set(ax, second_unit_point, SECOND_COLOR, label=second_unit_label, size=80, show_mean=False, zorder=5)
    ax.legend()
    save_figure(fig, output_dir / "subtracted_individual_network.png")

    summary_path = output_dir / "statistical_summary.json"
    summary_path.write_text(json.dumps(stats_summary, indent=2), encoding="utf-8")

    print("\nGenerated outputs:")
    for path in sorted(output_dir.glob("*")):
        print("-", path.name)


if __name__ == "__main__":
    main()
