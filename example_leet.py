from __future__ import annotations

import json
from pathlib import Path

from pyena import (
    ena,
    generate_analysis_outputs,
)

FIRST_COLOR = "#0000ff"
SECOND_COLOR = "#ff0000"


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    data_path = base_dir / "datasets" / "leet.csv"
    output_dir = base_dir / "outputs_leet"
    output_dir.mkdir(exist_ok=True)

    codes = [
        "data.pandas",
        "list.set",
        "loop.loops",
        "statement.conditions",
    ]

    ena_set = ena(
        data=data_path,
        units=["Condition", "UserName"],
        conversation=["Condition", "ActivityNumber"],
        metadata=["Condition", "ActivityNumber"],
        codes=codes,
        model="EndPoint",
        window="MovingStanzaWindow",
        window_size_back=5,
        rotation="mean",
        group_column="Condition",
        groups=("HDSE", "LDSE"),
    )

    outputs = generate_analysis_outputs(
        ena_set=ena_set,
        output_dir=output_dir,
        group_a_label="HDSE",
        group_b_label="LDSE",
        group_column="Condition",
        group_a_color=FIRST_COLOR,
        group_b_color=SECOND_COLOR,
        group_a_line_colors=(FIRST_COLOR, FIRST_COLOR),
        group_b_line_colors=(SECOND_COLOR, SECOND_COLOR),
        subtracted_line_colors=(FIRST_COLOR, SECOND_COLOR),
        focus_unit_a="HDSE::987775512",
        focus_unit_b="LDSE::594052036",
    )
    stats_summary = outputs["stats_summary"]

    print("Units:", len(ena_set.unit_labels))
    print("Edges:", len(ena_set.edge_labels))
    print("Codes:", codes)
    print("First five point coordinates:")
    for label, point in list(zip(ena_set.unit_labels, ena_set.points))[:5]:
        print(label, point.round(4).tolist())
    print("\nStatistical summary:")
    print(json.dumps(stats_summary, indent=2))

    print("\nGenerated outputs:")
    for name in outputs["generated_files"]:
        print("-", name)


if __name__ == "__main__":
    main()
