"""Pure Python feature tests plus executable rENA 0.3.0 oracle comparisons."""
import json
import os
os.environ.setdefault('MPLBACKEND','Agg')
import subprocess
import shutil
import tempfile
from pathlib import Path
import sys
import unittest
import warnings
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import pyena as pe

ROOT=Path(__file__).resolve().parents[1]

def fixture():
    rows=[]
    for i in range(16):
        for step in range(4):
            rows.append(dict(u=f'u{i}',conv=f'c{i}_{step//2}',condition='a' if i<8 else 'b',
                score=float(i),control=float((i*7)%11),
                A=int((i+step)%3!=0),B=int((2*i+step)%4!=0),
                C=int((i+2*step)%5<3),D=int((3*i+step)%7<4)))
    return rows

def fit(**options):
    return pe.ena(fixture(),['A','B','C','D'],['u'],['conv'],['condition','score','control'],
                  window_size_back=2,dimensions=3,**options)

class NativeFeatureTests(unittest.TestCase):
    def test_configured_pipeline_and_reference_transform(self):
        original=fit(norm_by='max',center_align_to_origin=False)
        projected=pe.project_in(original.enadata,original,centering='reference')
        np.testing.assert_allclose(projected.points,original.points,atol=1e-12)
        np.testing.assert_allclose(projected.node_positions,original.node_positions)
        with tempfile.TemporaryDirectory() as tmp:
            saved=original.rotation_set.save(Path(tmp)/'rotation.json')
            restored=pe.ENARotationSet.load(saved)
            np.testing.assert_allclose(pe.project_in(original.enadata,restored,centering='reference').points,original.points)
        hooked_projection=pe.model(original.enadata,normalize='sphere',project_with=lambda x,r:2*(x@r),dimensions=3)
        np.testing.assert_allclose(hooked_projection.points,2*fit().points)
        self.assertTrue(np.isfinite(pe.optimize(original).node_positions).all())
        masked=pe.accumulate_data(fixture(),['A','B','C','D'],['u'],['conv'],mask=np.array([1,0,1,1,1,1]))
        self.assertTrue(np.all(masked.accumulated_vectors[:,1]==0))
        hooked=fit(rotation=lambda p,dimensions:pe.svd_rotation(p,dimensions))
        self.assertEqual(hooked.points.shape,(16,3))
        def custom_nodes(weights,points,n):
            from pyena.rena import _build_node_weights
            w=_build_node_weights(weights,n);nodes=np.linalg.lstsq(w,points,rcond=None)[0]
            return nodes,w@nodes
        native=fit(node_position_method=custom_nodes)
        np.testing.assert_allclose(native.points,hooked.points)

    def test_roles_adjacency_and_conversation_retrieval(self):
        data=pe.define(fixture(),units_cols=['u'],codes_cols=['A','B','C','D'],horizon_cols=['conv'],metadata_cols=['condition'])
        self.assertEqual(pe.codes(data),['A','B','C','D'])
        acc=pe.accumulate(data,window_size_back=2)
        self.assertEqual(len(acc.unit_labels),16)
        np.testing.assert_array_equal(pe.vector_to_ut([1,2,3]),[2,3,6])
        self.assertTrue(pe.is_qe_code(pe.as_qe_code([0,1])))
        self.assertTrue(pe.is_qe_data(data))
        self.assertEqual(pe.as_ena_matrix([[1,2]],column_labels=['a','b']).shape,(1,2))
        self.assertEqual(set(pe.ena_group(fit(),by='condition')),{'a','b'})
        self.assertGreaterEqual(pe.fun_cohens_d([1,2,3],[4,5,6]),0)
        np.testing.assert_array_equal(pe.connection_matrix([2,3,6],['a','b','c']),[[0,2,3],[2,0,6],[3,6,0]])
        selected=pe.ena_conversations(acc,['u0'],codes=['A'],window=2)
        self.assertEqual(selected['index_base'],0)
        self.assertTrue(selected['unitRows'])

    def test_trajectory_layers_animation_and_reports(self):
        import matplotlib.pyplot as plt
        original=fit(rotation='mean',group_column='condition',groups=('a','b'))
        traj=pe.as_trajectory(original,model='AccumulatedTrajectory')
        self.assertEqual(len(traj.points),32)
        plot=pe.ena_plot(traj)
        pe.add_trajectory(plot,name='paths',labels=True)
        self.assertTrue(plot.layers['paths'])
        pe.clear(plot,'paths');self.assertFalse(plot.layers)
        anim=pe.with_trajectory(traj);self.assertEqual(len(anim.frames),2)
        plot.close()
        plot=pe.ena_plot(original)
        pe.add_points(plot,original.points,name='units',show_mean=True)
        pe.add_network(plot,pe.mean_network(original),name='network',threshold=[0,.5])
        self.assertIn('network',plot.layers)
        with tempfile.TemporaryDirectory() as tmp:
            path=pe.ena_writeup(original,Path(tmp)/'methods.html')
            self.assertIn('means-rotation',path.read_text())
            self.assertTrue(plot.save(Path(tmp)/'plot.png').exists())
        plot.close()
        circular=pe.move_nodes_to_unit_circle(original)
        radii=np.linalg.norm(circular.node_positions[:,:2],axis=1)
        np.testing.assert_allclose(radii,radii[0])
        equal=pe.move_nodes_to_unit_circle_with_equal_space(original)
        self.assertTrue(np.isfinite(equal.centroids).all())
        self.assertEqual(pe.json_safe({'x':float('nan')}),{'x':None})

    def test_native_elastic_cv_is_explicit_and_deterministic(self):
        x=np.linspace(-1,1,12);z=np.sin(np.arange(12));v=np.column_stack([x+z,x-z])
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter('always')
            a=pe.get_x1_main_effect(v,{'x':x,'z':z},lambdas=[.1,.01],fold_ids=np.arange(12)%3)
            b=pe.get_x1_main_effect(v,{'x':x,'z':z},lambdas=[.1,.01],fold_ids=np.arange(12)%3)
        self.assertTrue(any('experimental' in str(w.message) for w in caught))
        np.testing.assert_allclose(a,b)
        self.assertEqual(a.shape,v.shape)

    def test_directed_model_and_error_contracts(self):
        acc=pe.accumulate_data(fixture(),['A','B','C','D'],['u'],['conv'],window_size_back=2,ordered=True)
        self.assertEqual(acc.accumulated_vectors.shape,(16,16))
        model=pe.make_set(acc,dimensions=2,node_position_method='lstsq')
        self.assertTrue(np.isfinite(model.centroids).all())
        p=pe.ena_plot(model);pe.add_network(p,pe.mean_network(model));p.close()
        model3=pe.make_set(acc,dimensions=3,node_position_method='lstsq')
        self.assertTrue(pe.plot_network_3d(model3,pe.mean_network(model3)).data)
        with self.assertRaises(ValueError):pe.accumulate_data(fixture(),['A','B'],['u'],['conv'],window='typo')
        with self.assertRaises(ValueError):pe.accumulate_data(fixture(),['A','B'],['u'],['conv'],window_size_back=-1)
        with self.assertRaises(ValueError):pe.regression_rotation(np.eye(4),'V ~ system(x)',metadata={'x':np.arange(4)})

