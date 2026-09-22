from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pyena import (
    ena,
    generate_analysis_outputs,
    group_network,
    group_points,
    summarize_ena_results,
    validate_rs_data,
)

FIRST_COLOR = "#ff0000"
SECOND_COLOR = "#0000ff"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the pyENA handbook example on datasets/RS.data.csv."
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Only write outputs/statistical_summary.json and skip figure generation.",
    )
    return parser


def main() -> None:
    args = build_parser().parse_args()
    base_dir = Path(__file__).resolve().parent
    data_path = base_dir / "datasets" / "RS.data.csv"
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

    try:
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
    except ValueError as exc:
        print("ENA analysis failed.", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc

    group_column = "Condition"
    group_a_label = "FirstGame"
    group_b_label = "SecondGame"

    if args.summary_only:
        group_a_network = group_network(ena_set, group_column, group_a_label)
        group_b_network = group_network(ena_set, group_column, group_b_label)
        group_a_points = group_points(ena_set, group_column, group_a_label)
        group_b_points = group_points(ena_set, group_column, group_b_label)
        analysis_summary = summarize_ena_results(
            ena_set=ena_set,
            group_a_label=group_a_label,
            group_b_label=group_b_label,
            group_column=group_column,
            group_a_points=group_a_points,
            group_b_points=group_b_points,
            group_a_network=group_a_network,
            group_b_network=group_b_network,
            subtracted_mean_network=group_a_network - group_b_network,
        )
        summary_path = output_dir / "statistical_summary.json"
        summary_path.write_text(json.dumps(analysis_summary, indent=2), encoding="utf-8")
        outputs = {
            "generated_files": [summary_path.name],
            "analysis_summary": analysis_summary,
            "stats_summary": analysis_summary["statistics"],
        }
    else:
        outputs = generate_analysis_outputs(
            ena_set=ena_set,
            output_dir=output_dir,
            group_a_label=group_a_label,
            group_b_label=group_b_label,
            group_column=group_column,
            group_a_color=FIRST_COLOR,
            group_b_color=SECOND_COLOR,
            group_a_line_colors=(FIRST_COLOR, FIRST_COLOR),
            group_b_line_colors=(SECOND_COLOR, SECOND_COLOR),
            subtracted_line_colors=(FIRST_COLOR, SECOND_COLOR),
            focus_unit_a="FirstGame::steven z",
            focus_unit_b="SecondGame::samuel o",
        )

    stats_summary = outputs["stats_summary"]

    print("Units:", len(ena_set.unit_labels))
    print("Edges:", len(ena_set.edge_labels))
    print("First five point coordinates:")
    for label, point in list(zip(ena_set.unit_labels, ena_set.points))[:5]:
        print(label, point.round(4).tolist())
    if args.summary_only:
        print("\nSummary-only mode: skipped figure generation.")
    print("\nStatistical summary:")
    print(json.dumps(stats_summary, indent=2))

    print("\nGenerated outputs:")
    for name in outputs["generated_files"]:
        print("-", name)


if __name__ == "__main__":
    main()
