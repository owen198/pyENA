from __future__ import annotations

import json
import sys
from pathlib import Path

from pyena import ena, generate_analysis_outputs_3d, validate_rs_data


FIRST_COLOR = "#ff0000"
SECOND_COLOR = "#0000ff"


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    data_path = base_dir / "datasets" / "RS.data.csv"
    output_dir = base_dir / "outputs_3d"
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
            dimensions=3,
            group_column="Condition",
            groups=("FirstGame", "SecondGame"),
        )
    except ValueError as exc:
        print("3D ENA analysis failed.", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc

    outputs = generate_analysis_outputs_3d(
        ena_set=ena_set,
        output_dir=output_dir,
        group_column="Condition",
        groups=("FirstGame", "SecondGame"),
        group_colors=(FIRST_COLOR, SECOND_COLOR),
        focus_unit_a="FirstGame::steven z",
        focus_unit_b="SecondGame::samuel o",
    )

    print("Units:", len(ena_set.unit_labels))
    print("Edges:", len(ena_set.edge_labels))
    print("First five 3D point coordinates:")
    for label, point in list(zip(ena_set.unit_labels, ena_set.points))[:5]:
        print(label, point.round(4).tolist())

    print("\nStatistical summary:")
    print(json.dumps(outputs["stats_summary"], indent=2))

    print("\nGenerated outputs:")
    for name in outputs["generated_files"]:
        print("-", name)


if __name__ == "__main__":
    main()