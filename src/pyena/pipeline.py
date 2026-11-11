"""Configurable NumPy modeling pipeline and reusable rotation models."""
from __future__ import annotations
from dataclasses import dataclass, field, replace
from typing import Callable
import copy
import json
from pathlib import Path
import numpy as np
from .rena import (ENAData, ENASet, _build_node_weights, _least_squares_node_positions,
                   sphere_normalize, svd_rotation, rotate_by_mean)

@dataclass
class ENARotationSet:
    rotation_matrix: np.ndarray
    codes: list[str]
    edge_labels: list[str]
    center_vector: np.ndarray
    node_positions: np.ndarray | None = None
    eigenvalues: np.ndarray = field(default_factory=lambda: np.array([],float))
    method: str = "custom"
    normalization: str | Callable = "sphere"
    normalization_scale: float | None = None
    center_align_to_origin: bool = True
    ordered: bool = False
    projection: Callable | None = None
    def __post_init__(self):
        self.rotation_matrix=np.asarray(self.rotation_matrix,float)
        self.center_vector=np.asarray(self.center_vector,float)
        self.eigenvalues=np.asarray(self.eigenvalues,float)
        if self.rotation_matrix.ndim != 2 or self.rotation_matrix.shape[0] != len(self.edge_labels):
            raise ValueError("Rotation rows must match edge labels.")
        if self.center_vector.shape != (len(self.edge_labels),):
            raise ValueError("Center vector must match edge labels.")
        if not np.isfinite(self.rotation_matrix).all() or not np.isfinite(self.center_vector).all():
            raise ValueError("Rotation and center must be finite.")

    def to_dict(self):
        if callable(self.normalization) or self.projection is not None:
            raise ValueError("Callable transforms cannot be serialized; persist them in application code explicitly.")
        return dict(rotation_matrix=self.rotation_matrix.tolist(),codes=self.codes,
                    edge_labels=self.edge_labels,center_vector=self.center_vector.tolist(),
                    node_positions=None if self.node_positions is None else self.node_positions.tolist(),
                    eigenvalues=self.eigenvalues.tolist(),method=self.method,normalization=self.normalization,
                    normalization_scale=self.normalization_scale,center_align_to_origin=self.center_align_to_origin,
                    ordered=self.ordered)

    def save(self,path):
        path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(self.to_dict(),indent=2,allow_nan=False),encoding='utf-8')
        return path

    @classmethod
    def load(cls,path):
        data=json.loads(Path(path).read_text(encoding='utf-8'))
        if data.get('node_positions') is not None:data['node_positions']=np.asarray(data['node_positions'],float)
        return cls(**data)


def fun_skip_sphere_norm(matrix):
    """Divide all entries by the largest row L2 norm, as rENA does."""
    matrix=np.asarray(matrix,float)
    scale=np.linalg.norm(matrix,axis=1).max(initial=0)
    return matrix/scale if scale else np.full_like(matrix,np.nan)


def center(matrix, *, exclude_zero=False):
    matrix=np.asarray(matrix,float)
    if matrix.ndim!=2 or not len(matrix):raise ValueError("A nonempty matrix is required.")
    mask=np.linalg.norm(matrix,axis=1)>0 if exclude_zero else np.ones(len(matrix),bool)
    centered=matrix.copy();vec=matrix[mask].mean(axis=0) if mask.any() else np.zeros(matrix.shape[1])
    centered[mask]-=vec
    return centered,vec


def project(points, rotation):
    """Project a numeric matrix using a rotation matrix or ENARotationSet."""
    return np.asarray(points,float) @ (rotation.rotation_matrix if isinstance(rotation,ENARotationSet) else np.asarray(rotation,float))


