# Native rENA alignment

Reference: **rENA 0.3.0 / R 4.5.2**. Library runtime: **Python, NumPy, SciPy, Matplotlib and Plotly only**. R is used exclusively by developer reference tests.

This work maps all 85 installed rENA exports to Python APIs or explicitly qualified equivalents. A mapped name does not mean every R parameter, data-class rule or formula is reproduced. The complete per-export table is [rena-capabilities.md](rena-capabilities.md); detailed limitations are in [rena-capabilities.json](rena-capabilities.json).

## Compatibility changes

- SVD eigenvalues are squared singular values divided by n−1, matching `prcomp(..., center=FALSE)$sdev²`.
- Means rotation does not invent eigenvalues: `ENASet.eigenvalues` is empty and summary JSON reports null.
- Explained variance is projected sample variance divided by total pre-projection sample variance. Retaining two axes no longer forces the ratios to sum to one.
- `cohens_d` is absolute, matching `fun_cohens.d`. Direction is retained as `signed_cohens_d`.
- `w_statistic_r_style` means the first sample's U. `u_min` preserves the old minimum of complementary U values.
- Mann–Whitney defaults match installed R 4.5.2: both groups smaller than 50 and no ties use exact; otherwise use a tie-corrected normal approximation with continuity correction.
- Goodness of fit uses pairwise coordinate differences versus pairwise centroid differences. Unit-column correlations are a different quantity.
- Pearson Fisher intervals reproduce rENA's pair-count formula. Pairs share units, so these package intervals are not independent inferential validation.
- Backward window zero retains the current row. Infinity reaches the start of the conversation. Conversation windows aggregate once per unit/conversation, not once per utterance.
- Count/callable weighting applies after co-occurrence construction, not as a transformation of input code rows. The default count window reproduces rENA 0.3.0's requested-forward-window head-subtraction convention at truncated boundaries.
- Means rotation no longer flips axes based on a handbook example's group medians. Original axis signs may change; numerical comparisons align signs from matched rotation loadings.
- Group summaries include sample SD, IQR and ±1.5 IQR outlier offsets. A singleton confidence interval is undefined rather than a zero-width certainty interval.
- JSON exports replace nonfinite values with null. Undefined Welch tests raise, as opposed to inventing a valid statistic.

## New modules

| File | Responsibility |
|---|---|
| `rena.py` | Existing core and summary corrections, window/count/mask handling, group reducers |
| `pipeline.py` | Configurable fit, reusable rotation objects, normalization/centering, projection, optimization, directed node formulas, model conversion |
| `rotations.py` | Multiple mean contrasts, GMR, native elastic-net CV, hENA and restricted-formula regression rotations |
| `data.py` | Column roles, typed NumPy columns/matrices, adjacency helpers, dialogue context retrieval |
| `visualization.py` | Composable 2D layers, directed arrows, trajectories, Plotly animation, circular layouts |
| `reporting.py` | Safe JSON and text/Markdown/HTML/JSON methods reports |
| `plot3d.py` | Existing 3D workflow retained; directed plotting dispatch and safe JSON added |

## Configurable modeling and reuse

```python
from pyena import ena, project_in, ENARotationSet

m = ena(
    "coded.csv", codes=["goal", "evidence", "strategy", "tradeoff", "revision"],
    units=["team_id"], conversation=["conversation_id"], metadata=["condition"],
    window_size_back=4, rotation="mean", dimensions=3,
    group_column="condition", groups=("baseline", "scaffolded"),
    norm_by="sphere", center_align_to_origin=True,
)
m.rotation_set.save("outputs/rotation.json")
reference = ENARotationSet.load("outputs/rotation.json")
# new_accumulated is an ENAData with exactly matching code and edge order.
# transformed = project_in(new_accumulated, reference, centering="reference")
```

`norm_by` accepts `sphere`, `max`/`skip_sphere`, `none`, or a matrix callable. `center_with` receives normalized weights and returns `(centered_points, center_vector)`. A rotation callable receives `(points, dimensions=..., **rotation_params)` and returns `(rotation_matrix, eigenvalues)` or an `ENARotationSet`. A node callback receives `(weights, points, code_count)` and returns `(nodes, centroids)` or a dictionary with `node_positions` and `centroids`.

`rotate()` and `means_rotate()` inherit the original normalization, centering,
projection/node callbacks, group configuration and endpoint selection unless
explicitly overridden. Refitting the same rotation method also retains its
rotation parameters. Supplying new mean groups discards old contrast masks
unless new `rotation_params` are explicitly supplied.

