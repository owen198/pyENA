from __future__ import annotations

from pathlib import Path

from pyena import (
    ena,
    generate_analysis_outputs_3d,
    validate_rs_data,
)


FIRST_COLOR = "#ff0000"
SECOND_COLOR = "#0000ff"


def main() -> None:
    base_dir = (
        Path(__file__)
        .resolve()
        .parent
    )

    data_path = (
        base_dir
        / "datasets"
        / "RS.data.csv"
    )

    output_dir = (
        base_dir
        / "outputs_3d"
    )

    validate_rs_data(
        data_path
    )

    codes = [
        "Data",
        "Technical.Constraints",
        "Performance.Parameters",
        "Client.and.Consultant.Requests",
        "Design.Reasoning",
        "Collaboration",
    ]

    # ---------------------------------------------------------
    # Build 3D ENA model
    # ---------------------------------------------------------

    ena_set = ena(
        data=data_path,

        units=[
            "Condition",
            "UserName",
        ],

        conversation=[
            "Condition",
            "GroupName",
        ],

        metadata=[
            "Condition",
            "GroupName",
        ],

        codes=codes,

        model="EndPoint",

        window="MovingStanzaWindow",

        window_size_back=4,

        rotation="mean",

        dimensions=3,

        group_column="Condition",

        groups=(
            "FirstGame",
            "SecondGame",
        ),
    )

    # ---------------------------------------------------------
    # Confirm 3D model
    # ---------------------------------------------------------

    print("=" * 70)
    print("3D ENA model created")
    print("=" * 70)

    print(
        "Points shape:",
        ena_set.points.shape,
    )

    print(
        "Node positions shape:",
        ena_set.node_positions.shape,
    )

    print(
        "Rotation matrix shape:",
        ena_set.rotation_matrix.shape,
    )

    # ---------------------------------------------------------
    # Generate all 3D outputs
    # ---------------------------------------------------------

    outputs = generate_analysis_outputs_3d(
        ena_set=ena_set,

        group_column="Condition",

        groups=(
            "FirstGame",
            "SecondGame",
        ),

        output_dir=output_dir,

        group_colors=(
            FIRST_COLOR,
            SECOND_COLOR,
        ),
    )

    # ---------------------------------------------------------
    # Done
    # ---------------------------------------------------------

    print(
        "\nGenerated HTML files:"
    )

    for name, path in outputs.items():
        print(
            f"- {name}: {path.name}"
        )

    print(
        "\nOutput directory:",
        output_dir,
    )


if __name__ == "__main__":
    main()