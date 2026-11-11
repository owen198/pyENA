"""Regressions for preserving fitted settings and ignoring unused predictors."""
from pathlib import Path
import sys
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import pyena as pe
from pyena.rotations import design_matrix
from test_native_extensions import fixture


def fit(**options):
    return pe.ena(fixture(),['A','B','C','D'],['u'],['conv'],
                  ['condition','score','control'],window_size_back=2,
                  dimensions=3,**options)

class RefitSettings(unittest.TestCase):
    def test_rotate_keeps_normalization_and_centering(self):
        original=fit(norm_by='max',center_align_to_origin=False)
        result=pe.rotate(original,'svd')
        self.assertEqual(result.rotation_set.normalization,'max')
        self.assertFalse(result.rotation_set.center_align_to_origin)
        np.testing.assert_allclose(result.line_weights,original.line_weights,atol=1e-12)
        np.testing.assert_allclose(result.points_for_projection,original.points_for_projection,atol=1e-12)

    def test_rotate_allows_explicit_preprocessing_override(self):
        original=fit(norm_by='max',center_align_to_origin=False)
        result=pe.rotate(original,'svd',norm_by='sphere',center_align_to_origin=True)
        expected=fit(norm_by='sphere',center_align_to_origin=True)
        np.testing.assert_allclose(result.line_weights,expected.line_weights,atol=1e-12)
        self.assertTrue(result.rotation_set.center_align_to_origin)

    def test_rotate_keeps_custom_hooks_and_group_configuration(self):
        def shifted_center(weights):
            vector=weights.mean(axis=0)+.01
            return weights-vector,vector
        def doubled_projection(points,rotation):return 2*(points@rotation)
        original=fit(rotation='mean',group_column='condition',groups=('a','b'),
                     norm_by='max',center_with=shifted_center,
                     project_with=doubled_projection,node_position_method='lstsq')
        result=pe.rotate(original,'mean')
        np.testing.assert_allclose(result.points,original.points,atol=1e-12)
        np.testing.assert_allclose(result.points_for_projection,original.points_for_projection,atol=1e-12)
        self.assertEqual(result.fit_metadata['groups'],('a','b'))
        np.testing.assert_allclose(pe.means_rotate(original,'condition',('a','b')).points,original.points,atol=1e-12)

    def test_explicit_groups_replace_old_mean_contrasts(self):
        first=np.arange(16)<8;second=np.arange(16)%2==0
        original=fit(rotation='mean',rotation_params={'contrasts':[(first,~first),(second,~second)]})
        result=pe.rotate(original,'mean',group_column='condition',groups=('a','b'))
        expected=fit(rotation='mean',group_column='condition',groups=('a','b'))
        np.testing.assert_allclose(result.points,expected.points,atol=1e-12)

    def test_rotate_keeps_endpoint_selection(self):
        original=fit(model='AccumulatedTrajectory',endpoints_only=True)
        result=pe.rotate(original,'svd')
        self.assertTrue(result.fit_metadata['endpoints_only'])
        np.testing.assert_allclose(result.points,original.points,atol=1e-12)

class ReferencedPredictors(unittest.TestCase):
    def test_unused_constant_and_nonfinite_columns_do_not_change_regression(self):
        x=np.arange(12,dtype=float)
        values=np.column_stack([np.sin(x),np.cos(x),x*.1])
        expected=pe.regression_rotation(values,'V ~ x',metadata={'x':x})
        actual=pe.regression_rotation(values,'V ~ x',metadata={
            'unused_round':np.repeat('round-1',len(x)),
            'unused_invalid':np.full(len(x),np.nan),'x':x})
        np.testing.assert_allclose(actual,expected,atol=1e-12)

    def test_referenced_interactions_are_encoded_and_missing_terms_raise(self):
        x=np.arange(8,dtype=float);category=np.tile(['a','b'],4)
        matrix,names=design_matrix({'unused':np.repeat('one',8),'x':x,'g':category},
                                  terms=['x','g','x:g'])
        expected=np.column_stack([np.ones(8),x,(category=='b').astype(float),x*(category=='b')])
        np.testing.assert_allclose(matrix,expected)
        self.assertEqual(names,['(Intercept)','x','gb','x:gb'])
        with self.assertRaises(ValueError):design_matrix({'x':x},terms=['missing'])
        with self.assertRaises(ValueError):design_matrix({'x':np.full(8,np.nan)},terms=['x'])

if __name__=='__main__':unittest.main()
