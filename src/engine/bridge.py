"""Bridge between the pyENA platform and the pyENA library.

Every number and figure produced here comes from pyENA's public API. This
module only sequences the calls, reports which step is running, applies the
design-system figure style and serialises results for the browser.

`ena()` is `accumulate_data()` followed by `make_set()`; the two are called
separately here so the interface can report each step as it happens.
"""

from __future__ import annotations

import io
import json
import re

import matplotlib

matplotlib.use("Agg")

import matplotlib.colors as mcolors
import matplotlib.pyplot as plt
from matplotlib import font_manager
from matplotlib.lines import Line2D
from matplotlib.markers import MarkerStyle
from matplotlib.patches import Rectangle
from matplotlib.ticker import MultipleLocator

from pyena import (
    accumulate_data,
    create_individual_network_plot,
    create_network_plot,
    create_network_with_point_groups_plot,
    create_points_ci_overlay_plot,
    create_points_ci_plot,
    group_network,
    group_points,
    make_set,
    subtract_networks,
    summarize_ena_results,
)

# The last successful run. Figures are redrawn from it without recomputing.
_STATE: dict[str, object] = {}
_TOKENS: dict[str, str] = {}

# pyENA draws these in fixed colours; they are mapped onto design tokens.
_LIBRARY_NODE_COLOR = "#222222"
_LIBRARY_REFERENCE_COLOR = "#cccccc"

# The second group is told apart by shape as well as colour.
_SECOND_GROUP_POINT = "^"
_SECOND_GROUP_MEAN = "D"


class PlatformError(Exception):
    def __init__(self, kind: str, message: str, detail: str | None = None):
        super().__init__(message)
        self.kind = kind
        self.message = message
        self.detail = detail


# --------------------------------------------------------------------------
# Style
# --------------------------------------------------------------------------


def configure(tokens_json: str, variable_font_path: str) -> str:
    """Register Figtree at weight 400 and set rcParams from the design tokens."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont

    tokens = json.loads(tokens_json)
    _TOKENS.clear()
    _TOKENS.update(tokens)

    # The variable font's default instance is Light (300); body text is 400.
    regular_path = "/tmp/Figtree-Regular.ttf"
    font = TTFont(variable_font_path)
    instantiateVariableFont(font, {"wght": 400}, inplace=True, updateFontNames=True)
    font.save(regular_path)
    font_manager.fontManager.addfont(regular_path)
    family = font_manager.FontProperties(fname=regular_path).get_name()

    plt.rcParams.update(
        {
            "font.family": family,
            "font.size": 10,
            "figure.facecolor": tokens["surface"],
            "axes.facecolor": tokens["surface"],
            "savefig.facecolor": tokens["surface"],
            "text.color": tokens["ink"],
            "axes.edgecolor": tokens["border"],
            "axes.labelcolor": tokens["ink-secondary"],
            "xtick.color": tokens["ink-secondary"],
            "ytick.color": tokens["ink-secondary"],
            "axes.spines.top": False,
            "axes.spines.right": False,
            "legend.facecolor": tokens["surface"],
            "legend.edgecolor": tokens["border"],
            "legend.framealpha": 1.0,
            "legend.fancybox": False,
            "svg.fonttype": "path",
            "svg.hashsalt": "pyena-platform",
        }
    )
    return family


def _hex(color) -> str:
    return mcolors.to_hex(color, keep_alpha=False).lower()


def _finish(fig, ax, opts: dict) -> None:
    """Map pyENA's fixed colours onto tokens and apply the figure options."""
    ink = _TOKENS["ink"]
    border = _TOKENS["border"]
    second = _hex(opts["color_b"])

    for line in ax.lines:
        if _hex(line.get_color()) == _LIBRARY_REFERENCE_COLOR:
            line.set_color(border)

    for collection in ax.collections:
        faces = collection.get_facecolors()
        if len(faces) == 0:
            continue
        face = _hex(faces[0])
        if face == _LIBRARY_NODE_COLOR:
            collection.set_facecolor(ink)
            continue
        edges = collection.get_edgecolors()
        is_mean = len(edges) > 0 and _hex(edges[0]) == "#000000"
        if is_mean:
            collection.set_edgecolor(ink)
        if face == second:
            marker = MarkerStyle(_SECOND_GROUP_MEAN if is_mean else _SECOND_GROUP_POINT)
            collection.set_paths([marker.get_path().transformed(marker.get_transform())])

    if not opts.get("show_labels", True):
        for text in list(ax.texts):
            text.remove()

    if not opts.get("show_ci", True):
        for patch in list(ax.patches):
            if isinstance(patch, Rectangle) and not patch.get_fill():
                patch.remove()

    legend = ax.get_legend()
    if legend is not None:
        handles = list(legend.legend_handles)
        labels = [text.get_text() for text in legend.get_texts()]
        legend.remove()
        if handles and all(isinstance(handle, Line2D) for handle in handles):
            ax.legend(handles=handles, labels=labels, loc="best")
        else:
            ax.legend(loc="best")

    fig.tight_layout()


