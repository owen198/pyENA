from __future__ import annotations

import json
from pathlib import Path

from rena import (
    ena,
    generate_example_outputs,
    validate_rs_data,
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

    outputs = generate_example_outputs(
        ena_set=ena_set,
        output_dir=output_dir,
        first_group="FirstGame",
        second_group="SecondGame",
        group_column="Condition",
        first_color=FIRST_COLOR,
        second_color=SECOND_COLOR,
        first_unit="FirstGame::steven z",
        second_unit="SecondGame::samuel o",
    )
    stats_summary = outputs["stats_summary"]

    print("Units:", len(ena_set.unit_labels))
    print("Edges:", len(ena_set.edge_labels))
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