def directed_node_positions(line_weights, points, num_dims=None, *, ground_response=False, solver="solve"):
    """Port of rENA's directed node/centroid least-squares formulas (C² edges)."""
    w=np.asarray(line_weights,float);p=np.asarray(points,float)
    if w.ndim!=2 or p.ndim!=2 or not np.isfinite(w).all() or not np.isfinite(p).all():
        raise ValueError("Directed placement requires finite matrices.")
    if solver not in {"solve","lstsq"}:raise ValueError("solver must be solve or lstsq.")
    if num_dims is not None:
        if not isinstance(num_dims,int) or not 1<=num_dims<=p.shape[1]:raise ValueError("Invalid num_dims.")
        p=p[:,:num_dims]
    n=int(round(np.sqrt(w.shape[1])))
    if n*n!=w.shape[1] or len(w)!=len(p):
        raise ValueError("Directed placement requires matching rows and a full C² edge matrix.")
    a=w.reshape(len(w),n,n)
    nw=a.sum(axis=1)+a.sum(axis=2)
    nw/=np.maximum(np.abs(nw).sum(axis=1,keepdims=True),1e-4)
    design,target=nw,p
    if ground_response:
        if len(w)%2:raise ValueError("Ground/response rows must occur in pairs.")
        design=nw[::2]+nw[1::2];target=p[::2]+p[1::2]
    nodes=(np.linalg.solve(design.T@design,design.T@target) if solver=="solve"
           else np.linalg.lstsq(design,target,rcond=None)[0])
    return nodes,nw@nodes


def directed_node_positions_with_ground_response_added(line_weights,points,num_dims=None,**kwargs):
    return directed_node_positions(line_weights,points,num_dims,ground_response=True,**kwargs)


def network_centroids(weights,nodes,enadata):
    weights=np.asarray(weights,float)
    if enadata.ordered:
        n=len(enadata.codes);nw=np.zeros((len(weights),n))
        for k,label in enumerate(enadata.edge_labels):
            a,b=label.split('->');nw[:,enadata.codes.index(a)]+=weights[:,k];nw[:,enadata.codes.index(b)]+=weights[:,k]
        nw/=np.maximum(np.abs(nw).sum(axis=1,keepdims=True),1e-4)
    else:nw=_build_node_weights(weights,len(enadata.codes))
    return nw@nodes


