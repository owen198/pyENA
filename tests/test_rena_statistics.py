"""Executable R-oracle regression tests; requires R 4.5.2 and rENA 0.3.0.

Run: python -m unittest discover -s tests -v
"""
import json
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from pyena import mann_whitney, welch_ttest, ena_correlations, ena_correlation
from pyena.rena import _mean_point_and_ci

@unittest.skipUnless(shutil.which("Rscript"), "R reference tests require Rscript/rENA 0.3.0")
class RParity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cases = {
            'separated': ([1.,2.,3.,4.],[6.,7.,8.,9.]),
            'mirrored': ([-1.,-2.,-3.,-4.],[-6.,-7.,-8.,-9.]),
            'tied': ([1.,1.,2.,3.],[2.,3.,3.,4.]),
            'unequal': ([1.,2.],[2.,5.,8.,10.,12.]),
            'size49': (list(np.arange(49)*2.),list(np.arange(49)*2.+.5)),
            'size50': (list(np.arange(50)*2.),list(np.arange(50)*2.+.5)),
            'large_unequal': (list(np.arange(51)*2.),[.5,4.5,10.5]),
            'balanced_u': ([0.,3.,4.],[1.,2.,5.]),
            'one_constant': ([1.,1.,1.],[1.,2.,3.]),
        }
        with tempfile.TemporaryDirectory() as tmp:
            tmp=Path(tmp);inp=tmp/'in.json';out=tmp/'out.json';r=tmp/'oracle.R'
            inp.write_text(json.dumps(cls.cases))
            r.write_text('''suppressPackageStartupMessages(library(rENA))
stopifnot(as.character(packageVersion('rENA'))=='0.3.0')
args<-commandArgs(TRUE); cs<-jsonlite::fromJSON(args[1],simplifyVector=FALSE)
res<-lapply(cs,function(z){x<-unlist(z[[1]]);y<-unlist(z[[2]])
t<-t.test(x,y);w<-suppressWarnings(wilcox.test(x,y))
list(t=unname(t$statistic),p=t$p.value,df=unname(t$parameter),ci=unname(t$conf.int),
 d=fun_cohens.d(x,y),u=unname(w$statistic),up=w$p.value,
 method=if(grepl('exact',w$method))'exact' else 'asymptotic')})
p<-matrix(c(1,3,2,4,4,1,3,2),ncol=2)
c<-matrix(c(1,2,4,3,2,1,3,4),ncol=2)
res$correlation_ci<-ena_correlation(p,c)
res$correlations<-matrix(as.numeric(unlist(ena.correlations(list(points=p,model=list(centroids=c))))),nrow=2)
jsonlite::write_json(res,args[2],digits=NA,auto_unbox=TRUE)
''')
            subprocess.run(['Rscript',str(r),str(inp),str(out)],check=True,capture_output=True,text=True)
            cls.reference=json.loads(out.read_text())

    def test_welch_and_absolute_effect(self):
        for name,(x,y) in self.cases.items():
            with self.subTest(case=name):
                r=self.reference[name]; p=welch_ttest(x,y)
                for field,key in [('t_statistic','t'),('p_value','p'),('degrees_of_freedom','df'),('confidence_interval_95','ci'),('cohens_d','d')]:
                    np.testing.assert_allclose(p[field],r[key],rtol=1e-12,atol=1e-12)
                self.assertGreaterEqual(p['cohens_d'],0)

    def test_wilcoxon_method_ties_and_w_definition(self):
        for name,(x,y) in self.cases.items():
            with self.subTest(case=name):
                r=self.reference[name];p=mann_whitney(x,y)
                np.testing.assert_allclose(p['p_value'],r['up'],rtol=1e-12,atol=1e-12)
                self.assertEqual(p['w_statistic_r_style'],r['u'])
                self.assertEqual(p['method'],r['method'])
        self.assertEqual(mann_whitney(*self.cases['size49'])['method'],'exact')
        self.assertEqual(mann_whitney(*self.cases['size50'])['method'],'asymptotic')

    def test_pairwise_correlations_and_fisher_interval(self):
        p=np.array([[1,4],[3,1],[2,3],[4,2]],float)
        c=np.array([[1,2],[2,1],[4,3],[3,4]],float)
        np.testing.assert_allclose(ena_correlation(p,c),self.reference['correlation_ci'],rtol=0,atol=1e-12)
        cors=ena_correlations(p,c)
        np.testing.assert_allclose([[v['pearson'],v['spearman']] for v in cors.values()],self.reference['correlations'],atol=1e-12)
        # The previous unit-column correlation is not equivalent to the rENA definition.
        self.assertNotAlmostEqual(cors['dimension_1']['pearson'],np.corrcoef(p[:,0],c[:,0])[0,1])

    def test_undefined_inputs_are_not_claimed_as_valid_tests(self):
        with self.assertRaises(ValueError):welch_ttest([1],[2,3])
        with self.assertRaises(ValueError):welch_ttest([1,1],[1,1])
        with self.assertRaises(ValueError):mann_whitney([], [1,2])
        with self.assertRaises(ValueError):mann_whitney([float('nan')], [1,2])
        self.assertTrue(np.isnan(mann_whitney([1,1],[1,1])['p_value']))
        singleton=_mean_point_and_ci(np.array([[2.,3.]]))
        self.assertTrue(np.isnan(singleton['confidence_interval_95']['dimension_1'][0]))

if __name__=='__main__':unittest.main()
