"""Strict, versioned configuration and CSV validation for the CLI."""
from __future__ import annotations

import codecs
import csv
import io
import math
from pathlib import Path

import yaml
from matplotlib.colors import is_color_like


class ConfigError(ValueError):
    """A user-facing configuration or input error."""


class UniqueLoader(yaml.SafeLoader):
    pass


def _mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str):
            raise ConfigError(f"YAML line {key_node.start_mark.line + 1}: keys must be strings")
        if key in result:
            raise ConfigError(f"YAML line {key_node.start_mark.line + 1}: duplicate key {key!r}")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapping)


def section(value, name, allowed, required=()):
    if not isinstance(value, dict):
        raise ConfigError(f"{name}: expected a mapping")
    unknown = set(value) - set(allowed)
    missing = set(required) - set(value)
    if unknown:
        raise ConfigError(f"{name}: unknown fields: {', '.join(sorted(unknown))}")
    if missing:
        raise ConfigError(f"{name}: missing fields: {', '.join(sorted(missing))}")
    return dict(value)


def string(value, name):
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{name}: expected a non-empty string")
    return value


def strings(value, name, minimum=1):
    if not isinstance(value, list) or len(value) < minimum:
        raise ConfigError(f"{name}: expected a list with at least {minimum} entries")
    for item in value:
        string(item, name)
    if len(set(value)) != len(value):
        raise ConfigError(f"{name}: duplicate entries")
    return value


def pair(value, name):
    values = strings(value, name, 2)
    if len(values) != 2:
        raise ConfigError(f"{name}: exactly two different groups are required")
    return values


def integer(value, name, minimum):
    if type(value) is not int or value < minimum:
        raise ConfigError(f"{name}: expected an integer >= {minimum}")
    return value


def load_config(path: Path):
    try:
        raw = yaml.load(path.read_text(encoding="utf-8"), Loader=UniqueLoader)
    except yaml.YAMLError as exc:
        raise ConfigError(f"Invalid YAML: {exc}") from exc
    cfg = section(raw, "config", {"schema_version", "data", "analysis", "comparison", "output"},
                  {"schema_version", "data", "analysis", "comparison"})
    if type(cfg["schema_version"]) is not int or cfg["schema_version"] != 1:
        raise ConfigError("schema_version: only version 1 is supported")
    data = section(cfg["data"], "data", {"path", "encoding", "sort_by"}, {"path"})
    string(data["path"], "data.path")
    if data["path"].startswith("bundled:") and data["path"] != "bundled:rs":
        raise ConfigError("data.path: unknown bundled dataset; use bundled:rs")
    data.setdefault("encoding", "utf-8-sig")
    string(data["encoding"], "data.encoding")
    try:
        codecs.lookup(data["encoding"])
    except LookupError as exc:
        raise ConfigError("data.encoding: unknown encoding") from exc
    data.setdefault("sort_by", [])
    if not isinstance(data["sort_by"], list):
        raise ConfigError("data.sort_by: expected a list")
    sorts = []
    for i, entry in enumerate(data["sort_by"]):
        name = f"data.sort_by[{i}]"
        entry = section(entry, name, {"column", "type"}, {"column", "type"})
        string(entry["column"], name + ".column")
        if entry["type"] not in ("string", "integer", "number"):
            raise ConfigError(name + ".type: use string, integer, or number")
        sorts.append(entry)
    data["sort_by"] = sorts
    cfg["data"] = data

    a = section(cfg["analysis"], "analysis", {"units", "conversation", "metadata", "codes", "model", "dimensions", "window", "rotation"},
                {"units", "conversation", "codes"})
    for name in ("units", "conversation", "codes"):
        strings(a[name], "analysis." + name, 2 if name == "codes" else 1)
    if any("__" in code for code in a["codes"]):
        raise ConfigError("analysis.codes: '__' is reserved for edge labels")
    a.setdefault("metadata", [])
    strings(a["metadata"], "analysis.metadata", 0)
    a.setdefault("model", "EndPoint")
    a.setdefault("dimensions", 2)
    if a["model"] != "EndPoint":
        raise ConfigError("analysis.model: CLI version 1 supports EndPoint only")
    if type(a["dimensions"]) is not int or a["dimensions"] != 2:
        raise ConfigError("analysis.dimensions: CLI version 1 supports 2 only")
    w = section(a.get("window", {}), "analysis.window", {"type", "size_back", "size_forward"})
    w.setdefault("type", "MovingStanzaWindow")
    if w["type"] not in ("MovingStanzaWindow", "Conversation"):
        raise ConfigError("analysis.window.type: use MovingStanzaWindow or Conversation")
    if w["type"] == "Conversation":
        if "size_back" in w or "size_forward" in w:
            raise ConfigError("analysis.window: Conversation does not accept size parameters")
    else:
        w.setdefault("size_back", 1)
        w.setdefault("size_forward", 0)
        integer(w["size_back"], "analysis.window.size_back", 1)
        integer(w["size_forward"], "analysis.window.size_forward", 0)
    a["window"] = w
    r = section(a.get("rotation", {}), "analysis.rotation", {"method", "column", "groups"})
    r.setdefault("method", "svd")
    if r["method"] == "mean":
        string(r.get("column"), "analysis.rotation.column")
        pair(r.get("groups"), "analysis.rotation.groups")
    elif r["method"] != "svd" or "column" in r or "groups" in r:
        raise ConfigError("analysis.rotation: use mean with column/groups, or svd without them")
    a["rotation"] = r
    c = section(cfg["comparison"], "comparison", {"column", "groups"}, {"column", "groups"})
    string(c["column"], "comparison.column")
    pair(c["groups"], "comparison.groups")
    if any("/" in g or "\\" in g or any(ord(ch) < 32 for ch in g) for g in c["groups"]):
        raise ConfigError("comparison.groups: labels cannot contain path separators or control characters")
    if c["groups"][0].lower() == c["groups"][1].lower():
        raise ConfigError("comparison.groups: labels must differ ignoring case (output filenames)")
    for col in [c["column"]] + ([r["column"]] if r["method"] == "mean" else []):
        if col not in a["metadata"]:
            a["metadata"].append(col)
    cfg["analysis"], cfg["comparison"] = a, c

    out = section(cfg.get("output", {}), "output", {"directory", "summary_only", "colors", "individual_comparison"})
    out.setdefault("directory", "./outputs")
    string(out["directory"], "output.directory")
    out.setdefault("summary_only", False)
    if type(out["summary_only"]) is not bool:
        raise ConfigError("output.summary_only: expected true or false")
    colors = section(out.get("colors", {}), "output.colors", {"group_a", "group_b"})
    for name, default in (("group_a", "#ff0000"), ("group_b", "#0000ff")):
        colors.setdefault(name, default)
        string(colors[name], "output.colors." + name)
        if not is_color_like(colors[name]):
            raise ConfigError("output.colors." + name + ": invalid color")
    out["colors"] = colors
    if "individual_comparison" in out:
        focus = section(out["individual_comparison"], "output.individual_comparison", {"unit_a", "unit_b"}, {"unit_a", "unit_b"})
        for key in focus:
            string(focus[key], "output.individual_comparison." + key)
        out["individual_comparison"] = focus
    cfg["output"] = out
    for block, key in ((data, "path"), (out, "directory")):
        if block[key] != "bundled:rs":
            block[key] = str((path.parent / Path(block[key]).expanduser()).resolve())
    return cfg


