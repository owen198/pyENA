"""Build public/tour/rs-figures.json: the figures the landing page's platform
tour shows once its RS.data analysis has "run".

The tour shows the real workspace, but never boots the analysis engine on the
landing page. So the result it shows is made here, ahead of time, by the same
code the engine runs: src/engine/bridge.py with the vendored pyENA, natively,
on RS.data with the configuration examples/rs/example.py uses, drawn in the
paper tokens.

    python3 scripts/build-tour-figures.py

Needs numpy, scipy, matplotlib and fontTools.
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
sys.path.insert(0, str(ROOT / "src" / "engine"))

import bridge  # noqa: E402

FIGURE_TOKENS = ["surface", "surface-soft", "ink", "ink-secondary", "border", "brand", "accent"]
FIGURE_IDS = [
    "subtracted_mean_network",
    "subtracted_network_with_points",
    "group_points_overlay",
    "a_points_ci",
    "b_points_ci",
    "a_mean_network",
    "b_mean_network",
    "a_network_with_points",
    "b_network_with_points",
    "individual_a_network",
    "individual_b_network",
    "subtracted_individual_network",
]


def paper_tokens() -> dict[str, str]:
    """The paper theme's values, read from the design system's tokens.css."""
    css = (ROOT / "public" / "ds" / "tokens.css").read_text(encoding="utf-8")
    block = css[css.index("{") : css.index("}")]
    values = dict(re.findall(r"--([a-z-]+):\s*(#[0-9a-fA-F]{6})", block))
    return {name: values[name] for name in FIGURE_TOKENS}


def main() -> None:
    tokens = paper_tokens()
    bridge.configure(json.dumps(tokens), str(ROOT / "public" / "ds" / "fonts" / "Figtree-VariableFont_wght.ttf"))
    with open(ROOT / "public" / "samples" / "RS.data.csv", newline="", encoding="utf-8") as handle:
        records = list(csv.DictReader(handle))

    config = {
        "codes": [
            "Data",
            "Technical.Constraints",
            "Performance.Parameters",
            "Client.and.Consultant.Requests",
            "Design.Reasoning",
            "Collaboration",
        ],
        "units": ["Condition", "UserName"],
        "conversation": ["Condition", "GroupName"],
        "metadata": ["Condition", "GroupName"],
        "model": "EndPoint",
        "window": "MovingStanzaWindow",
        "window_size_back": 4,
        "window_size_forward": 0,
        "rotation": "mean",
        "dimensions": 2,
        "group_column": "Condition",
        "groups": ["FirstGame", "SecondGame"],
    }
    outcome = json.loads(bridge.run(json.dumps(records), json.dumps(config), lambda _phase: None))
    if "error" in outcome:
        raise SystemExit(outcome["error"])
    options = {
        "color_a": tokens["brand"],
        "color_b": tokens["accent"],
        "show_ci": True,
        "show_labels": True,
        "focus_unit_a": "FirstGame::steven z",
        "focus_unit_b": "SecondGame::samuel o",
    }
    rendered = json.loads(bridge.render(json.dumps(FIGURE_IDS), json.dumps(options)))
    out = {
        "summaryJson": outcome["ok"]["summary_json"],
        "units": outcome["ok"]["units"],
        "svgs": rendered["figures"],
        "focus": rendered["focus"],
    }
    target = ROOT / "public" / "tour" / "rs-figures.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out), encoding="utf-8")
    size = target.stat().st_size / 1024
    print(f"wrote {target.relative_to(ROOT)}: {len(out['svgs'])} figures, {size:.0f} KB")


if __name__ == "__main__":
    main()