`model()` composes these hooks and accepts a projection callback `(centered_points, rotation_matrix) -> coordinates`. `optimize()` refits nodes of an existing projected model. `node_position_method="solve"` preserves the existing normal-equation solve; `"lstsq"` is an explicit opt-in robust solver. Degenerate-matrix behavior can differ from Armadillo and remains unvalidated.

`project_in(..., centering="current")` keeps the input's own centered coordinates, matching the R `project_in` convention. `centering="reference"` applies the fitted reference center and normalization, corresponding to reusable `rotation.set` behavior. Built-in transforms can be serialized. Arbitrary callable transforms are not silently serialized; attempting this raises.

All trajectory rows fit the basis by default, as in the installed rENA 0.3.0 execution path. `endpoints_only=True` is an explicit Python extension that selects each unit's final row for fitting and projects all steps afterward. It is not a claim that R's similarly named argument has that effect.

## Rotations

```python
from pyena import fit_model

# x must have one predictor value per accumulated row.
# g = fit_model(acc, rotation="generalized", dimensions=3,
#               rotation_params={"x_var": {"score": score}})

# h = fit_model(acc, rotation="hena", dimensions=3,
#               rotation_params={"x_var": "score", "y_var": "revision_rate",
#                                "control_vars": ["experience"]})

# r = fit_model(acc, rotation="regression", dimensions=3,
#               rotation_params={"x_var": "V ~ score + experience"})
```

- Multiple mean contrasts use `rotation_params={"contrasts": [(mask_a, mask_b), ...]}`. They must select nonempty groups and yield independent directions.
- GMR accepts numeric/categorical target columns. Single-predictor directions and a generalized rotation case have executable R oracles.
- Native hENA supports named numeric/categorical targets, control columns, centering and an optional x:y interaction. A numeric x/y/control fixture has an R oracle. Arbitrary categorical codings/formula choices are not fully validated.
- Regression supports `V ~ predictor + control`, interactions using `:`/`*`, and numeric `outcome ~ V`. Only predictor columns referenced by the formula are encoded; unused constant or nonfinite metadata does not affect the fit. Referenced nonfinite/missing predictors still raise. Formula expressions are parsed with an explicit grammar; they are never executed as Python or R. Functions, subtraction, arbitrary expressions and broad R formula semantics are unsupported and raise.
- Forward x-only regression has an R oracle. Reverse formulas, two-axis regression and all `regression_2` cases are implemented only for the documented grammar and are not fully validated against rENA.
- **Experimental:** `get_x1_main_effect()` uses a native multi-response group elastic-net solver with explicit lambda/fold controls. It does not reproduce glmnet's exact lambda path, penalty normalization, fold generation or CV conventions. It emits a runtime warning. This is a functional native estimator, not a claim of glmnet parity.

## Ordered networks

`accumulate_data(..., ordered=True)` exposes native prior-code → current-code transitions. `include_self=True` (default) includes the full C² edge layout used by rENA directed node formulas. A finite forward window also counts current-code → future-code transitions. Binary/count/callable transformations and masks are supported.

**The ordered accumulator is experimental.** This temporal convention is not a full port of tma's sender/receiver/mode/context tensor. A runtime warning states this. Sender/receiver-specific tensors, mode-specific weights and every horizon rule are not implemented. Do not describe these accumulated counts as rENA/tma parity results.

Both `directed_node_positions()` and `directed_node_positions_with_ground_response_added()` are direct NumPy ports of the compiled rENA weighting/normal-equation formulas, separately checked against the local binary on well-conditioned data. The second function requires even-numbered paired rows. Directed 2D arrows and Plotly 3D arrows are available.

## Data, groups, plots and reports

```python
from pyena import (
    define, accumulate, make_set, ena_group, ena_plot,
    add_points, add_group, add_network, mean_network, ena_writeup,
)

# q = define(records, units_cols=["team_id"], codes_cols=code_names,
#            horizon_cols=["conversation_id"], metadata_cols=["condition"])
# acc = accumulate(q, window_size_back=4)
# m = make_set(acc, dimensions=2)
# summaries = ena_group(m, by="condition", method=np.median)

p = ena_plot(m)
add_points(p, m.points, name="units")
add_group(p, m.points, name="mean", confidence_interval="box")
add_network(p, mean_network(m), name="network", threshold=0.01)
p.save("outputs/composed.png")
p.close()
ena_writeup(m, "outputs/methods.html")
```

