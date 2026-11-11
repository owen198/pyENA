"""Run both standard RS.data workflows from this checkout; export native figures, matrices and summaries."""
from pathlib import Path
import argparse,csv,hashlib,json,sys
from collections import Counter
import numpy as np
import matplotlib
matplotlib.use("Agg")
REPO=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(REPO/'src'))
import pyena as pe

CODES=['Data','Technical.Constraints','Performance.Parameters','Client.and.Consultant.Requests','Design.Reasoning','Collaboration']
def write_matrix(path,labels,values,columns):
    with path.open('w',newline='',encoding='utf-8') as f:
        writer=csv.writer(f);writer.writerow(['label',*columns]);writer.writerows([[label,*map(float,row)] for label,row in zip(labels,np.asarray(values))])

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=REPO/'outputs/rs_validation')
    parser.add_argument('--data',type=Path,default=REPO/'datasets/RS.data.csv')
    args=parser.parse_args()
    root=args.output.resolve();root.mkdir(parents=True,exist_ok=True)
    source=args.data.resolve();pe.validate_rs_data(source)
    records=pe.read_csv_records(source)
    unit_keys={(row['Condition'],row['UserName']) for row in records}
    group_sizes=dict(Counter(condition for condition,user in unit_keys))
    generated={}
    for dims in [2,3]:
        out=root/f'pyena_{dims}d';out.mkdir(exist_ok=True)
        m=pe.ena(source,CODES,['Condition','UserName'],['Condition','GroupName'],['Condition','GroupName'],
            window_size_back=4,window_size_forward=0,rotation='mean',dimensions=dims,
            group_column='Condition',groups=('FirstGame','SecondGame'))
        if dims==2:
            result=pe.generate_analysis_outputs(m,out,group_a_label='FirstGame',group_b_label='SecondGame',group_column='Condition',
                group_a_color='#ff0000',group_b_color='#0000ff',
                focus_unit_a='FirstGame::steven z',focus_unit_b='SecondGame::samuel o')
        else:
            result=pe.generate_analysis_outputs_3d(m,group_column='Condition',groups=('FirstGame','SecondGame'),output_dir=out,
                focus_unit_a='FirstGame::steven z',focus_unit_b='SecondGame::samuel o')
        axes=[f'dimension_{i+1}' for i in range(dims)]
        for name,labels,mat,cols in [
            ('raw_accumulated_vectors',m.unit_labels,m.enadata.accumulated_vectors,m.edge_labels),
            ('line_weights',m.unit_labels,m.line_weights,m.edge_labels),
            ('points_for_projection',m.unit_labels,m.points_for_projection,m.edge_labels),
            ('rotation_matrix',m.edge_labels,m.rotation_matrix,axes),
            ('unit_coordinates',m.unit_labels,m.points,axes),
            ('node_positions',CODES,m.node_positions,axes)]:
            write_matrix(out/f'{name}.csv',labels,mat,cols)
        a=pe.group_network(m,'Condition','FirstGame');b=pe.group_network(m,'Condition','SecondGame')
        write_matrix(out/'group_mean_networks.csv',m.edge_labels,np.column_stack([a,b,a-b]),['FirstGame','SecondGame','FirstGame_minus_SecondGame'])
        config=dict(dataset=str(source),dataset_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                    rows=len(records),analysis_units=len(unit_keys),group_sizes=group_sizes,codes=CODES,
                    units=['Condition','UserName'],conversation=['Condition','GroupName'],model='EndPoint',
                    window='MovingStanzaWindow',window_size_back=4,window_size_forward=0,
                    normalization='sphere',rotation='mean',dimensions=dims,python_source=pe.__file__)
        (out/'configuration.json').write_text(json.dumps(config,indent=2),encoding='utf-8')
        summary=json.loads((out/'statistical_summary.json').read_text(),parse_constant=lambda x: (_ for _ in ()).throw(ValueError(x)))
        assert summary['model']['units']==len(unit_keys) and summary['model']['rotation_dimensions']==dims
        images=list(out.glob('*.png')) if dims==2 else list(out.glob('*.html'))
        assert len(images)==12,(dims,len(images))
        generated[str(dims)]=dict(figures=len(images),csv_matrices=7,summary='statistical_summary.json',configuration='configuration.json')
        print(f'RS.data {dims}D completed: {len(images)} figures, 7 matrices and summary.',flush=True)
    (root/'full_workflow.json').write_text(json.dumps(dict(dataset=str(source),workflows=generated,python_source=pe.__file__),indent=2))

if __name__=='__main__':main()