def fit_model(enadata, dimensions=2, rotation="svd", group_column=None, groups=None, *,
              norm_by="sphere", center_align_to_origin=True, center_with=None,
              rotation_params=None, rotation_set=None, node_position_method=None,
              endpoints_only=False, project_with=None):
    """Fit with explicit normalization, centering, rotation and node placement hooks.

    By default all trajectory rows fit the basis, matching the installed
    rENA 0.3.0 path. endpoints_only=True is an explicit native extension.
    """
    if not isinstance(dimensions,int) or dimensions<1:raise ValueError("dimensions must be a positive integer.")
    raw=np.asarray(enadata.accumulated_vectors,float)
    scale=None
    if callable(norm_by):lw=np.asarray(norm_by(raw.copy()),float)
    elif norm_by=="sphere":lw=sphere_normalize(raw)
    elif norm_by in {"max","skip_sphere"}:
        scale=float(np.linalg.norm(raw,axis=1).max(initial=0));lw=fun_skip_sphere_norm(raw)
    elif norm_by=="none":lw=raw.copy()
    else:raise ValueError("norm_by must be sphere, max, none, or a callable.")
    if lw.shape!=raw.shape or not np.isfinite(lw).all():raise ValueError("Normalization must return a finite matrix of the same shape.")
    active=np.linalg.norm(lw,axis=1)>0
    if not active.any():raise ValueError("The model contains no co-occurrences.")
    if rotation_set is not None:
        if isinstance(rotation_set,ENASet):rotation_set=rotation_set.rotation_set
        if not isinstance(rotation_set,ENARotationSet):raise TypeError("rotation_set must be an ENARotationSet or fitted ENASet.")
        ref=copy.deepcopy(rotation_set)
        if enadata.codes!=ref.codes or enadata.edge_labels!=ref.edge_labels or enadata.ordered!=ref.ordered:
            raise ValueError("Codes, edge order and directedness must match the reference rotation.")
        # The reference normalization is part of the transform, not refitted on new data.
        if callable(ref.normalization):lw=np.asarray(ref.normalization(raw.copy()),float)
        elif ref.normalization=="sphere":lw=sphere_normalize(raw)
        elif ref.normalization in {"max","skip_sphere"}:lw=raw/ref.normalization_scale
        else:lw=raw.copy()
        active=np.linalg.norm(lw,axis=1)>0
        projected=lw.copy();selected=active if ref.center_align_to_origin else np.ones(len(lw),bool)
        projected[selected]-=ref.center_vector
        matrix=ref.rotation_matrix[:,:dimensions];eigen=ref.eigenvalues[:dimensions];method=ref.method
        if ref.node_positions is None:raise ValueError("A reference rotation must include node positions.")
        nodes=ref.node_positions[:,:matrix.shape[1]].copy()
        points=(np.asarray(ref.projection(projected.copy(),matrix.copy()),float) if ref.projection else projected@matrix);centroids=network_centroids(lw,nodes,enadata)
        vec=ref.center_vector
    else:
        if center_with is not None:
            projected,vec=center_with(lw.copy())
            projected,vec=np.asarray(projected,float),np.asarray(vec,float)
        else:projected,vec=center(lw,exclude_zero=center_align_to_origin)
        if projected.shape!=lw.shape or vec.shape!=(lw.shape[1],) or not np.isfinite(projected).all():
            raise ValueError("Centering hook returned invalid points or center.")
        fit_rows=np.ones(len(lw),bool)
        if endpoints_only and enadata.trajectory_steps is not None:
            last={u:i for i,u in enumerate(enadata.unit_keys)};fit_rows[:]=False;fit_rows[list(last.values())]=True
        data=projected[fit_rows];params=dict(rotation_params or {})
        if callable(rotation):
            result=rotation(data.copy(),dimensions=dimensions,**params)
            if isinstance(result,ENARotationSet):matrix,eigen=result.rotation_matrix,result.eigenvalues
            else:matrix,eigen=result
            method=getattr(rotation,'__name__','custom')
        elif rotation=="svd":matrix,eigen=svd_rotation(data,dimensions);method=rotation
        elif rotation=="mean":
            from .rotations import rotate_by_means
            if 'contrasts' in params:
                contrasts=[(np.asarray(a,bool)[fit_rows],np.asarray(b,bool)[fit_rows]) for a,b in params['contrasts']]
            else:
                if group_column is None or groups is None or len(groups)!=2:raise ValueError("Mean rotation requires a group column and two groups.")
                vals=[m.get(group_column) for m in enadata.unit_metadata]
                contrasts=[(np.array([v==groups[0] for v in vals])[fit_rows],np.array([v==groups[1] for v in vals])[fit_rows])]
            matrix=rotate_by_means(data,contrasts,dimensions);eigen=np.array([]);method=rotation
        elif rotation in {"generalized","hena","regression","regression_2"}:
            from .rotations import fit_rotation
            if rotation in {"hena","regression","regression_2"} and 'metadata' not in params:
                params['metadata']={key:np.asarray([m.get(key) for m in enadata.unit_metadata])[fit_rows] for key in enadata.metadata}
            matrix,eigen=fit_rotation(data,rotation,dimensions,**params);method=rotation
        else:raise ValueError(f"Unknown rotation: {rotation}")
        matrix,eigen=np.asarray(matrix,float),np.asarray(eigen,float)
        if matrix.ndim!=2 or matrix.shape[0]!=lw.shape[1] or not np.isfinite(matrix).all():raise ValueError("Rotation returned an invalid matrix.")
        matrix=matrix[:,:dimensions]
        points=(np.asarray(project_with(projected.copy(),matrix.copy()),float) if project_with else projected@matrix)
        if points.shape!=(len(lw),matrix.shape[1]) or not np.isfinite(points).all():raise ValueError("Projection hook returned invalid points.")
        fitting=active&fit_rows
        w,p=lw[fitting],points[fitting]
        if callable(node_position_method):result=node_position_method(w.copy(),p.copy(),len(enadata.codes))
        elif enadata.ordered:
            if node_position_method not in {None,"solve","lstsq"}:raise ValueError("Unknown directed node positioning method.")
            if lw.shape[1]!=len(enadata.codes)**2:raise ValueError("Directed fitting requires include_self=True for rENA's C² layout.")
            result=directed_node_positions(w,p,solver="lstsq" if node_position_method=="lstsq" else "solve")
        elif node_position_method in {None,"solve"}:result=_least_squares_node_positions(w,p,len(enadata.codes))
        elif node_position_method=="lstsq":
            design=_build_node_weights(w,len(enadata.codes));nodes=np.linalg.lstsq(design,p,rcond=None)[0];result=(nodes,design@nodes)
        else:raise ValueError("node_position_method must be solve, lstsq or a callable.")
        if isinstance(result,dict):nodes,ct=result['node_positions'],result['centroids']
        else:nodes,ct=result
        nodes,ct=np.asarray(nodes,float),np.asarray(ct,float)
        if nodes.shape!=(len(enadata.codes),points.shape[1]) or ct.shape!=p.shape or not np.isfinite(nodes).all():raise ValueError("Node hook returned invalid positions/centroids.")
        nodes=nodes-ct.mean(axis=0)
        centroids=network_centroids(lw,nodes,enadata)
    ref=ENARotationSet(matrix.copy(),list(enadata.codes),list(enadata.edge_labels),vec.copy(),nodes.copy(),
                       eigen.copy(),method,ref.normalization if rotation_set is not None else norm_by,
                       ref.normalization_scale if rotation_set is not None else scale,
                       ref.center_align_to_origin if rotation_set is not None else center_align_to_origin,enadata.ordered,
                       ref.projection if rotation_set is not None else project_with)
    return ENASet(enadata,lw,projected,matrix,eigen,points,vec,nodes,method,centroids,
                  dict(group_column=group_column, groups=copy.deepcopy(groups), dimensions=dimensions,
                       endpoints_only=endpoints_only, normalization=ref.normalization,
                       center_align_to_origin=ref.center_align_to_origin,
                       center_with=center_with, node_position_method=node_position_method,
                       project_with=ref.projection,
                       rotation_params=copy.deepcopy(rotation_params)), ref)


