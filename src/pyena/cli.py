"""Command-line entry point; run ``pyena --help`` for usage."""
from __future__ import annotations

import argparse
import csv
from importlib.metadata import version
from pathlib import Path
import sys

from .config import ConfigError, load_config
from .runner import bundled_file, load_input, run_analysis


def build_parser():
    parser = argparse.ArgumentParser(description="Run ENA from YAML. First use creates analysis.yaml and runs the bundled RS example.")
    parser.add_argument("--version", action="version", version="pyENA " + version("pyENA"))
    parser.add_argument("--config", type=Path, help="Existing YAML file (default: ./analysis.yaml)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--init-only", action="store_true", help="Create the bundled RS configuration without running")
    mode.add_argument("--validate", action="store_true", help="Validate existing YAML and CSV without fitting or writing outputs")
    parser.add_argument("--summary-only", action="store_true", help="Override YAML to skip figures")
    parser.add_argument("--output", type=Path, help="Override output root; relative to the YAML directory")
    parser.add_argument("--debug", action="store_true", help="Show a traceback on failure")
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.init_only and (args.summary_only or args.output is not None):
        parser.error("--init-only cannot be combined with execution overrides")
    path = (args.config or Path("analysis.yaml")).expanduser().resolve()
    try:
        if args.init_only:
            # Explicit initialization can target --config; never replace a file.
            with path.open("x", encoding="utf-8") as handle:
                handle.write(bundled_file("analysis.yaml").read_text(encoding="utf-8"))
            print(f"Created configuration: {path}")
            return 0
        if not path.exists():
            if args.config is not None or args.validate:
                raise ConfigError(f"Configuration not found: {path}. Use --init-only to create one.")
            with path.open("x", encoding="utf-8") as handle:
                handle.write(bundled_file("analysis.yaml").read_text(encoding="utf-8"))
            print(f"Created configuration: {path}")
        cfg = load_config(path)
        if args.summary_only:
            cfg["output"]["summary_only"] = True
        if args.output is not None:
            cfg["output"]["directory"] = str((path.parent / args.output.expanduser()).resolve())
        records, digest = load_input(cfg)
        if args.validate:
            print(f"Valid configuration and CSV: {path} ({len(records)} rows). Model estimability is checked during execution.")
            return 0
        print(f"Configuration: {path}")
        print(f"Data: {cfg['data']['path']} ({len(records)} rows)")
        output = run_analysis(cfg, path, records, digest)
        print(f"Analysis completed: {output}")
        print(f"Statistical summary: {output / 'statistical_summary.json'}")
        return 0
    except (ValueError, OSError, UnicodeError, csv.Error) as exc:
        if args.debug:
            raise
        print(f"pyena: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
