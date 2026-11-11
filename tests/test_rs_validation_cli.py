"""Verify that the tracked RS workflow can reproduce validation after relocation."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]

@unittest.skipUnless(shutil.which('Rscript'),'RS integration requires Rscript/rENA 0.3.0')
class RSValidationCLI(unittest.TestCase):
    def test_relocated_checkout_runs_both_dimensions_and_rejects_stale_reference(self):
        with tempfile.TemporaryDirectory(prefix='pyena rs checkout ') as temporary:
            checkout=Path(temporary)/'checkout with spaces'
            for folder in ['src/pyena','validation','datasets']:(checkout/folder).mkdir(parents=True,exist_ok=True)
            for file in (ROOT/'src/pyena').glob('*.py'):shutil.copy2(file,checkout/'src/pyena'/file.name)
            for name in ['compare_rs.py','rs_reference.R']:
                shutil.copy2(ROOT/'validation'/name,checkout/'validation'/name)
            shutil.copy2(ROOT/'datasets/RS.data.csv',checkout/'datasets/RS.data.csv')
            env=dict(os.environ,MPLBACKEND='Agg',PYTHONDONTWRITEBYTECODE='1')
            env.setdefault('MPLCONFIGDIR',str(checkout/'mpl-cache'))
            for dimensions,expected_checks in [(2,122),(3,156)]:
                command=[sys.executable,str(checkout/'validation/compare_rs.py'),'--dimensions',str(dimensions)]
                result=subprocess.run(command,cwd=Path(temporary),env=env,text=True,capture_output=True)
                self.assertEqual(result.returncode,0,result.stdout+result.stderr)
                output=checkout/'outputs/rs_validation'/f'{dimensions}d'
                report=json.loads((output/'comparison.json').read_text())
                self.assertTrue(report['passed']);self.assertEqual(len(report['checks']),expected_checks)
                self.assertEqual(report['rows'],3824);self.assertEqual(report['units'],48)
                self.assertEqual(report['group_sizes'],{'FirstGame':26,'SecondGame':22})
                self.assertTrue(Path(report['python_source']).resolve().is_relative_to((checkout/'src').resolve()))
                reference=output/'rena/rena_reference.json'
                stale=json.loads(reference.read_text());stale['input']['md5']='stale'
                reference.write_text(json.dumps(stale))
                result=subprocess.run(command+['--reuse-r'],cwd=Path(temporary),env=env,text=True,capture_output=True)
                self.assertNotEqual(result.returncode,0)
                self.assertIn('Reference data or dimensions differ',result.stderr)

if __name__=='__main__':unittest.main()