# --------------------------------------------------------------------------
# Figures
# --------------------------------------------------------------------------


# The multiplier generate_analysis_outputs applies to a subtracted individual network.
_INDIVIDUAL_SUBTRACTED_MULTIPLIER = 5.0


def _focus_units(opts: dict) -> tuple[str, str]:
    """The two units in the individual comparison: one from each group.

    A requested unit is used when it belongs to its group; otherwise the
    group's first unit, so a stale choice never stops the figures drawing.
    """
    s = _STATE
    ena_set = s["ena_set"]
    groups = [meta.get(s["group_column"]) for meta in ena_set.enadata.unit_metadata]
    chosen = []
    for requested, label in ((opts.get("focus_unit_a"), s["label_a"]), (opts.get("focus_unit_b"), s["label_b"])):
        members = [unit for unit, group in zip(ena_set.unit_labels, groups) if group == label]
        chosen.append(requested if requested in members else members[0])
    return chosen[0], chosen[1]


def _figure_builders(opts: dict) -> dict:
    """The twelve figures generate_analysis_outputs draws, with the same calls."""
    s = _STATE
    ena_set = s["ena_set"]
    a, b = s["label_a"], s["label_b"]
    ca, cb = opts["color_a"], opts["color_b"]
    ga, gb, sub = s["network_a"], s["network_b"], s["network_sub"]
    pa, pb = s["points_a"], s["points_b"]
    unit_a, unit_b = _focus_units(opts)
    index_a = ena_set.unit_labels.index(unit_a)
    index_b = ena_set.unit_labels.index(unit_b)
    network_unit_a = ena_set.line_weights[index_a]
    network_unit_b = ena_set.line_weights[index_b]
    point_unit_a = ena_set.points[index_a : index_a + 1]
    point_unit_b = ena_set.points[index_b : index_b + 1]

    return {
        "a_mean_network": lambda: create_network_plot(
            ena_set, ga, title=f"{a} Mean Network", line_colors=(ca, ca)
        ),
        "b_mean_network": lambda: create_network_plot(
            ena_set, gb, title=f"{b} Mean Network", line_colors=(cb, cb)
        ),
        "subtracted_mean_network": lambda: create_network_plot(
            ena_set,
            sub,
            title=f"Subtracted Mean Network: {a} - {b}",
            show_legend=True,
            legend_labels=(f"+  Stronger in {a}", f"\u2212  Stronger in {b}"),
            line_colors=(ca, cb),
        ),
        "a_points_ci": lambda: create_points_ci_plot(pa, ca, a, f"{a} Points, Mean, and 95% CI"),
        "b_points_ci": lambda: create_points_ci_plot(pb, cb, b, f"{b} Points, Mean, and 95% CI"),
        "group_points_overlay": lambda: create_points_ci_overlay_plot(
            [(pa, ca, a), (pb, cb, b)],
            title=f"{a} vs {b} Points, Means, and 95% CI",
        ),
        "a_network_with_points": lambda: create_network_with_point_groups_plot(
            ena_set,
            ga,
            point_groups=[{"points": pa, "color": ca}],
            title=f"{a} Mean Network and Points",
            line_colors=(ca, ca),
        ),
        "b_network_with_points": lambda: create_network_with_point_groups_plot(
            ena_set,
            gb,
            point_groups=[{"points": pb, "color": cb}],
            title=f"{b} Mean Network and Points",
            line_colors=(cb, cb),
        ),
        "subtracted_network_with_points": lambda: create_network_with_point_groups_plot(
            ena_set,
            sub,
            point_groups=[
                {"points": pa, "color": ca, "label": a, "alpha": 0.55},
                {"points": pb, "color": cb, "label": b, "alpha": 0.55},
            ],
            title="Subtracted Mean Network with Group Points",
            show_legend=True,
            line_colors=(ca, cb),
        ),
        "individual_a_network": lambda: create_individual_network_plot(
            ena_set, network_unit_a, point_unit_a, ca, title=f"Individual Network: {unit_a}", line_colors=(ca, ca)
        ),
        "individual_b_network": lambda: create_individual_network_plot(
            ena_set, network_unit_b, point_unit_b, cb, title=f"Individual Network: {unit_b}", line_colors=(cb, cb)
        ),
        "subtracted_individual_network": lambda: create_network_with_point_groups_plot(
            ena_set,
            subtract_networks(network_unit_a, network_unit_b) * _INDIVIDUAL_SUBTRACTED_MULTIPLIER,
            point_groups=[
                {"points": point_unit_a, "color": ca, "label": unit_a, "size": 80, "show_mean": False, "zorder": 5},
                {"points": point_unit_b, "color": cb, "label": unit_b, "size": 80, "show_mean": False, "zorder": 5},
            ],
            title=f"Subtracted network: {unit_a} - {unit_b}",
            show_legend=True,
            line_colors=(ca, cb),
        ),
    }