def project_in(data, reference, *, dimensions=None, centering="current"):
    """Project into an existing basis.

    centering='current' preserves input-centered coordinates (rENA project_in).
    centering='reference' uses the fitted reference transform, as rotation.set.
    """
    ref=reference.rotation_set if isinstance(reference,ENASet) else reference
    if not isinstance(ref,ENARotationSet):raise TypeError("A fitted reference rotation is required.")
    enadata=data.enadata if isinstance(data,ENASet) else data
    result=fit_model(enadata,dimensions=dimensions or ref.rotation_matrix.shape[1],rotation_set=ref)
    if centering=="reference":return result
    if centering!="current":raise ValueError("centering must be current or reference.")
    if isinstance(data,ENASet):
        lw=data.line_weights.copy();points=data.points_for_projection.copy();vec=data.center_vector.copy()
    else:
        raw=np.asarray(enadata.accumulated_vectors,float)
        if callable(ref.normalization):lw=np.asarray(ref.normalization(raw.copy()),float)
        elif ref.normalization=="sphere":lw=sphere_normalize(raw)
        elif ref.normalization in {"max","skip_sphere"}:lw=fun_skip_sphere_norm(raw)
        else:lw=raw.copy()
        points,vec=center(lw,exclude_zero=ref.center_align_to_origin)
    result.line_weights=lw;result.points_for_projection=points;result.center_vector=vec
    result.points=points@result.rotation_matrix
    result.centroids=network_centroids(lw,result.node_positions,enadata)
    result.rotation_set.center_vector=vec.copy()
    if not isinstance(data,ENASet) and isinstance(ref.normalization,str) and ref.normalization in {"max","skip_sphere"}:
        result.rotation_set.normalization_scale=float(np.linalg.norm(raw,axis=1).max())
    return result


