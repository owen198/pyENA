"""Reproduce rENA summary checks and native, unaligned plots on the design-talk fixture.

Run using the comparison project's Python environment:
    python validation/compare_native.py --data /path/to/ena-design-talk-sample.csv
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'src'))
os.environ.setdefault('MPLCONFIGDIR', str(ROOT / 'outputs/rena_parity/.mplconfig'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pyena
from pyena.rena import _mean_point_and_ci

CODES = ['goal','evidence','strategy','tradeoff','revision']

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT/'outputs/rena_parity')
    parser.add_argument('--reuse-r', action='store_true')
    args = parser.parse_args()
    out = args.output.resolve()
    (out/'pyena').mkdir(parents=True, exist_ok=True)
    if not args.reuse_r:
        with (out/'r_run.log').open('w') as log:
            subprocess.run(['Rscript',str(Path(__file__).with_name('rena_reference.R')),
                            str(args.data.resolve()),str(out/'rena')],stdout=log,stderr=subprocess.STDOUT,check=True)
    r = json.loads((out/'rena/rena_reference.json').read_text())
    checks = []
    def check(name, x, y):
        if x is None or y is None:
            checks.append(dict(name=name,passed=x is None and y is None,max_absolute_difference=None))
            return
        x, y = np.asarray(x,float), np.asarray(y,float)
        same = x.shape == y.shape
        passed = same and bool(np.allclose(x,y,rtol=0,atol=1e-8,equal_nan=True))
        delta = float(np.nanmax(np.abs(x-y))) if same and x.size else None
        checks.append(dict(name=name,passed=passed,max_absolute_difference=delta,shape=list(x.shape)))
    signs_used = {}
    for rotation, rr in r['models'].items():
        model = pyena.ena(args.data, codes=CODES, units=['team_id'],conversation=['conversation_id'],
                          metadata=['condition','discussion_round'],window_size_back=4,
                          dimensions=2, rotation=rotation,group_column='condition',groups=('baseline','scaffolded'))
        # Reorder the R output by identifiers before comparing numbers.
        ui = [rr['unit_labels'].index(x) for x in model.unit_labels]
        ei = [rr['edge_labels'].index(x) for x in model.edge_labels]
        ni = [rr['code_labels'].index(x) for x in CODES]
        rot = np.asarray(rr['rotation_matrix'])[ei]
        signs = np.where(np.sum(rot * model.rotation_matrix,axis=0) < 0, -1., 1.)
        signs_used[rotation] = signs.tolist()
        prefix = rotation + '.'
        for field, value in [('raw_accumulated_vectors',model.enadata.accumulated_vectors),
                             ('line_weights',model.line_weights),('points_for_projection',model.points_for_projection)]:
            check(prefix+field,value,np.asarray(rr[field])[np.ix_(ui,ei)])
        check(prefix+'rotation_matrix',model.rotation_matrix,rot*signs)
        check(prefix+'unit_coordinates',model.points,np.asarray(rr['unit_coordinates'])[ui]*signs)
        check(prefix+'node_positions',model.node_positions,np.asarray(rr['node_positions'])[ni]*signs)
        a = pyena.group_points(model,'condition','baseline'); b = pyena.group_points(model,'condition','scaffolded')
        na = pyena.group_network(model,'condition','baseline'); nb = pyena.group_network(model,'condition','scaffolded')
        summary = pyena.summarize_ena_results(model,'baseline','scaffolded','condition',a,b,na,nb,na-nb)
        (out/'pyena'/f'{rotation}_statistical_summary.json').write_text(json.dumps(summary,indent=2,allow_nan=False))
        check(prefix+'variance',summary['model']['explained_variance_ratio'],rr['variance'])
        check(prefix+'eigenvalues',summary['model']['eigenvalues'],rr['eigenvalues'])
        med = pyena.summarize_group(model,'condition','baseline',method=np.median)
        check(prefix+'group_median.points',med['points'],np.array(rr['group_median']['points'])*signs)
        check(prefix+'group_median.line_weights',med['line_weights'],np.array(rr['group_median']['line_weights'])[ei])
        gof=summary['statistics']['goodness_of_fit']
        check(prefix+'correlations',[[v['pearson'],v['spearman']] for v in gof['co_registration_correlations'].values()],rr['correlations'])
        check(prefix+'correlation_ci',gof['pearson_confidence_interval_95'],rr['correlation_ci'])
        for group in ['group_a','group_b']:
            p, q = summary['points'][group],rr['points'][group]
            for key in ['n','sd','iqr']:
                check(prefix+group+'.'+key,p[key],q[key])
            for key in ['mean_point','median_point']:
                check(prefix+group+'.'+key,p[key],np.array(q[key])*signs)
            check(prefix+group+'.ci',list(p['confidence_interval_95'].values()),np.sort(np.array(q['confidence_interval_95'])*signs[:,None],axis=1))
        for dim, sign in enumerate(signs):
            key = f'dimension_{dim+1}'
            p=summary['statistics']['welch_t_test'][key]; q=rr['welch'][dim]
            for field, val in q.items():
                if field in ['t_statistic','mean_x','mean_y']:
                    val *= sign
                elif field == 'confidence_interval_95':
                    val = sorted(np.array(val)*sign)
                check(prefix+key+'.welch.'+field,p[field],val)
            p=summary['statistics']['mann_whitney_u'][key]; q=rr['mann_whitney'][dim]
            u = q['u_statistic'] if sign>0 else len(a)*len(b)-q['u_statistic']
            check(prefix+key+'.mw.u',p['u_statistic'],u)
            check(prefix+key+'.mw.p',p['p_value'],q['p_value'])
            checks.append(dict(name=prefix+key+'.mw.method',passed=p['method']==q['method'],max_absolute_difference=None))
        for name,values in [('baseline',na),('scaffolded',nb),('subtraction',na-nb)]:
            check(prefix+'network.'+name,values,np.array(rr['networks'][name])[ei])
        if rotation=='mean':
            groups=[(a,'#2166ac','baseline'),(b,'#d6604d','scaffolded')]
            fig,_=pyena.create_points_ci_overlay_plot(groups,'pyENA — native points and group means')
            fig.savefig(out/'pyena/points.png',dpi=160,bbox_inches='tight');plt.close(fig)
            for name,weights in [('baseline',na),('scaffolded',nb),('subtraction',na-nb)]:
                fig,_=pyena.create_network_plot(model,weights,title=f'pyENA — native {name}')
                fig.savefig(out/'pyena'/f'{name}.png',dpi=160,bbox_inches='tight');plt.close(fig)
    report=dict(reference=r['reference'],python_source=pyena.__file__,absolute_tolerance=1e-8,
                numerical_alignment_signs=signs_used,plots_sign_aligned=False,checks=checks,
                passed=all(c['passed'] for c in checks))
    (out/'comparison.json').write_text(json.dumps(report,indent=2))
    rows=''.join(f'<section><h2>{name}</h2><div><img src="pyena/{name}.png" alt="pyENA native {name}"><iframe src="rena/{name}.html" title="rENA native {name}"></iframe></div></section>'
                 for name in ['points','baseline','scaffolded','subtraction'])
    (out/'index.html').write_text('''<!doctype html><meta charset="utf-8"><title>Native pyENA / rENA comparison</title>
<style>body{font:17px system-ui;max-width:1500px;margin:30px auto;padding:0 24px;color:#182535}h1{margin-bottom:8px}section{border-top:1px solid #ddd;margin-top:32px}section div{display:grid;grid-template-columns:1fr 1fr;align-items:center}img,iframe{width:100%;height:600px;object-fit:contain;border:0}p{max-width:1000px;line-height:1.6}</style>
<h1>Native plotting comparison</h1><p>Left: pyENA / Matplotlib. Right: rENA / Plotly. Original axis directions and native drawing functions are preserved. No sign alignment is applied to these plots. Numerical comparisons separately allow axis reflections. Styling, edge scales and axis limits can differ.</p>'''+rows)
    failed=[c for c in checks if not c['passed']]
    print(json.dumps({'checks':len(checks),'failed':failed,'output':str(out)},indent=2))
    return int(bool(failed))

if __name__=='__main__':
    raise SystemExit(main())
