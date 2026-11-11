"""Native constrained, generalized and regression rotations.

The elastic-net main-effect implementation is experimental: it is not a
bit-for-bit replacement for glmnet's path generation and CV defaults.
"""
from __future__ import annotations
from dataclasses import dataclass
from itertools import combinations
from collections.abc import Mapping
import re
import warnings
import numpy as np


def _matrix(x):
    a=np.asarray(x,float)
    if a.ndim!=2 or not np.isfinite(a).all():raise ValueError("Expected a finite matrix.")
    return a


def _unit(v):
    norm=np.linalg.norm(v)
    if norm<1e-12:raise ValueError("Rotation direction is undefined (zero or collinear effect).")
    return np.asarray(v,float)/norm


def _complete(data,axes,dimensions):
    """Complete orthonormal constrained axes in their complement."""
    from scipy.linalg import null_space
    if not axes:
        return np.linalg.svd(data,full_matrices=False)[2][:dimensions].T
    w=np.column_stack(axes)
    if w.shape[1]>dimensions:raise ValueError("dimensions is smaller than the number of constraints.")
    if np.linalg.matrix_rank(w)!=w.shape[1]:raise ValueError("Constrained axes are linearly dependent.")
    complement=null_space(w.T)
    if complement.shape[1]:
        vt=np.linalg.svd((data-data.mean(axis=0))@complement,full_matrices=False)[2]
        tail=complement@vt.T
        w=np.column_stack([w,tail])
    return w[:,:dimensions]


def rotate_by_means(points,contrasts,dimensions=2):
    data=_matrix(points);data=data-data.mean(axis=0)
    residual=data.copy();axes=[]
    for a,b in contrasts:
        a,b=np.asarray(a,bool),np.asarray(b,bool)
        if a.shape!=(len(data),) or b.shape!=(len(data),) or not a.any() or not b.any():
            raise ValueError("Each contrast must select two nonempty groups of fitted rows.")
        axis=_unit(residual[a].mean(axis=0)-residual[b].mean(axis=0))
        axes.append(axis);residual-=np.outer(residual@axis,axis)
    return _complete(residual,axes,dimensions)


def _columns(X):
    if isinstance(X,Mapping):cols={str(k):np.asarray(v) for k,v in X.items()}
    else:
        a=np.asarray(X)
        if a.ndim==1:a=a[:,None]
        if a.ndim!=2:raise ValueError("Predictors must be a vector, matrix or column mapping.")
        cols={f'x{i+1}':a[:,i] for i in range(a.shape[1])}
    if not cols or len({len(v) for v in cols.values()})!=1:raise ValueError("Predictor columns must be nonempty and equally sized.")
    return cols


def _encode(column):
    a=np.asarray(column)
    try:
        num=a.astype(float)
    except (ValueError,TypeError):
        levels=sorted(set(a.tolist()),key=str)
        if len(levels)<2:raise ValueError("A categorical predictor requires at least two levels.")
        return np.column_stack([a==v for v in levels[1:]]).astype(float),[str(v) for v in levels[1:]]
    if not np.isfinite(num).all():raise ValueError("Nonfinite predictor.")
    return num[:,None],['']


def design_matrix(X, *, interactions=False, terms=None):
    cols = _columns(X)
    selected = list(cols) if terms is None else list(terms)
    if interactions and terms is None:
        selected += [':'.join(pair) for pair in combinations(cols, 2)]
    referenced = list(dict.fromkeys(factor for term in selected for factor in term.split(':')))
    missing = set(referenced) - cols.keys()
    if missing:
        raise ValueError(f"Unknown predictors: {sorted(missing)}")
    # Unused metadata is not part of the formula and must not be encoded.
    encoded = {key: _encode(cols[key]) for key in referenced}
    names = ['(Intercept)']
    arrays = [np.ones((len(next(iter(cols.values()))), 1))]
    for term in selected:
        if ':' in term:
            factors=term.split(':')
            if any(f not in encoded for f in factors):raise ValueError(f"Unknown predictor term {term}")
            vals=[(np.ones(len(arrays[0])), '')]
            for f in factors:
                m,labels=encoded[f]
                vals=[(v*m[:,i],(name+':'+f+labels[i]).lstrip(':')) for v,name in vals for i in range(m.shape[1])]
            arrays.extend(v[:,None] for v,_ in vals);names.extend(n for _,n in vals)
        else:
            if term not in encoded:raise ValueError(f"Unknown predictor: {term}")
            m,labels=encoded[term];arrays.append(m);names.extend(term+x for x in labels)
    return np.column_stack(arrays),names