@unittest.skipUnless(shutil.which("Rscript"), "R reference tests require Rscript/rENA 0.3.0")
class RNativeOracleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows=[dict(u='u'+str(i%3),conv='c'+str(i%2),A=(i%3)+1,B=int(i%2==0),C=int(i%4<2)) for i in range(12)]
        cls.V=np.column_stack([np.sin(np.arange(16)*k)+np.arange(16)*.01*k for k in range(1,7)])
        cls.X=np.linspace(-1,1,16);cls.Y=np.cos(np.arange(16));cls.C=np.arange(16)%3
        cls.weights=np.random.default_rng(731).uniform(.01,1.,size=(16,9))
        cls.points=cls.V[:,:3]
        inp=dict(rows=cls.rows,V=cls.V.tolist(),x=cls.X.tolist(),y=cls.Y.tolist(),control=cls.C.tolist(),
                 weights=cls.weights.tolist(),points=cls.points.tolist(),fit_rows=fixture())
        script=r'''
suppressPackageStartupMessages(library(rENA))
stopifnot(as.character(packageVersion('rENA'))=='0.3.0')
a<-commandArgs(TRUE);z<-jsonlite::fromJSON(a[1]);res<-list();d<-z$rows
for(window in c('MovingStanzaWindow','Conversation')) for(back in c(0,1,2,4,Inf)) for(forward in c(0,1,3)) {
 if(window=='Conversation' && (back!=1 || forward!=0))next
 for(model in c('EndPoint','AccumulatedTrajectory','SeparateTrajectory')) for(weight in c('binary','count')) {
  n<-paste(window,back,forward,model,weight,sep='|')
  acc<-suppressWarnings(ena.accumulate.data(units=d['u'],conversation=d['conv'],codes=d[c('A','B','C')],
       window=window,window.size.back=back,window.size.forward=forward,model=model,weight.by=weight,as.list=FALSE))
  res[[n]]<-list(labels=acc$unit.names,values=unname(as.matrix(acc$adjacency.vectors)))
 }
}
mask<-matrix(1,3,3);mask[1,2]<-.5;mask[1,3]<-0
wm<-suppressWarnings(ena.accumulate.data(units=d['u'],conversation=d['conv'],codes=d[c('A','B','C')],
 window.size.back=4,weight.by=function(x)sqrt(x),mask=mask,as.list=FALSE))
res$weighted_mask<-list(labels=wm$unit.names,values=unname(as.matrix(wm$adjacency.vectors)))
res$skip<-unname(fun_skip_sphere_norm(z$V))
res$directed<-directed_node_positions(z$weights,z$points,3)
res$paired<-directed_node_positions_with_ground_response_added(z$weights,z$points,3)
res$gmr_numeric<-unname(gmr(z$V,data.frame(x=z$x)))
mask1<-seq_len(16)<=8;mask2<-seq_len(16)%%2==0
fake<-list(points.normed.centered=z$V,line.weights=z$V,rotation=list(codes=c('A','B','C','D')))
res$multiple_means<-unname(ena.rotate.by.mean(fake,list(list(mask1,!mask1),list(mask2,!mask2)))$rotation[,1:3])
res$gmr_category<-unname(gmr(z$V,data.frame(x=rep(c('a','b'),each=8))))
V<-z$V;x<-z$x;y<-z$y
p<-rENA:::as_points_matrix(z$V,metadata=data.table::data.table(x=as.ena.metadata(z$x),y=as.ena.metadata(z$y),control=as.ena.metadata(z$control)))
set<-list(model=list(points.for.projection=p),rotation=list(codes=c('A','B','C','D')),
          line.weights=z$V)
res$generalized<-unname(ena.rotate.by.generalized(set,list(x_var=data.frame(x=z$x)))$rotation[,1:3])
res$hena<-unname(ena.rotation.h(set,list(x_var='x',y_var='y',control_vars='control'))$rotation[,1:3])
res$regression<-unname(ena.rotate.by.hena.regression(set,list(x_var=V~x))$rotation[,1:3])

f<-z$fit_rows
for(mod in c('EndPoint','AccumulatedTrajectory','SeparateTrajectory')) for(norm in c('sphere','max')) for(rot in c('svd','mean')) {
 acc<-suppressWarnings(ena.accumulate.data(units=f['u'],conversation=f['conv'],codes=f[c('A','B','C','D')],
  metadata=f[c('condition','score','control')],model=mod,window.size.back=2,as.list=FALSE))
 pm<-list(enadata=acc,dimensions=3,norm.by=if(norm=='sphere')fun_sphere_norm else fun_skip_sphere_norm,as.list=FALSE)
 if(rot=='mean'){ids<-as.integer(sub('u','',as.character(acc$units$u)));pm$rotation.by<-ena.rotate.by.mean;pm$rotation.params<-list(ids<8,ids>=8)}
 fit<-suppressWarnings(do.call(ena.make.set,pm))
 res[[paste('fit',mod,norm,rot,sep='|')]]<-list(labels=acc$unit.names,points=unname(as.matrix(fit$points.rotated)[,1:3]),
  rotation=unname(as.matrix(fit$rotation.set$rotation)[,1:3]),nodes=unname(as.matrix(fit$node.positions)[,1:3]),
  variance=as.numeric(fit$variance[1:3]))
}
jsonlite::write_json(res,a[2],digits=NA,auto_unbox=TRUE,na='null',null='null')
'''
        with tempfile.TemporaryDirectory() as tmp:
            tmp=Path(tmp);(tmp/'in.json').write_text(json.dumps(inp));(tmp/'oracle.R').write_text(script)
            result=subprocess.run(['Rscript',str(tmp/'oracle.R'),str(tmp/'in.json'),str(tmp/'out.json')],text=True,capture_output=True)
            if result.returncode:raise RuntimeError(result.stderr)
            cls.reference=json.loads((tmp/'out.json').read_text())

    def test_accumulation_models_weights_and_window_boundaries(self):
        for name,r in self.reference.items():
            if '|' not in name or name.startswith('fit|'):continue
            window,back,forward,model,weight=name.split('|')
            with self.subTest(case=name):
                a=pe.accumulate_data(self.rows,['A','B','C'],['u'],['conv'],model=model,window=window,
                    window_size_back=float(back),window_size_forward=int(forward),weight_by=weight)
                ref=np.array(r['values']);labels=r['labels']
                if window=='Conversation' and model!='EndPoint':
                    labels=['::'.join(label.split('::')[:2]) for label in labels]
                order=[labels.index(label) for label in a.unit_labels]
                np.testing.assert_allclose(a.accumulated_vectors,ref[order],atol=1e-12)

    def test_full_models_in_three_dimensions(self):
        for name,r in self.reference.items():
            if not name.startswith('fit|'):continue
            _,mod,norm,rot=name.split('|')
            with self.subTest(model=name):
                model=pe.ena(fixture(),['A','B','C','D'],['u'],['conv'],['condition','score','control'],
                    model=mod,window_size_back=2,dimensions=3,rotation=rot,norm_by=norm,
                    group_column='condition',groups=('a','b'))
                order=[r['labels'].index(label) for label in model.unit_labels]
                axes=np.array(r['rotation']);sign=np.where(np.sum(axes*model.rotation_matrix,axis=0)<0,-1,1)
                np.testing.assert_allclose(model.rotation_matrix,axes*sign,atol=1e-8)
                np.testing.assert_allclose(model.points,np.array(r['points'])[order]*sign,atol=1e-8)
                np.testing.assert_allclose(model.node_positions,np.array(r['nodes'])*sign,atol=1e-8)
                ratio=model.points.var(axis=0,ddof=1)/model.points_for_projection.var(axis=0,ddof=1).sum()
                np.testing.assert_allclose(ratio,r['variance'],atol=1e-8)

    def test_normalization_and_directed_position_formulas(self):
        mask=np.ones((3,3));mask[0,1]=.5;mask[0,2]=0
        weighted=pe.accumulate_data(self.rows,['A','B','C'],['u'],['conv'],window_size_back=4,weight_by=np.sqrt,mask=mask)
        r=self.reference['weighted_mask'];order=[r['labels'].index(label) for label in weighted.unit_labels]
        np.testing.assert_allclose(weighted.accumulated_vectors,np.array(r['values'])[order],atol=1e-12)
        np.testing.assert_allclose(pe.fun_skip_sphere_norm(self.V),self.reference['skip'],atol=1e-12)
        for name,fn in [('directed',pe.directed_node_positions),('paired',pe.directed_node_positions_with_ground_response_added)]:
            nodes,centroids=fn(self.weights,self.points)
            np.testing.assert_allclose(nodes,self.reference[name]['nodes'],atol=1e-10)
            np.testing.assert_allclose(centroids,self.reference[name]['centroids'],atol=1e-10)

    def test_numeric_and_categorical_gmr(self):
        for name,x in [('numeric',self.X),('category',np.repeat(['a','b'],8))]:
            direction=pe.gmr(self.V,{'x':x}).direction;r=np.array(self.reference['gmr_'+name])
            if direction@r<0:r=-r
            np.testing.assert_allclose(direction,r,atol=1e-10)

    def test_generalized_hena_and_regression_axes(self):
        m1=np.arange(16)<8;m2=np.arange(16)%2==1
        axes=pe.rotate_by_means(self.V,[(m1,~m1),(m2,~m2)],3)
        r=np.array(self.reference['multiple_means']);signs=np.where(np.sum(axes*r,axis=0)<0,-1,1)
        np.testing.assert_allclose(axes,r*signs,atol=1e-8)
        md=dict(x=self.X,y=self.Y,control=self.C)
        cases={'generalized':pe.generalized_rotation(self.V,{'x':self.X},3),
               'hena':pe.hena_rotation(self.V,'x',3,y_var='y',control_vars=['control'],metadata=md)[0],
               'regression':pe.regression_rotation(self.V,'V ~ x',3,metadata=md)}
        for name,axes in cases.items():
            with self.subTest(method=name):
                r=np.array(self.reference[name]);signs=np.where(np.sum(axes*r,axis=0)<0,-1,1)
                np.testing.assert_allclose(axes,r*signs,atol=1e-8)

if __name__=='__main__':unittest.main()
