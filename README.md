# pyENA

`pyENA` is a Python rewrite of the core workflow in `rENA`, focused on reproducing the standard Epistemic Network Analysis pipeline used in the Shaffer handbook examples.

It currently supports:

- reading coded CSV data
- accumulating co-occurrence vectors by `units` and `conversation`
- `MovingStanzaWindow` and `Conversation` windows
- `EndPoint`, `AccumulatedTrajectory`, and `SeparateTrajectory`
- spherical normalization
- SVD rotation and mean rotation
- point projection, mean networks, and subtracted networks
- matplotlib-based ENA network plots
- Welch t-test and Mann-Whitney / Wilcoxon-style summaries used in the examples

## Files

- `rena.py`: core ENA implementation
- `example.py`: end-to-end example using `RS.data.csv`
- `RS.data.csv`: handbook example dataset exported from `rENA::RS.data`
- `requirements.txt`: Python dependencies

## Requirements

- Python 3.10+

Install dependencies with:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Quick Start

Run the example:

```bash
source .venv/bin/activate
python3 example.py
```

The script will:

- read `RS.data.csv`
- build an ENA model with `MovingStanzaWindow`
- rotate the space using the means of `FirstGame` and `SecondGame`
- generate mean networks, subtracted networks, point plots, and individual comparison plots
- save all outputs to `outputs/`
- print the statistical summary to the terminal

## Output Files

Running `example.py` will generate files such as:

- `outputs/firstgame_mean_network.png`
- `outputs/secondgame_mean_network.png`
- `outputs/subtracted_mean_network.png`
- `outputs/group_points_overlay.png`
- `outputs/subtracted_network_with_points.png`
- `outputs/subtracted_individual_network.png`
- `outputs/statistical_summary.json`

## Minimal Usage Example

```python
from pathlib import Path

from rena import ena, group_points, mean_network, subtract_networks

data_path = Path("RS.data.csv")

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

first_points = group_points(ena_set, "Condition", "FirstGame")
second_points = group_points(ena_set, "Condition", "SecondGame")

first_network = mean_network(
    ena_set,
    [meta["Condition"] == "FirstGame" for meta in ena_set.enadata.unit_metadata],
)
second_network = mean_network(
    ena_set,
    [meta["Condition"] == "SecondGame" for meta in ena_set.enadata.unit_metadata],
)
diff_network = subtract_networks(first_network, second_network)

print(first_points[:3])
print(second_points[:3])
print(diff_network[:5])
```

## Main API

### `ena(...)`

High-level wrapper that runs:

1. `accumulate_data(...)`
2. `make_set(...)`

Use this when you want the full ENA result in one step.

### `accumulate_data(...)`

Builds accumulated adjacency vectors from coded event data.

Important arguments:

- `data`: CSV path or `list[dict]`
- `codes`: code column names
- `units`: columns defining the analytic unit
- `conversation`: columns defining the conversation segment
- `metadata`: metadata columns to preserve
- `model`: `"EndPoint"`, `"AccumulatedTrajectory"`, or `"SeparateTrajectory"`
- `window`: `"MovingStanzaWindow"` or `"Conversation"`
- `window_size_back`: backward window size
- `window_size_forward`: forward window size

### `make_set(...)`

Takes accumulated vectors and computes:

- normalization
- centering
- rotation
- projected point coordinates
- node positions

### `mean_network(...)`

Returns the average edge-weight vector for a selected set of units.

### `subtract_networks(...)`

Returns `network_a - network_b`.

### `plot_network(...)`

Draws an ENA network using the node positions stored in the `ENASet`.

## Relationship to `rENA`

This project is intended as a practical Python port of the most commonly used `rENA` workflow, not a full one-to-one reimplementation of every feature in the R package.

Approximate mapping:

- `rENA::ena.accumulate.data()` -> `accumulate_data()`
- `rENA::ena.make.set()` -> `make_set()`
- `rENA::ena()` -> `ena()`
- `ena.rotate.by.mean()` -> `rotation="mean"`
- `ena.svd()` -> `rotation="svd"`

## Data Format

Each row should represent one coded event, utterance, or observation. Code columns are typically `0/1`, but any numeric values are accepted. Non-zero values are treated as present.

Example:

```csv
Condition,UserName,GroupName,Data,Technical.Constraints,Design.Reasoning,Collaboration
FirstGame,A,G1,1,0,1,0
FirstGame,A,G1,0,1,1,1
SecondGame,B,G2,1,1,0,1
```

## Notes

- `example.py` is the recommended place to start.
- Most reusable helper functions have been moved into `rena.py`.
- The current plotting layer is designed to match the handbook examples closely enough for analysis and replication, while remaining simple to modify.