@dataclass
class GMRResult:
    direction: np.ndarray
    fitted_values: np.ndarray
    target: np.ndarray
    main_effect: np.ndarray
    metadata: dict


def _elastic_fit(x,y,lam,alpha,penalty,*,max_iter=10000,tol=1e-8):
    """Multi-response row-group elastic net, with unpenalized designated terms."""
    mean=x.mean(axis=0);scale=np.sqrt(np.mean((x-mean)**2,axis=0));scale[scale==0]=1
    z=(x-mean)/scale;ym=y.mean(axis=0);response=y-ym
    b=np.zeros((x.shape[1],y.shape[1]));res=response.copy();norms=np.mean(z*z,axis=0)
    for iteration in range(max_iter):
        previous=b.copy()
        for j in range(z.shape[1]):
            if norms[j]==0:continue
            res+=z[:,j,None]*b[j]
            rho=z[:,j]@res/len(z);size=np.linalg.norm(rho)
            shrink=max(0,1-lam*alpha*penalty[j]/size) if size else 0
            b[j]=rho*shrink/(norms[j]+lam*(1-alpha)*penalty[j])
            res-=z[:,j,None]*b[j]
        if np.max(np.abs(b-previous),initial=0)<tol:break
    else:raise RuntimeError("Elastic-net solver did not converge; change the lambda grid or tolerance.")
    b=b/scale[:,None]
    return b,ym-mean@b


