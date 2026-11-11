"""Audit all installed rENA exports against an explicit Python capability map.

Development utility only. The library itself never imports or invokes R.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
import pyena

GROUPS=[
 ('Python equivalent','R S3/R6 data schemas are represented by Python role/array classes, not binary-compatible objects.',{
  'define':'define','reclassify':'reclassify','as.qe.data':'as_qe_data','as.qe.code':'as_qe_code',
  'as.qe.unit':'as_qe_unit','as.qe.horizon':'as_qe_horizon','as.qe.metadata':'as_qe_metadata',
  'is.qe.data':'is_qe_data','is.qe.code':'is_qe_code','is.qe.unit':'is_qe_unit','is.qe.horizon':'is_qe_horizon','is.qe.metadata':'is_qe_metadata',
  'units':'units','codes':'codes','horizon':'horizon','metadata':'metadata','find_binary_cols':'find_binary_cols',
  'find_code_cols':'find_code_cols','find_dimension_cols':'find_dimension_cols','find_meta_cols':'find_meta_cols',
  'as.ena.matrix':'as_ena_matrix','as.ena.metadata':'as_ena_metadata','as.ena.co.occurrence':'as_ena_co_occurrence','remove_meta_data':'remove_meta_data',
  'ENAdata':'ENAData','ENAset':'ENASet','ENARotationSet':'ENARotationSet','ENAplot':'ENAPlot'}),
 ('Native implementation','Index bases and separators follow the documented Python schema; not all helpers have separate R oracle cases.',{
  'combn_c2':'combn_c2','merge_columns_c':'merge_columns','namesToAdjacencyKey':'names_to_adjacency_key',
  'vector_to_ut':'vector_to_ut','connection.matrix':'connection_matrix','ena.conversations':'ena_conversations',
  'as_trajectory':'as_trajectory','means_rotate':'means_rotate'}),
 ('Validated cases','96 undirected accumulation configurations and 12 complete 3D model configurations are compared against R; this does not cover every optional parameter.',{
  'ena.accumulate.data':'accumulate_data','ena.make.set':'make_set','ena':'ena',
  'fun_sphere_norm':'sphere_normalize','sphere_norm':'sphere_normalize','fun_skip_sphere_norm':'fun_skip_sphere_norm',
  'ena.svd':'svd_rotation','ena.rotate.by.mean':'rotate_by_means'}),
 ('Native implementation','Hooks/serialization/reprojection are tested for functional behavior; all R option combinations are not established.',{
  'model':'model','center':'center','rotate':'rotate','project':'project','project_in':'project_in','optimize':'optimize'}),
 ('Experimental','Undirected accumulation follows the legacy window path. Ordered=True uses temporal transitions, not a full tma tensor implementation.',{'accumulate':'accumulate'}),
 ('Validated cases','Single numeric and categorical GMR directions and one generalized rotation case are checked; multiple predictors use experimental CV.',{'gmr':'gmr','ena.rotate.by.generalized':'generalized_rotation'}),
 ('Experimental','Native group elastic-net CV has a controlled fold/lambda interface, but does not reproduce glmnet defaults/path exactly.',{'get_x1_main_effect':'get_x1_main_effect'}),
 ('Validated cases','Numeric x/y with a control is checked; full R formula evaluation and arbitrary interactions are not claimed.',{'ena.rotation.h':'hena_rotation'}),
 ('Partial','OLS forward/reverse formulas use a restricted safe grammar; x-only forward regression has an R oracle. Other R regression_2 conventions are not fully established.',{
  'ena.rotate.by.hena.regression':'regression_rotation','ena.rotate.by.hena.regression_2':'regression_rotation'}),
 ('Validated cases','Both C² node-position formulas are checked on a well-conditioned matrix; degenerate systems may differ by solver.',{
  'directed_node_positions':'directed_node_positions','directed_node_positions_with_ground_response_added':'directed_node_positions_with_ground_response_added'}),
 ('Native implementation','Circular placement/updated centroids have native tests; exact rENA ordering/tie cases remain unverified.',{
  'move_nodes_to_unit_circle':'move_nodes_to_unit_circle','move_nodes_to_unit_circle_with_equal_space':'move_nodes_to_unit_circle_with_equal_space'}),
 ('Validated cases','Shared group means/medians, pairwise Pearson/Spearman, Fisher intervals and absolute Cohen d are checked on finite test samples.',{
  'ena.group':'ena_group','ena.correlations':'ena_correlations','ena_correlation':'ena_correlation','fun_cohens.d':'fun_cohens_d'}),
 ('Partial','Native Matplotlib layers and Plotly animation cover the listed views. Style/API option parity, network saturation/opacity layers and all R plot management behavior are not complete.',{
  'ena.plot':'ena_plot','ena.plot.points':'add_points','ena.plot.group':'add_group','ena.plot.network':'add_network',
  'ena.plot.trajectory':'add_trajectory','ena.plotter':'ena_plotter','add_group':'add_group','add_network':'add_network',
  'add_nodes':'add_nodes','add_points':'add_points','add_trajectory':'add_trajectory','with_means':'with_means','with_trajectory':'with_trajectory',
  'group':'ena_plotter','show':'show','clear':'clear','check_range':'check_range'}),
 ('Partial','Text/Markdown/HTML/JSON reports are supported. Rmarkdown/Pandoc/Word templates are not implemented.',{
  'ena.writeup':'ena_writeup','methods_report':'methods_report','methods_report_stream':'methods_report_stream'}),
]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'docs/rena-capabilities.json')
    args=parser.parse_args()
    result=subprocess.run(['Rscript','-e',
        'suppressPackageStartupMessages(library(rENA)); cat(jsonlite::toJSON(list(version=as.character(packageVersion("rENA")),exports=sort(getNamespaceExports("rENA"))),auto_unbox=TRUE))'],
        capture_output=True,text=True,check=True)
    reference=json.loads(result.stdout)
    if reference['version']!='0.3.0':raise SystemExit('This map is pinned to rENA 0.3.0.')
    mapping={}
    for status,limits,entries in GROUPS:
        for name,api in entries.items():
            if name in mapping:raise ValueError(f'Duplicate R export: {name}')
            if not hasattr(pyena,api):raise ValueError(f'Missing Python API: {api}')
            mapping[name]=dict(rENA_api=name,python_api=api,status=status,limits=limits)
    if set(mapping)!=set(reference['exports']):
        raise ValueError(dict(unmapped=sorted(set(reference['exports'])-mapping.keys()),extra=sorted(mapping.keys()-set(reference['exports']))))
    payload=dict(reference_version=reference['version'],export_count=len(mapping),runtime_requires_R=False,
                 capabilities=[mapping[n] for n in reference['exports']],
                 warning='A mapped API is not proof of complete behavioral/numerical parity. Inspect status and limits.')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(payload,indent=2,ensure_ascii=False),encoding='utf-8')
    md=['# rENA 0.3.0 capability map','',
        'All 85 exports are inventoried. A mapped API is not proof of complete parity; see rena-alignment.md and the JSON limitations.','',
        '| rENA export | Python API | Status |','|---|---|---|']
    for entry in payload['capabilities']:
        md.append(f"| `{entry['rENA_api']}` | `{entry['python_api']}` | {entry['status']} |")
    args.output.with_suffix('.md').write_text('\n'.join(md)+'\n',encoding='utf-8')
    print(json.dumps(dict(exports=len(mapping),status_counts=dict(Counter(x['status'] for x in mapping.values()))),indent=2))

if __name__=='__main__':main()