`add_group` supports mean/median/callable reducers; mean groups support `none`/`box`/`crosshairs` confidence and outlier intervals. `add_network` supports magnitude thresholds, optional clipping, selected node/edge layers, arrows and hiding disconnected nodes. Native plotting does not implement every rENA saturation/opacity/font/layer option and does not promise identical appearance.

`as_trajectory()` rebuilds an existing standard model as `AccumulatedTrajectory` or `SeparateTrajectory`. `add_trajectory()` draws paths; `with_trajectory()` returns a Plotly animation without launching a browser. Advanced rotations require explicit per-step predictor settings when converting models. `move_nodes_to_unit_circle*()` returns a copy with updated centroids; ordering/tie cases have not all been R-validated.

`ena_conversations()` returns original input row indices. **Python indices are zero-based.** Role and NumPy matrix helpers are Python equivalents, not R S3 serialization/dispatch emulation. Their slicing/type behavior should not be assumed identical to R.

`ena_writeup()` supports text, Markdown, HTML and JSON. `methods_report()` and `methods_report_stream()` return methods text. Rmarkdown/Pandoc/Word templates and complete automatic manuscript generation are not implemented.

## Validation and reproduction

```sh
# From the repository root, after installing this source in your Python environment:
MPLBACKEND=Agg python -m unittest discover -s tests -v
python validation/run_rs_workflow.py
python validation/compare_rs.py --dimensions 2
python validation/compare_rs.py --dimensions 3
# Optional legacy design-talk comparison:
# python validation/compare_native.py --data /absolute/path/to/ena-design-talk-sample.csv
python validation/audit_capabilities.py
```

The RS commands resolve paths relative to the checkout and work from another
working directory, including checkout paths with spaces. They do not require
local absolute paths or files from `outputs/`. The default outputs are:

- `outputs/rs_validation/pyena_2d/`: 12 native PNGs, seven CSV matrices, configuration and summary.
- `outputs/rs_validation/pyena_3d/`: 12 native HTML figures, seven CSV matrices, configuration and summary.
- `outputs/rs_validation/2d/` and `3d/`: R references, Python summaries, numerical reports and the 2D native comparison page.

`--data` selects another CSV with the RS schema; `--output` selects an output
folder. `--reuse-r` is rejected when the reference data MD5 or dimension count
differs from the current input. Generated outputs stay ignored by Git; the
Python/R runners and regression tests are versioned.

The comparison and test scripts put this repository's `src` first on the import path, avoiding accidental tests of an older installed pyENA. The library does not call R. Reference tests require Rscript, rENA 0.3.0 and jsonlite; the native tests and production analysis do not.

Validation performed on the staged source and repeated after installation:

- RS.data: 122 named 2D checks and 156 named 3D checks, including classical ANOVA; means rotation and SVD are both covered. The dataset contains 3,824 rows, 48 analysis units, 6 codes and 15 edges (FirstGame 26 units; SecondGame 22).
- 114 named 2D design-talk matrix/statistic/network checks for SVD and means rotation, absolute tolerance 1e-8.
- 96 accumulation cases: three models, binary/count weights, interleaved conversations, backward 0/1/2/4/Inf, forward 0/1/3, plus Conversation windows.
- 12 complete 3D models: three models × two normalizations × two rotations; points, axes, nodes and variance ratios compared with R.
- Pairwise Pearson/Spearman/Fisher intervals, nine Welch/Mann–Whitney samples, single numeric/categorical GMR, one generalized rotation, one hENA/control model, x-only regression, both directed node formulas.
- Native hook/reprojection/serialization, data roles, mask, context retrieval, trajectory, layer/animation, circular layout and report-export checks.
- The existing RS.data handbook examples generate 12 PNG + JSON and 12 HTML + JSON respectively. 2D coordinate and subtraction figures were visually inspected. HTML was generated and structurally tested; browser visual inspection was not completed.

These are concrete fixtures, not proof for all rENA inputs. The capability map deliberately retains Experimental/Partial statuses. The reference schema's repeated unit component in Conversation-trajectory labels is normalized by identity during testing; output labels need not be byte-identical.

No branch, commit, merge, package publication or modification of other pyENA copies is performed. Existing installations in other virtual environments must be updated explicitly before they use this source.

## Implementation evidence

The executable reference is the locally installed rENA 0.3.0 package. Its exported API list is checked by `validation/audit_capabilities.py`. Native node formulas follow the rENA C++ implementation; [CRAN source mirror](https://github.com/cran/rENA) is a secondary source-version reference, not a substitute for testing the installed binary. The package and this port use GPL-3.0 licensing.
