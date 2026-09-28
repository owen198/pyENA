"""CLI integration and regression checks; run with unittest discover."""
from contextlib import redirect_stderr, redirect_stdout
from copy import deepcopy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
import yaml

from pyena.cli import main
from pyena.config import ConfigError, load_config, read_records
from pyena.runner import bundled_file, load_input, run_analysis
from pyena import ena, group_network, group_points, summarize_ena_results


class CLITests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.path = self.root / "analysis.yaml"
        self.path.write_text(bundled_file("analysis.yaml").read_text(), encoding="utf-8")
        self.cfg = load_config(self.path)

    def cli(self, *args):
        stdout, stderr = io.StringIO(), io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = main(list(args))
        return code, stdout.getvalue(), stderr.getvalue()

    def test_bundle_matches_example(self):
        source = Path(__file__).resolve().parents[1] / "examples/rs/datasets/RS.data.csv"
        self.assertEqual(source.read_bytes(), bundled_file("RS.data.csv").read_bytes())

    def test_rs_config_and_validation(self):
        records, digest = load_input(self.cfg)
        self.assertEqual(len(records), 3824)
        self.assertEqual(digest, hashlib.sha256(bundled_file("RS.data.csv").read_bytes()).hexdigest())
        self.assertEqual(self.cfg["output"]["directory"], str((self.root / "outputs").resolve()))
        self.assertEqual(self.cli("--config", str(self.path), "--validate")[0], 0)
        self.assertFalse((self.root / "outputs").exists())

    def test_missing_explicit_config_and_init_no_overwrite(self):
        missing = self.root / "missing.yaml"
        self.assertEqual(self.cli("--config", str(missing))[0], 1)
        self.assertFalse(missing.exists())
        self.assertEqual(self.cli("--config", str(missing), "--validate")[0], 1)
        self.assertFalse(missing.exists())
        self.assertEqual(self.cli("--config", str(missing), "--init-only")[0], 0)
        original = missing.read_bytes()
        self.assertEqual(self.cli("--config", str(missing), "--init-only")[0], 1)
        self.assertEqual(missing.read_bytes(), original)

    def test_strict_schema(self):
        original = self.path.read_text()
        variants = [original + '\nschema_version: 1\n', original.replace('size_back: 4', 'size_bak: 4'),
                    original.replace('size_back: 4', 'size_back: true'), original.replace('dimensions: 2', 'dimensions: 3'),
                    original.replace('schema_version: 1', 'schema_version: true'),
                    original.replace('path: bundled:rs', 'path: bundled:missing'),
                    original.replace('type: MovingStanzaWindow', 'type: Conversation'),
                    original.replace('groups: ["FirstGame", "SecondGame"]', 'groups: ["FirstGame", "FirstGame"]'),
                    original.replace('group_a: "#ff0000"', 'group_a: "bad-color"')]
        for text in variants:
            with self.subTest(text=text[-100:]):
                self.path.write_text(text)
                with self.assertRaises(ConfigError):
                    load_config(self.path)

    def small_config(self):
        cfg = deepcopy(self.cfg)
        cfg["analysis"].update(units=["id"], conversation=["id"], metadata=["group"], codes=["a", "b", "c"])
        cfg["analysis"]["rotation"] = {"method": "svd"}
        cfg["comparison"] = {"column": "group", "groups": ["H", "L"]}
        cfg["output"].pop("individual_comparison")
        return cfg

    def test_bad_csv_and_sorting(self):
        cfg = self.small_config()
        valid = b'id,group,a,b,c,order\nh1,H,1,0,1,10\nh2,H,0,1,1,2\nl1,L,1,1,0,1\nl2,L,1,0,1,3\n'
        for payload in [valid.replace(b'1,0,1,10', b',0,1,10'), valid.replace(b'1,0,1,10', b'2,0,1,10'),
                        valid.replace(b'a,b,c', b'a,a,c'), valid.replace(b'h2,H', b'h1,L'), b'id,group,a,b,c\n']:
            with self.subTest(payload=payload), self.assertRaises(ConfigError):
                read_records(payload, cfg)
        cfg["data"]["sort_by"] = [{"column": "order", "type": "integer"}]
        self.assertEqual([r["order"] for r in read_records(valid, cfg)], ["1", "2", "3", "10"])
        with self.assertRaises(ConfigError):
            read_records(valid.replace(b',10', b',oops'), cfg)

    def test_custom_data_does_not_use_rs_validation(self):
        cfg = self.small_config()
        cfg["analysis"]["window"] = {"type": "Conversation"}
        cfg["output"]["summary_only"] = True
        rows = ["id,group,a,b,c"]
        for group, patterns in [("H", [(1,1,0), (1,0,1), (0,1,1), (1,1,1)]),
                                ("L", [(1,1,0), (1,0,1), (0,1,1), (1,0,1)])]:
            rows += [f"{group}{i},{group},{a},{b},{c}" for i,(a,b,c) in enumerate(patterns)]
        custom = self.root / "custom.csv"
        custom.write_text("\n".join(rows))
        cfg["data"]["path"] = str(custom)
        self.path.write_text(yaml.safe_dump(cfg))
        self.assertEqual(self.cli("--config", str(self.path))[0], 0)
        result = next((self.root / "outputs").glob("run_*/statistical_summary.json"))
        self.assertEqual(json.loads(result.read_text())["groups"]["group_a_label"], "H")

    def test_rs_api_equivalence_and_new_run_directories(self):
        cfg = self.cfg
        cfg["output"]["summary_only"] = True
        records, digest = load_input(cfg)
        output = run_analysis(cfg, self.path, records, digest)
        a = cfg["analysis"]
        # Independent original handbook API invocation.
        model = ena(data=records, units=["Condition", "UserName"], conversation=["Condition", "GroupName"],
                    metadata=["Condition", "GroupName"], codes=a["codes"], model="EndPoint",
                    window="MovingStanzaWindow", window_size_back=4, rotation="mean",
                    group_column="Condition", groups=("FirstGame", "SecondGame"))
        pa, pb = [group_points(model, "Condition", g) for g in ("FirstGame", "SecondGame")]
        na, nb = [group_network(model, "Condition", g) for g in ("FirstGame", "SecondGame")]
        expected = summarize_ena_results(model, "FirstGame", "SecondGame", "Condition", pa, pb, na, nb, na-nb)
        actual = json.loads((output / "statistical_summary.json").read_text())
        def compare(left, right):
            if isinstance(left, dict):
                self.assertEqual(left.keys(), right.keys())
                for key in left:
                    compare(left[key], right[key])
            elif isinstance(left, list):
                self.assertEqual(len(left), len(right))
                for x,y in zip(left,right):
                    compare(x,y)
            elif isinstance(left, (float, int)):
                np.testing.assert_allclose(left, right, rtol=1e-10, atol=1e-12, equal_nan=True)
            else:
                self.assertEqual(left, right)
        compare(expected, actual)
        original = self.path.read_bytes()
        second = run_analysis(cfg, self.path, records, digest)
        self.assertNotEqual(output, second)
        self.assertEqual(original, self.path.read_bytes())
        self.assertFalse((output / "figures").exists())
        self.assertEqual(json.loads((output / "run_manifest.json").read_text())["status"], "completed")

    def test_default_first_run_and_reuse(self):
        working = self.root / "empty"
        working.mkdir()
        proc = subprocess.run([sys.executable, "-m", "pyena", "--summary-only"], cwd=working, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        path = working / "analysis.yaml"
        original = path.read_bytes()
        proc = subprocess.run([sys.executable, "-m", "pyena", "--summary-only"], cwd=working, capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(path.read_bytes(), original)
        self.assertEqual(len(list((working / "outputs").glob("run_*"))), 2)

    def test_plots_without_individual_selection(self):
        self.cfg["output"].pop("individual_comparison")
        records, digest = load_input(self.cfg)
        output = run_analysis(self.cfg, self.path, records, digest)
        self.assertEqual(len(list((output / "figures").glob("*.png"))), 9)
        self.assertFalse(list((output / "figures").glob("*individual*")))

    def test_degenerate_model_leaves_failed_manifest(self):
        cfg = self.small_config()
        cfg["output"]["summary_only"] = True
        payload = b'id,group,a,b,c\nh1,H,1,1,1\nh2,H,1,1,1\nl1,L,1,1,1\nl2,L,1,1,1\n'
        records = read_records(payload, cfg)
        with self.assertRaises(ConfigError):
            run_analysis(cfg, self.path, records, hashlib.sha256(payload).hexdigest())
        manifest = next((self.root / "outputs").glob("run_*/run_manifest.json"))
        self.assertEqual(json.loads(manifest.read_text())["status"], "failed")


if __name__ == "__main__":
    unittest.main()