def _draw(figure_id: str, opts: dict):
    if "ena_set" not in _STATE:
        raise PlatformError("no_state", "There is no model in the engine to draw from.")
    builders = _figure_builders(opts)
    if figure_id not in builders:
        raise PlatformError("figure", f"Unknown figure {figure_id}.")
    fig, ax = builders[figure_id]()
    _finish(fig, ax, opts)
    return fig


def _graph_paper(fig, ax) -> None:
    """Draw the graph paper in the plot itself, for display.

    The design system puts graph paper under any network the product draws.
    A paper tile behind the image cannot line up with the plot: it is anchored
    to the frame, not to the data. Drawn here, in data coordinates, the lines
    are the plot's own, so every node, point and edge sits on them at any size.
    The major lines fall on pyENA's own tick steps, with three finer lines
    between, and where the two axes' spans are comparable (every network plot,
    and point plots within a factor of two) both take one step and an equal
    scale, so the squares are square. Downloads (export) keep pyENA's own look.
    """
    border = _TOKENS["border"]
    (x0, x1), (y0, y1) = ax.get_xlim(), ax.get_ylim()

    def step_of(ticks, span):
        ticks = sorted(ticks)
        return abs(ticks[1] - ticks[0]) if len(ticks) > 1 else abs(span) / 4

    step_x = step_of(ax.xaxis.get_majorticklocs(), x1 - x0)
    step_y = step_of(ax.yaxis.get_majorticklocs(), y1 - y0)
    ratio = abs(x1 - x0) / max(abs(y1 - y0), 1e-12)
    if 0.5 <= ratio <= 2.0:
        # One step and one scale on both axes: square cells, and distances
        # that read the same across and up (both dimensions are in the same
        # units). The frame stays square; the narrower range widens to fit.
        # A plot whose spans differ more keeps separate scales, rather than
        # crushing its points into a strip.
        step_x = step_y = max(step_x, step_y)
        ax.set_aspect("equal", adjustable="datalim")
    for axis, step in ((ax.xaxis, step_x), (ax.yaxis, step_y)):
        axis.set_major_locator(MultipleLocator(step))
        axis.set_minor_locator(MultipleLocator(step / 4))

    ax.set_axisbelow(True)
    ax.grid(True, which="major", color=border, linewidth=0.9)
    ax.grid(True, which="minor", color=border, linewidth=0.45)
    ax.tick_params(which="both", length=0)
    for spine in ax.spines.values():
        spine.set_visible(False)
    # pyENA's zero lines (mapped to border in _finish) would vanish among the
    # paper's own lines; on paper they are drawn in ink-secondary.
    for line in ax.lines:
        if _hex(line.get_color()) == _hex(border):
            line.set_color(_TOKENS["ink-secondary"])
            line.set_linewidth(0.8)
    fig.tight_layout()


def render(ids_json: str, opts_json: str) -> str:
    """Display SVGs on their own graph paper; the frame around them stays plain paper."""
    opts = json.loads(opts_json)
    out = {}
    for figure_id in json.loads(ids_json):
        fig = _draw(figure_id, opts)
        _graph_paper(fig, fig.axes[0])
        buffer = io.StringIO()
        fig.savefig(buffer, format="svg", transparent=True)
        plt.close(fig)
        out[figure_id] = buffer.getvalue()
    return json.dumps({"figures": out, "focus": list(_focus_units(opts))})


