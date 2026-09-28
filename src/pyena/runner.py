"""Run a validated CLI analysis using the public pyENA API."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
from importlib import metadata, resources
import json
from pathlib import Path
import platform
from uuid import uuid4

import yaml

from .config import ConfigError, read_records
from .rena import ena, generate_analysis_outputs, group_network, group_points, summarize_ena_results


def bundled_file(name):
    return resources.files("pyena").joinpath("resources", "rs", name)


def load_input(cfg):
    source = cfg["data"]["path"]
    payload = bundled_file("RS.data.csv").read_bytes() if source == "bundled:rs" else Path(source).read_bytes()
    return read_records(payload, cfg), hashlib.sha256(payload).hexdigest()


def _write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")


def run_analysis(cfg, config_path, records, digest):
    root = Path(cfg["output"]["directory"])
    root.mkdir(parents=True, exist_ok=True)
    run_id = "run_" + datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S") + "_" + uuid4().hex[:12]
    output = root / run_id
    output.mkdir()  # Exclusive creation; never overwrite an existing run.
    (output / "resolved_config.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True), encoding="utf-8")
    manifest = {
        "run_id": run_id, "status": "running", "started_at": datetime.now(timezone.utc).isoformat(),
        "config_path": str(config_path), "data_source": cfg["data"]["path"], "data_sha256": digest,
        "input_rows": len(records), "python_version": platform.python_version(),
        "versions": {name: metadata.version(name) for name in ("pyENA", "numpy", "scipy", "matplotlib", "plotly", "PyYAML")},
        "generated_files": [],
    }
    manifest_path = output / "run_manifest.json"
    _write_json(manifest_path, manifest)
    try:
        a, c, out = cfg["analysis"], cfg["comparison"], cfg["output"]
        w, r = a["window"], a["rotation"]
        model = ena(data=records, codes=a["codes"], units=a["units"], conversation=a["conversation"],
                    metadata=a["metadata"], model=a["model"], dimensions=a["dimensions"],
                    window=w["type"], window_size_back=w.get("size_back", 1), window_size_forward=w.get("size_forward", 0),
                    rotation=r["method"], group_column=r.get("column"), groups=tuple(r["groups"]) if "groups" in r else None)
        group_a, group_b = c["groups"]
        points = [group_points(model, c["column"], group) for group in c["groups"]]
        for group, values in zip(c["groups"], points):
            if len(values) < 2:
                raise ConfigError(f"After ENA filtering, group {group!r} has {len(values)} points; at least 2 required")
        focus = out.get("individual_comparison", {})
        for label in focus.values():
            if label not in model.unit_labels:
                raise ConfigError(f"Focus unit {label!r} was removed during ENA filtering")
        kwargs = dict(ena_set=model, group_a_label=group_a, group_b_label=group_b, group_column=c["column"])
        if out["summary_only"]:
            networks = [group_network(model, c["column"], group) for group in c["groups"]]
            summary = summarize_ena_results(**kwargs, group_a_points=points[0], group_b_points=points[1],
                        group_a_network=networks[0], group_b_network=networks[1], subtracted_mean_network=networks[0] - networks[1])
        else:
            import matplotlib
            matplotlib.use("Agg")
            colors = out["colors"]
            ca, cb = colors["group_a"], colors["group_b"]
            result = generate_analysis_outputs(**kwargs, output_dir=output / "figures", group_a_color=ca, group_b_color=cb,
                        group_a_line_colors=(ca, ca), group_b_line_colors=(cb, cb), subtracted_line_colors=(ca, cb),
                        focus_unit_a=focus.get("unit_a"), focus_unit_b=focus.get("unit_b"))
            summary = result["analysis_summary"]
            # The public API also writes a summary beside its figures. Keep a single
            # canonical summary at the run root for CLI consumers.
            (output / "figures" / "statistical_summary.json").unlink()
        _write_json(output / "statistical_summary.json", summary)
        manifest["status"] = "completed"
        manifest["model_units"] = len(model.unit_labels)
    except Exception as exc:
        manifest["status"] = "failed"
        manifest["error"] = str(exc)
        raise ConfigError(f"{exc}\nFailed run recorded at: {output}") from exc
    finally:
        manifest["finished_at"] = datetime.now(timezone.utc).isoformat()
        manifest["generated_files"] = sorted(str(p.relative_to(output)) for p in output.rglob("*") if p.is_file())
        _write_json(manifest_path, manifest)
    return output