def read_records(payload: bytes, cfg):
    data, a, comp = cfg["data"], cfg["analysis"], cfg["comparison"]
    reader = csv.DictReader(io.StringIO(payload.decode(data["encoding"]), newline=""), strict=True)
    headers = reader.fieldnames or []
    if len(set(headers)) != len(headers):
        raise ConfigError("CSV: duplicate column names")
    required = set(a["units"] + a["conversation"] + a["metadata"] + a["codes"] + [s["column"] for s in data["sort_by"]])
    if required - set(headers):
        raise ConfigError("CSV: missing columns: " + ", ".join(sorted(required - set(headers))))
    records = []
    unit_meta = {}
    group_columns = [comp["column"]]
    if a["rotation"]["method"] == "mean" and a["rotation"]["column"] not in group_columns:
        group_columns.append(a["rotation"]["column"])
    labels = {}
    for row in reader:
        line = reader.line_num
        if None in row or any(v is None for v in row.values()):
            raise ConfigError(f"CSV line {line}: field count does not match header")
        for col in a["codes"]:
            try:
                number = float(row[col])
            except ValueError as exc:
                raise ConfigError(f"CSV line {line}, {col}: expected 0 or 1; blanks are not zero") from exc
            if number not in (0.0, 1.0):
                raise ConfigError(f"CSV line {line}, {col}: expected 0 or 1")
        for col in set(a["units"] + a["conversation"] + a["metadata"]):
            if not row[col].strip():
                raise ConfigError(f"CSV line {line}, {col}: empty identifier or metadata")
        unit = tuple(row[col] for col in a["units"])
        meta = tuple(row[col] for col in group_columns)
        if unit in unit_meta and unit_meta[unit] != meta:
            raise ConfigError(f"CSV line {line}: inconsistent grouping metadata for unit {unit}")
        unit_meta[unit] = meta
        label = "::".join(unit)
        if label in labels and labels[label] != unit:
            raise ConfigError(f"CSV: ambiguous unit label {label!r}; '::' is reserved")
        labels[label] = unit
        records.append(row)
    if not records:
        raise ConfigError("CSV: no data rows")
    for name, spec in [("comparison", comp)] + ([("analysis.rotation", a["rotation"])] if a["rotation"]["method"] == "mean" else []):
        for group in spec["groups"]:
            units = {tuple(row[c] for c in a["units"]) for row in records if row[spec["column"]] == group}
            if len(units) < 2:
                raise ConfigError(f"{name}: group {group!r} has {len(units)} units; at least 2 required")
    def sort_key(row):
        result = []
        for spec in data["sort_by"]:
            value = row[spec["column"]]
            try:
                value = {"string": str, "integer": int, "number": float}[spec["type"]](value)
                if isinstance(value, float) and not math.isfinite(value):
                    raise ValueError("not finite")
            except ValueError as exc:
                raise ConfigError(f"data.sort_by: {spec['column']} value {value!r} is not {spec['type']}") from exc
            result.append(value)
        return tuple(result)
    if data["sort_by"]:
        records.sort(key=sort_key)
    focus = cfg["output"].get("individual_comparison")
    if focus:
        for key, group in zip(("unit_a", "unit_b"), comp["groups"]):
            label = focus[key]
            if label not in labels or unit_meta[labels[label]][group_columns.index(comp["column"])] != group:
                raise ConfigError(f"output.individual_comparison.{key}: unit must exist in group {group!r}")
    return records