def export(figure_id: str, fmt: str, opts_json: str) -> bytes:
    """A figure file for download: SVG, or PNG at 300 dpi as save_figure writes."""
    fig = _draw(figure_id, json.loads(opts_json))
    buffer = io.BytesIO()
    if fmt == "png":
        fig.savefig(buffer, format="png", dpi=300)
    else:
        fig.savefig(buffer, format="svg")
    plt.close(fig)
    return buffer.getvalue()


# --------------------------------------------------------------------------
# 3D figures (pyENA's plot3d.py, plotly): drawn for three-dimensional models
# --------------------------------------------------------------------------


def _figure_builders_3d(opts: dict) -> dict:
    """The four figures generate_analysis_outputs_3d draws, with its defaults."""
    from pyena import plot_network_3d, plot_network_with_points_3d

    s = _STATE
    ena_set = s["ena_set"]
    a, b = s["label_a"], s["label_b"]
    ca, cb = opts["color_a"], opts["color_b"]
    ga, gb, sub = s["network_a"], s["network_b"], s["network_sub"]
    groups = [meta.get(s["group_column"]) for meta in ena_set.enadata.unit_metadata]
    labels_a = [unit for unit, group in zip(ena_set.unit_labels, groups) if group == a]
    labels_b = [unit for unit, group in zip(ena_set.unit_labels, groups) if group == b]

    def point_group(points, color, label, unit_labels):
        # generate_analysis_outputs_3d's point_size, point_alpha and show_mean;
        # unit_labels is plot3d's own option, so hovering a point names its unit.
        return {"points": points, "color": color, "label": label, "size": 5.0, "alpha": 0.7,
                "show_mean": True, "unit_labels": unit_labels}

    return {
        "subtracted_3d_network_with_points": lambda: plot_network_with_points_3d(
            ena_set=ena_set,
            network=sub,
            point_groups=[
                point_group(s["points_a"], ca, a, labels_a),
                point_group(s["points_b"], cb, b, labels_b),
            ],
            title=f"3D ENA: {a} vs {b}",
            colors=(ca, cb),
        ),
        "subtracted_3d_network": lambda: plot_network_3d(
            ena_set=ena_set, network=sub, title=f"Subtracted 3D ENA Network: {a} - {b}", colors=(ca, cb)
        ),
        "a_3d_network": lambda: plot_network_3d(
            ena_set=ena_set, network=ga, title=f"{a} 3D ENA Network", colors=(ca, ca)
        ),
        "b_3d_network": lambda: plot_network_3d(
            ena_set=ena_set, network=gb, title=f"{b} 3D ENA Network", colors=(cb, cb)
        ),
    }


def _finish_3d(fig, opts: dict) -> None:
    """Design tokens for plotly's defaults; the geometry is pyENA's."""
    t = _TOKENS
    font = "Figtree, sans-serif"
    axis = dict(
        backgroundcolor=t["surface-soft"],
        showbackground=True,
        gridcolor=t["border"],
        zerolinecolor=t["ink-secondary"],
        linecolor=t["border"],
        tickfont=dict(color=t["ink-secondary"], size=10),
        title_font=dict(color=t["ink-secondary"], size=12),
    )
    fig.update_layout(
        title_text="",
        font=dict(family=font, color=t["ink"], size=12),
        paper_bgcolor=t["surface"],
        margin=dict(l=0, r=0, b=0, t=0),
        legend=dict(bgcolor=t["surface"], bordercolor=t["border"], borderwidth=1, x=0.01, y=0.99),
        hoverlabel=dict(bgcolor=t["ink"], bordercolor=t["ink"], font=dict(family=font, color=t["surface"], size=12)),
        modebar=dict(bgcolor="rgba(0,0,0,0)", color=t["ink-secondary"], activecolor=t["brand"]),
        scene=dict(dragmode="turntable", xaxis=axis, yaxis=axis, zaxis=axis),
    )
    label_b = _STATE["label_b"]
    for trace in fig.data:
        if trace.name == "Codes":
            trace.marker.color = t["ink"]
            trace.textfont = dict(family=font, color=t["ink"], size=12)
            if not opts.get("show_labels", True):
                trace.mode = "markers"
        elif trace.name and trace.name.endswith(" Mean"):
            trace.marker.line.color = t["ink"]
        elif trace.name == label_b:
            # No triangle in plotly's 3D symbols: the second group's units are squares.
            trace.marker.symbol = "square"