def model(data, *, normalize="sphere", center_with=None, rotate_with="svd", project_with=None,
          optimize_with=None, **kwargs):
    """Composable model convenience API; hooks receive matrices, never R objects."""
    return fit_model(data,norm_by=normalize,center_with=center_with,rotation=rotate_with,
                     node_position_method=optimize_with,project_with=project_with,**kwargs)


def means_rotate(ena_set,group_column,groups,**kwargs):
    return rotate(ena_set, 'mean', group_column=group_column, groups=groups, **kwargs)


def as_trajectory(ena_set, *, model="AccumulatedTrajectory", conversation=None, **fit_options):
    from .rena import accumulate_data
    d=ena_set.enadata
    options=d.accumulation_options.copy()
    acc=accumulate_data(d.records,d.codes,d.units,conversation or d.conversation,d.metadata,
                        model,d.window,d.window_size_back,d.window_size_forward,
                        ordered=d.ordered,**options)
    rotation=fit_options.pop('rotation',ena_set.rotation_method)
    if rotation not in {'svd','mean'} and 'rotation_params' not in fit_options:
        raise ValueError("Supply per-step rotation_params when converting a generalized/regression model to trajectories.")
    fit_options.setdefault('norm_by',ena_set.rotation_set.normalization)
    fit_options.setdefault('center_align_to_origin',ena_set.rotation_set.center_align_to_origin)
    return fit_model(acc,dimensions=ena_set.points.shape[1],rotation=rotation,
                     group_column=ena_set.fit_metadata.get('group_column'),groups=ena_set.fit_metadata.get('groups'),**fit_options)


def optimize(ena_set, *, method='solve'):
    """Refit node positions for existing projected coordinates, without rotating."""
    result=copy.deepcopy(ena_set);active=np.linalg.norm(result.line_weights,axis=1)>0
    w,p=result.line_weights[active],result.points[active]
    if callable(method):nodes,ct=method(w,p,len(result.enadata.codes))
    elif result.enadata.ordered:nodes,ct=directed_node_positions(w,p,solver=method)
    elif method=='solve':nodes,ct=_least_squares_node_positions(w,p,len(result.enadata.codes))
    elif method=='lstsq':
        design=_build_node_weights(w,len(result.enadata.codes));nodes=np.linalg.lstsq(design,p,rcond=None)[0];ct=design@nodes
    else:raise ValueError("method must be solve, lstsq or a callable.")
    result.node_positions=np.asarray(nodes)-np.asarray(ct).mean(axis=0)
    result.centroids=network_centroids(result.line_weights,result.node_positions,result.enadata)
    result.rotation_set.node_positions=result.node_positions.copy()
    return result


def rotate(ena_set, method='svd', **kwargs):
    """Refit the basis while preserving the fitted pipeline unless overridden.

    Normalization, centering, projection, node placement, endpoint selection
    and group configuration are inherited. Rotation-specific parameters are
    inherited only when refitting the same rotation method.
    """
    metadata = ena_set.fit_metadata
    reference = ena_set.rotation_set
    options = {
        "norm_by": reference.normalization if reference is not None else metadata.get("normalization", "sphere"),
        "center_align_to_origin": reference.center_align_to_origin if reference is not None else metadata.get("center_align_to_origin", True),
        "center_with": metadata.get("center_with"),
        "project_with": reference.projection if reference is not None else metadata.get("project_with"),
        "node_position_method": metadata.get("node_position_method"),
        "endpoints_only": metadata.get("endpoints_only", False),
        "group_column": metadata.get("group_column"),
        "groups": copy.deepcopy(metadata.get("groups")),
    }
    group_override = method == "mean" and any(key in kwargs for key in ("group_column", "groups"))
    if method == ena_set.rotation_method and not group_override:
        options["rotation_params"] = copy.deepcopy(metadata.get("rotation_params"))
    options.update(kwargs)
    dimensions = options.pop("dimensions", ena_set.points.shape[1])
    return fit_model(ena_set.enadata, dimensions=dimensions, rotation=method, **options)