def get_x1_main_effect(V,X,alpha=1.,lambda_value="lambda.min",*,lambdas=None,fold_ids=None,random_state=0):
    """Experimental native multi-response elastic-net CV; explicit fold control.

    Implements a functional main-effect estimator. glmnet's lambda path,
    penalty normalization and CV conventions are not claimed reproduced.
    """
    warnings.warn("Native elastic-net CV is experimental; glmnet numerical parity is not established.",RuntimeWarning,stacklevel=2)
    V=_matrix(V);cols=_columns(X);mm,names=design_matrix(cols,interactions=True)
    if len(mm)!=len(V) or not 0<=alpha<=1:raise ValueError("Invalid predictor rows or alpha.")
    first=next(iter(cols));main=np.array([n==first or (n.startswith(first) and ':' not in n and n!='(Intercept)') for n in names])
    penalty=np.ones(mm.shape[1]);penalty[main]=0;penalty[0]=0
    if lambdas is None:
        max_lam=max(float(np.max(np.linalg.norm(mm.T@(V-V.mean(axis=0))/len(V),axis=1))),1e-3)
        lambdas=np.geomspace(max_lam,max_lam*1e-3,30)
    lambdas=np.asarray(lambdas,float)
    if lambdas.ndim!=1 or not len(lambdas) or not np.isfinite(lambdas).all() or (lambdas<0).any():raise ValueError("lambdas must be a finite nonnegative grid.")
    if isinstance(lambda_value,(float,int)):chosen=float(lambda_value)
    else:
        if lambda_value not in {'lambda.min','lambda.1se'}:raise ValueError("Unknown lambda selection.")
        if len(V)<4:raise ValueError("Cross-validation requires at least four units.")
        if fold_ids is None:
            fold_ids=np.arange(len(V))%min(10,max(2,len(V)//2));np.random.default_rng(random_state).shuffle(fold_ids)
        fold_ids=np.asarray(fold_ids)
        if fold_ids.shape!=(len(V),) or len(np.unique(fold_ids))<2:raise ValueError("At least two CV folds are required.")
        scores=[]
        for lam in lambdas:
            loss=[]
            for fold in np.unique(fold_ids):
                train=fold_ids!=fold
                if train.sum()<2:raise ValueError("Every CV training split needs at least two units.")
                coef,intercept=_elastic_fit(mm[train],V[train],lam,alpha,penalty)
                loss.append(np.mean((V[~train]-(mm[~train]@coef+intercept))**2))
            scores.append(loss)
        scores=np.array(scores);means=scores.mean(axis=1);best=np.argmin(means)
        if lambda_value=='lambda.1se':
            threshold=means[best]+scores[best].std(ddof=1)/np.sqrt(scores.shape[1])
            chosen=float(np.max(lambdas[means<=threshold]))
        else:chosen=float(lambdas[best])
    coef,_=_elastic_fit(mm,V,chosen,alpha,penalty)
    return mm[:,main]@coef[main]


def gmr(V,X,**kwargs):
    V=_matrix(V);cols=_columns(X);target=next(iter(cols.values()))
    design,_=design_matrix({next(iter(cols)):target})
    if len(V)!=len(design):raise ValueError("Predictors must match fitted units.")
    coef=np.linalg.lstsq(design,V,rcond=None)[0];fitted=design@coef
    effect=fitted if len(cols)==1 else get_x1_main_effect(V,cols,**kwargs)
    try:
        target.astype(float);numeric=True
    except (TypeError,ValueError):numeric=False
    if numeric:direction=_unit(coef[1])
    else:
        grand=effect.mean(axis=0);scatter=np.zeros((V.shape[1],V.shape[1]))
        for value in np.unique(target):
            group=effect[target==value];delta=group.mean(axis=0)-grand
            scatter+=len(group)*np.outer(delta,delta)
        direction=np.linalg.svd(scatter)[2][0]
    return GMRResult(direction,fitted,target,effect,{'experimental_cv':len(cols)>1})


def generalized_rotation(V,x_var,dimensions=2,*,y_var=None,select_2_groups=None,**kwargs):
    V=_matrix(V);x=gmr(V,x_var,**kwargs);axis=x.direction
    residual=V-np.outer(V@axis,axis)
    extra=None
    if select_2_groups is not None:
        if len(select_2_groups)!=2:raise ValueError("select_2_groups requires two labels.")
        a,b=(x.target==v for v in select_2_groups)
        if not a.any() or not b.any():raise ValueError("Selected GMR groups are absent.")
        diff=residual[a].mean(axis=0)-residual[b].mean(axis=0)
        if np.linalg.norm(diff)>1e-10:extra=_unit(diff)
    if extra is None:extra=np.linalg.svd(x.fitted_values,full_matrices=False)[2][0]
    dot=float(extra@axis)
    if abs(dot)<.99:
        extra=_unit(extra-dot*axis);residual-=np.outer(residual@extra,extra)
    second=gmr(residual,y_var,**kwargs).direction if y_var is not None else np.linalg.svd(residual,full_matrices=False)[2][0]
    # rENA does not re-orthogonalize this tail for generalized rotation.
    remainder=V-np.outer(V@axis,axis)-np.outer(V@second,second)
    tail=np.linalg.svd(remainder,full_matrices=False)[2].T
    return np.column_stack([axis,second,tail[:,:max(0,min(V.shape)-2)]])[:,:dimensions]


def _formula_terms(formula):
    """Safe additive/interactions grammar; arbitrary R/Python evaluation is forbidden."""
    text=formula.strip()
    if '~' in text:lhs,text=text.split('~',1)
    else:lhs='V'
    if not re.fullmatch(r'[\w\s.+:*\-]+',text):raise ValueError("Only named additive and interaction terms are supported in formulas.")
    if '-' in text:raise ValueError("Formula subtraction is not supported; specify the wanted terms explicitly.")
    terms=[]
    for piece in text.replace(' ','').split('+'):
        if piece in {'','1'}:continue
        if '*' in piece:
            factors=piece.split('*')
            terms+=factors+[':'.join(c) for k in range(2,len(factors)+1) for c in combinations(factors,k)]
        else:terms.append(piece)
    return lhs.strip(),list(dict.fromkeys(terms))


def regression_rotation(V,x_var,dimensions=2,*,y_var=None,metadata=None,variant=1):
    """OLS formulas V ~ x (+ controls) or numeric outcome ~ V.

    The supported formula grammar is explicit; arbitrary R expressions raise.
    """
    V=_matrix(V);metadata=dict(metadata or {});axes=[];residual=V.copy()
    for formula in [x_var]+([] if y_var is None else [y_var]):
        response,terms=_formula_terms(formula)
        if response=='V':
            if 'V' in terms:raise ValueError("V cannot occur on both sides of the formula.")
            design,_=design_matrix(metadata,terms=terms)
            coef=np.linalg.lstsq(design,V,rcond=None)[0]
            if coef.shape[0]<2:raise ValueError("A non-intercept regression term is required.")
            direction=coef[1]
        elif terms==['V']:
            if response not in metadata:raise ValueError(f"Unknown response: {response}")
            outcome=np.asarray(metadata[response],float)
            coef=np.linalg.lstsq(np.column_stack([np.ones(len(V)),residual]),outcome,rcond=None)[0]
            direction=coef[1:]
        else:raise ValueError("Regression rotation supports V ~ predictors or response ~ V.")
        axis=_unit(direction);axes.append(axis);residual-=np.outer(residual@axis,axis)
    # R regression rotations may keep nonorthogonal constrained directions.
    tail=np.linalg.svd(residual,full_matrices=False)[2].T
    return np.column_stack(axes+[tail[:,:max(0,min(V.shape)-len(axes))]])[:,:dimensions]


def hena_rotation(V,x_var,dimensions=2,*,y_var=None,control_vars=None,metadata=None,centering=True,include_xy=False,formula=None):
    V=_matrix(V);V=V-V.mean(axis=0);metadata=dict(metadata or {})
    targets=[x_var]+([] if y_var is None else [y_var]);cols={}
    for key in targets+list(control_vars or []):
        if key not in metadata:raise ValueError(f"Unknown hENA variable: {key}")
        values=np.asarray(metadata[key])
        if key in targets:
            try:values=values.astype(float)
            except (TypeError,ValueError):
                # Match rENA rleidv: encode contiguous runs, not sorted factor levels.
                values=np.cumsum(np.r_[True,values[1:]!=values[:-1]])-1
            if centering:values=values-values.mean()
        cols[key]=values
    terms=targets+list(control_vars or [])
    if include_xy:
        if y_var is None:raise ValueError("include_xy requires x and y.")
        terms+=[':'.join(targets)]
    if formula is not None:_,terms=_formula_terms(formula)
    design,_=design_matrix(cols,terms=terms)
    coef=np.linalg.lstsq(design,V,rcond=None)[0]
    axes=[];residual=V.copy()
    for i in range(len(targets)):
        axis=coef[i+1].copy()
        for previous in axes:axis-=axis@previous*previous
        axis=_unit(axis);axes.append(axis);residual-=np.outer(residual@axis,axis)
    eigen=np.linalg.svd(residual,full_matrices=False)[1]**2/max(len(V)-1,1)
    return _complete(residual,axes,dimensions),eigen[:dimensions]


def fit_rotation(V,method,dimensions,**params):
    if method=='generalized':return generalized_rotation(V,dimensions=dimensions,**params),np.array([])
    if method=='hena':return hena_rotation(V,dimensions=dimensions,**params)
    if method in {'regression','regression_2'}:
        return regression_rotation(V,dimensions=dimensions,variant=2 if method.endswith('_2') else 1,**params),np.array([])
    raise ValueError(f"Unknown rotation method: {method}")