def _draw_3d(figure_id: str, opts: dict):
    if "ena_set" not in _STATE:
        raise PlatformError("no_state", "There is no model in the engine to draw from.")
    builders = _figure_builders_3d(opts)
    if figure_id not in builders:
        raise PlatformError("figure", f"Unknown figure {figure_id}.")
    fig = builders[figure_id]()
    _finish_3d(fig, opts)
    return fig


def render3d(opts_json: str) -> str:
    opts = json.loads(opts_json)
    return json.dumps({figure_id: _draw_3d(figure_id, opts).to_json() for figure_id in _figure_builders_3d(opts)})


def export3d(figure_id: str, opts_json: str) -> str:
    """A standalone interactive page, as pyENA's save_figure_html writes it."""
    return _draw_3d(figure_id, json.loads(opts_json)).to_html(include_plotlyjs=True, full_html=True)


# --------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------


def run(records_json: str, config_json: str, phase) -> str:
    try:
        return json.dumps({"ok": _run(json.loads(records_json), json.loads(config_json), phase)})
    except PlatformError as exc:
        return json.dumps({"error": {"kind": exc.kind, "message": exc.message, "detail": exc.detail}})
    except Exception as exc:  # translated for the interface; never a traceback
        return json.dumps({"error": _translate(exc)})


def _run(records: list, cfg: dict, phase) -> dict:
    a, b = cfg["groups"]
    group_column = cfg["group_column"]
    # pyENA reads group membership from unit metadata, so the group column
    # must be carried there even when the researcher did not list it.
    metadata = list(cfg.get("metadata") or [])
    if group_column not in metadata:
        metadata.append(group_column)

    phase("accumulate")
    enadata = accumulate_data(
        data=records,
        codes=cfg["codes"],
        units=cfg["units"],
        conversation=cfg["conversation"],
        metadata=metadata,
        model=cfg["model"],
        window=cfg["window"],
        window_size_back=cfg["window_size_back"],
        window_size_forward=cfg["window_size_forward"],
    )

    phase("rotate")
    ena_set = make_set(
        enadata=enadata,
        dimensions=int(cfg.get("dimensions", 2)),
        rotation=cfg["rotation"],
        group_column=group_column,
        groups=(a, b),
    )

    phase("networks")
    network_a = group_network(ena_set, group_column, a)
    network_b = group_network(ena_set, group_column, b)
    network_sub = subtract_networks(network_a, network_b)
    points_a = group_points(ena_set, group_column, a)
    points_b = group_points(ena_set, group_column, b)

    phase("statistics")
    summary = summarize_ena_results(
        ena_set=ena_set,
        group_a_label=a,
        group_b_label=b,
        group_column=group_column,
        group_a_points=points_a,
        group_b_points=points_b,
        group_a_network=network_a,
        group_b_network=network_b,
        subtracted_mean_network=network_sub,
    )

    _STATE.update(
        ena_set=ena_set,
        label_a=a,
        label_b=b,
        group_column=group_column,
        network_a=network_a,
        network_b=network_b,
        network_sub=network_sub,
        points_a=points_a,
        points_b=points_b,
    )

    units = [
        {"label": label, "group": meta.get(group_column)}
        for label, meta in zip(ena_set.unit_labels, ena_set.enadata.unit_metadata)
    ]
    return {
        # Written exactly as examples/rs/example.py writes it, so the two diff clean.
        "summary_json": json.dumps(summary, indent=2),
        "units": units,
    }


_MIN_GROUP = re.compile(r"^(.*) requires at least (\d+) points per group, but received n_x=(\d+) and n_y=(\d+)\.$")


def _translate(exc: Exception) -> dict:
    message = str(exc)
    if isinstance(exc, ValueError):
        match = _MIN_GROUP.match(message)
        if match:
            detail = {"test": match.group(1), "need": int(match.group(2)), "n_x": int(match.group(3)), "n_y": int(match.group(4))}
            return {"kind": "group_size", "message": message, "detail": json.dumps(detail)}
        if "zero variance" in message:
            return {"kind": "zero_variance", "message": message, "detail": None}
        if message.startswith("group_column and groups are required for means rotation"):
            return {"kind": "means_rotation", "message": message, "detail": None}
        if message.startswith("Both groups must contain at least one unit for means rotation"):
            return {"kind": "means_rotation_empty", "message": message, "detail": None}
        if "expected frequencies has a zero element" in message:
            return {"kind": "chi_square_zero", "message": message, "detail": None}
        if message.startswith("Failed to estimate ENA node positions"):
            return {"kind": "singular", "message": message, "detail": None}
    return {"kind": "library", "message": f"{type(exc).__name__}: {message}", "detail": None}
