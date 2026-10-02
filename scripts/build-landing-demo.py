"""Build src/content/demo-rs.json, the data behind the landing page's walk-through.

Everything the landing page shows about RS.data comes from this file, and
everything in this file comes from native pyENA (the vendored archive in
public/py/) run on public/samples/RS.data.csv with the configuration
examples/rs/example.py uses. Nothing is typed in by hand.

    python3 scripts/build-landing-demo.py

Needs numpy and scipy, as pyENA does.
"""

from __future__ import annotations

import csv
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ARCHIVE = next((ROOT / "public" / "py").glob("pyena-*.zip"))
sys.path.insert(0, str(ARCHIVE))

import numpy as np  # noqa: E402
from pyena import (  # noqa: E402
    accumulate_data,
    group_network,
    group_points,
    make_set,
    subtract_networks,
    summarize_ena_results,
)

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
DOCUMENT_LINES = 6
TEXT_COLUMN = "text"
MAX_EXCERPT = 240


def present(value: str | None) -> bool:
    """codePresent in src/model/config.ts: a positive number, or true / yes / y."""
    if value is None or value.strip() == "":
        return False
    try:
        return float(value) > 0
    except ValueError:
        return value.strip().lower() in ("true", "yes", "y")


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    with open(ROOT / "public" / "samples" / "RS.data.csv", newline="", encoding="utf-8") as handle:
        records = list(csv.DictReader(handle))
    columns = list(records[0].keys())

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
    ena_set = make_set(enadata=enadata, dimensions=2, rotation="mean", group_column=GROUP_COLUMN, groups=GROUPS)
    a, b = GROUPS
    network_a = group_network(ena_set, GROUP_COLUMN, a)
    network_b = group_network(ena_set, GROUP_COLUMN, b)
    network_sub = subtract_networks(network_a, network_b)
    points_a = group_points(ena_set, GROUP_COLUMN, a)
    points_b = group_points(ena_set, GROUP_COLUMN, b)
    summary = summarize_ena_results(
        ena_set=ena_set,
        group_a_label=a,
        group_b_label=b,
        group_column=GROUP_COLUMN,
        group_a_points=points_a,
        group_b_points=points_b,
        group_a_network=network_a,
        group_b_network=network_b,
        subtracted_mean_network=network_sub,
    )
    overall = np.asarray(ena_set.line_weights).mean(axis=0)

    edges = []
    for index, label in enumerate(ena_set.edge_labels):
        first, second = label.split("__") if "__" in label else re.split(r"\s*&\s*", label)
        edges.append(
            {
                "source": first,
                "target": second,
                "overall": float(overall[index]),
                "a": float(network_a[index]),
                "b": float(network_b[index]),
                "subtracted": float(network_sub[index]),
            }
        )

    groups_of_units = [meta.get(GROUP_COLUMN) for meta in ena_set.enadata.unit_metadata]
    units = [
        {"label": label, "group": group, "x": float(point[0]), "y": float(point[1])}
        for label, group, point in zip(ena_set.unit_labels, groups_of_units, ena_set.points)
    ]

    # The "document": six consecutive lines of one conversation carrying the
    # most distinct codes, the earliest such passage when several tie.
    best = None
    for start in range(len(records) - DOCUMENT_LINES + 1):
        window = records[start : start + DOCUMENT_LINES]
        if len({tuple(row[column] for column in CONVERSATION) for row in window}) != 1:
            continue
        if any(not (8 <= len(clean(row[TEXT_COLUMN])) <= 170) for row in window):
            continue
        codes = {code for row in window for code in CODES if present(row[code])}
        coded_lines = sum(1 for row in window if any(present(row[code]) for code in CODES))
        score = (len(codes), coded_lines)
        if best is None or score > best[0]:
            best = (score, start)
    start = best[1]
    passage = records[start : start + DOCUMENT_LINES]
    lines = [
        {
            "row": start + offset + 2,  # the CSV's own line number, header included
            "speaker": row["UserName"],
            "text": clean(row[TEXT_COLUMN]),
            "codes": [code for code in CODES if present(row[code])],
        }
        for offset, row in enumerate(passage)
    ]
    # Connections the moving stanza window makes inside the passage: each
    # line's codes join the codes of that line and the WINDOW_BACK - 1 before it.
    connections: dict[tuple[str, str], int] = {}
    for index, line in enumerate(lines):
        window_codes = {code for earlier in lines[max(0, index - WINDOW_BACK + 1) : index + 1] for code in earlier["codes"]}
        for code in line["codes"]:
            for other in window_codes:
                if other == code:
                    continue
                pair = tuple(sorted((code, other), key=CODES.index))
                connections.setdefault(pair, index)
    connection_list = [
        {"source": pair[0], "target": pair[1], "line": line_index}
        for pair, line_index in sorted(connections.items(), key=lambda item: (item[1], CODES.index(item[0][0])))
    ]

    # Evidence, by the rule src/interpret/excerpts.ts uses: the first line of a
    # group carrying both codes of its most favoured connection.
    excerpts = []
    top = summary["networks"]["subtracted_mean_network_top_edges"]
    for group, entries in ((a, top["group_a_stronger"]), (b, top["group_b_stronger"])):
        if not entries:
            continue
        first, second = entries[0]["edge"].split("__")
        rows = [
            row
            for row in records
            if row[GROUP_COLUMN] == group and present(row[first]) and present(row[second]) and clean(row[TEXT_COLUMN])
        ]
        chosen = next((row for row in rows if 40 <= len(row[TEXT_COLUMN].strip()) <= MAX_EXCERPT), rows[0] if rows else None)
        if chosen is None:
            continue
        text = clean(chosen[TEXT_COLUMN])
        if len(text) > MAX_EXCERPT:
            text = text[: MAX_EXCERPT - 1].rstrip() + "…"
        excerpts.append(
            {"group": group, "codes": [first, second], "unit": "::".join(chosen[column] for column in UNITS), "text": text}
        )

    out = {
        "provenance": {
            "file": "RS.data.csv",
            "script": "examples/rs/example.py",
            "archive": ARCHIVE.name,
            "rows": len(records),
            "columns": len(columns),
            "units": len(units),
        },
        "codes": CODES,
        "groups": {"column": GROUP_COLUMN, "a": a, "b": b},
        "window": WINDOW_BACK,
        "nodes": [
            {"code": code, "x": float(position[0]), "y": float(position[1])}
            for code, position in zip(CODES, np.asarray(ena_set.node_positions))
        ],
        "edges": edges,
        "units": units,
        "document": {"conversation": " / ".join(passage[0][column] for column in CONVERSATION), "lines": lines},
        "connections": connection_list,
        "excerpts": excerpts,
        # pyENA's own summary, as example.py writes it (NaN kept verbatim).
        "summaryJson": json.dumps(summary, indent=2),
    }
    target = ROOT / "src" / "content" / "demo-rs.json"
    target.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {target.relative_to(ROOT)}: {len(units)} units, {len(edges)} edges, passage at row {lines[0]['row']}")


if __name__ == "__main__":
    main()
