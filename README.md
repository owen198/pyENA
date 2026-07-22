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

- `src/pyena/rena.py`: core ENA implementation
- `src/pyena/__init__.py`: public package API
- `example.py`: end-to-end example using `RS.data.csv`
- `RS.data.csv`: handbook example dataset exported from `rENA::RS.data`
- `pyproject.toml`: package metadata for `pip install git+...`
- `requirements.txt`: optional local dependency list

## Requirements

- Python 3.10+

Install from GitHub with:

```bash
pip install git+https://github.com/owen198/pyENA.git
```

Then import it in any Python project with:

```python
from pyena import ena, generate_analysis_outputs
```

For local development, you can still create a virtual environment and install in editable mode:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

## Quick Start

Run the example:

```bash
source .venv/bin/activate
pip install -e .
python3 example.py
```

`example.py` now assumes that `pyENA` has already been installed into the active environment. This keeps the script simple and avoids manual `sys.path` manipulation.

If you already installed `pyENA` from GitHub into another project, you do not need this repository layout. The `example.py` file is mainly for reproducing the handbook workflow from this repo.

The script will:

- read `RS.data.csv`
- build an ENA model with `MovingStanzaWindow`
- rotate the space using the means of `FirstGame` and `SecondGame`
- call `generate_analysis_outputs(...)` to generate mean networks, subtracted networks, point plots, and individual comparison plots
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

from pyena import ena, generate_analysis_outputs

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

outputs = generate_analysis_outputs(
    ena_set=ena_set,
    output_dir=Path("outputs"),
    group_a_label="FirstGame",
    group_b_label="SecondGame",
    group_column="Condition",
    group_a_color="#ff0000",
    group_b_color="#0000ff",
    focus_unit_a="FirstGame::steven z",
    focus_unit_b="SecondGame::samuel o",
)

print(outputs["stats_summary"])
print(outputs["generated_files"])
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

### `generate_analysis_outputs(...)`

Generates the full set of handbook-style example plots and the `statistical_summary.json` file from an existing `ENASet`.

## Relationship to `rENA`

This project is intended as a practical Python port of the most commonly used `rENA` workflow, not a full one-to-one reimplementation of every feature in the R package.

As of July 22, 2026, `rENA` exports 85 symbols, while `pyENA` currently exposes a much smaller subset focused on the standard handbook workflow. In other words, `pyENA` already covers the core ENA pipeline, but it does not yet attempt to mirror the full plotting, rotation, reporting, and QE-data helper surface of the R package.

### Core mapping

| rENA | pyENA | Status |
| --- | --- | --- |
| `rENA::ena.accumulate.data()` | `accumulate_data()` | Implemented |
| `rENA::ena.make.set()` | `make_set()` | Implemented |
| `rENA::ena()` | `ena()` | Implemented |
| `rENA::ena.rotate.by.mean()` | `rotate_by_mean()` or `rotation="mean"` | Implemented |
| `rENA::ena.svd()` | `svd_rotation()` or `rotation="svd"` | Implemented |
| `rENA::sphere_norm()` | `sphere_normalize()` | Implemented |
| `rENA::vector_to_ut()` | internal upper-triangle vectorization in `rena.py` | Implemented |
| `rENA::ena.plot.network()` | `plot_network()` | Implemented |
| `rENA::ena.plot.points()` | `create_points_ci_plot()` / `create_points_ci_overlay_plot()` | Partially implemented |
| `rENA::ena.plot.group()` | `create_network_with_point_groups_plot()` | Partially implemented |
| `rENA::ena.plot.trajectory()` | no direct equivalent yet | Missing |
| `rENA::ena.writeup()` | no direct equivalent yet | Missing |

### What `pyENA` already covers well

- coded CSV input
- `MovingStanzaWindow` and `Conversation` accumulation
- `EndPoint`, `AccumulatedTrajectory`, and `SeparateTrajectory`
- spherical normalization and centering
- mean rotation and SVD rotation
- projected unit coordinates
- mean networks and subtracted networks
- handbook-style network and point plots
- Welch t-test and Mann-Whitney / Wilcoxon-style summaries used in the examples

### What is still missing compared with `rENA`

The largest gaps are in the broader package surface rather than the core ENA math:

- additional rotation families such as `ena.rotate.by.generalized()`, `ena.rotate.by.hena.regression()`, and `ena.rotate.by.hena.regression_2()`
- trajectory-specific plotting and helper workflows
- higher-level group, correlation, and optimization helpers such as `ena.group()`, `ena.correlations()`, and `optimize()`
- `rENA`'s QE-data definition helpers such as `define()`, `codes()`, `units()`, `metadata()`, and `horizon()`
- writeup/report generators such as `ena.writeup()`, `methods_report()`, and `methods_report_stream()`
- several plotting convenience layers from the R package, including `add_points()`, `add_network()`, `add_group()`, and `add_trajectory()`

### Practical interpretation

If your goal is to reproduce the standard Shaffer handbook ENA workflow in Python, the current `pyENA` implementation already covers the main path. If your goal is to recreate the entire `rENA` package API, there is still a substantial amount of functionality left to implement.

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
- The installable package lives under `src/pyena/`.
- `example.py` assumes `pyENA` has already been installed into the current environment.
- The current plotting layer is designed to match the handbook examples closely enough for analysis and replication, while remaining simple to modify.

## Skill

A reusable Codex skill named `interpret-ena-results` has been created at:

- [tool/pyENA/skills/interpret-ena-results/SKILL.md](/Users/owen/Library/CloudStorage/GoogleDrive-cfleu198@gmail.com/我的雲端硬碟/Academia/論文 - 編寫中/topic - ENA/tool/pyENA/skills/interpret-ena-results/SKILL.md)

This skill is designed to explain ENA outputs using the interpretive logic shown in:

- Shaffer, Collier, and Ruis (2016), *A Tutorial on Epistemic Network Analysis*
- Shaffer and Ruis (2017), *Epistemic Network Analysis: A Worked Example of Theory-Based Learning Analytics*

It focuses on how to interpret:

- ENA point distributions
- confidence intervals
- Welch t-tests and Mann-Whitney U tests
- mean networks
- subtracted networks
- paper-ready ENA results sections

### Usage

If you want Codex to auto-discover the repo copy of this skill, place or symlink the `interpret-ena-results` folder into `~/.codex/skills/`.

In Codex, invoke it explicitly with prompts such as:

```text
Use $interpret-ena-results to explain tool/pyENA/outputs/statistical_summary.json in paper-ready Chinese.
```

```text
Use $interpret-ena-results to interpret the FirstGame vs SecondGame ENA plots and write a results section.
```

```text
Use $interpret-ena-results to explain which edges in the subtracted network are driving the group difference.
```

### Recommended Inputs

The skill works best when you provide one or more of the following:

- `outputs/statistical_summary.json`
- mean network plots
- subtracted network plots
- point plots with confidence intervals
- original coded text or excerpts for closing the interpretive loop
