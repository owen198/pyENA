"""Build src/content/demo-depth.json, the third dimension of the landing page's network.

The IdeaLens landing page shows one network flat, then gives it depth. Both
views must be the same model, so this runs native pyENA (the vendored archive
in public/py/) on public/samples/RS.data.csv with examples/rs/example.py's
configuration, exactly as scripts/build-landing-demo.py does, but asks for
three dimensions. It checks that dimensions 1 and 2 of that model are the
2D model's own before writing anything, and writes only what the 2D file
lacks: each node's and each unit's position on dimension 3.

    python3 scripts/build-landing-depth.py

Needs numpy and scipy, as pyENA does.
"""

from __future__ import annotations

import csv
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ARCHIVE = next((ROOT / "public" / "py").glob("pyena-*.zip"))
sys.path.insert(0, str(ARCHIVE))

import numpy as np  # noqa: E402
from pyena import accumulate_data, make_set  # noqa: E402

CODES = [
    "Data",
    "Technical.Constraints",
    "Performance.Parameters",
    "Client.and.Consultant.Requests",
    "Design.Reasoning",
    "Collaboration",
]
UNITS = ["Condition", "UserName"]
CONVERSATION = ["Condition", "GroupName"]
GROUP_COLUMN = "Condition"
GROUPS = ("FirstGame", "SecondGame")
WINDOW_BACK = 4


def main() -> None:
    with open(ROOT / "public" / "samples" / "RS.data.csv", newline="", encoding="utf-8") as handle:
        records = list(csv.DictReader(handle))

    enadata = accumulate_data(
        data=records,
        codes=CODES,
        units=UNITS,
        conversation=CONVERSATION,
        metadata=["Condition", "GroupName"],
        model="EndPoint",
        window="MovingStanzaWindow",
        window_size_back=WINDOW_BACK,
        window_size_forward=0,
    )
    flat = make_set(enadata=enadata, dimensions=2, rotation="mean", group_column=GROUP_COLUMN, groups=GROUPS)
    deep = make_set(enadata=enadata, dimensions=3, rotation="mean", group_column=GROUP_COLUMN, groups=GROUPS)

    flat_nodes = np.asarray(flat.node_positions)
    deep_nodes = np.asarray(deep.node_positions)
    flat_points = np.asarray(flat.points)
    deep_points = np.asarray(deep.points)
    # The promise the page makes: the 3D view is the 2D model with one more axis.
    if not (np.allclose(deep_nodes[:, :2], flat_nodes, atol=1e-12) and np.allclose(deep_points[:, :2], flat_points, atol=1e-12)):
        raise SystemExit("dimensions 1 and 2 of the 3D model differ from the 2D model; not writing")

    out = {
        "provenance": {
            "file": "RS.data.csv",
            "script": "examples/rs/example.py, with dimensions=3",
            "archive": ARCHIVE.name,
        },
        "dimensions": 3,
        "nodes": [{"code": code, "z": float(position[2])} for code, position in zip(CODES, deep_nodes)],
        "units": [{"label": label, "z": float(point[2])} for label, point in zip(deep.unit_labels, deep_points)],
    }
    target = ROOT / "src" / "content" / "demo-depth.json"
    target.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {target.relative_to(ROOT)}: {len(out['nodes'])} nodes, {len(out['units'])} units on dimension 3")


if __name__ == "__main__":
    main()
