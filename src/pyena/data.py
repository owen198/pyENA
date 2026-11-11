"""Python equivalents of rENA column roles and data/adjacency utilities."""
from __future__ import annotations
from dataclasses import dataclass,field,replace
from collections.abc import Mapping
import copy
import numpy as np
from .rena import _coerce_records,_coerce_code_value,ENAData,ENASet

@dataclass
class QEData:
    records: list[dict]
    roles: dict[str,list[str]] = field(default_factory=dict)
    def __len__(self):return len(self.records)


def as_qe_data(data):
    return copy.deepcopy(data) if isinstance(data,QEData) else QEData(_coerce_records(data))


def define(data, *, units_cols=None,codes_cols=None,horizon_cols=None,metadata_cols=None):
    result=as_qe_data(data)
    available=set(result.records[0]) if result.records else set()
    for role,cols in [('units',units_cols),('codes',codes_cols),('horizon',horizon_cols),('metadata',metadata_cols)]:
        if cols is not None:
            cols=[cols] if isinstance(cols,str) else list(cols)
            if not set(cols)<=available:raise ValueError(f"Unknown {role} columns: {set(cols)-available}")
            result.roles[role]=cols
    if codes_cols is None and 'codes' not in result.roles:result.roles['codes']=find_binary_cols(result)
    return result


def reclassify(data,role,*columns):
    if role not in {'units','codes','horizon','metadata'}:raise ValueError("Unknown column role.")
    return define(data,**{dict(units='units_cols',codes='codes_cols',horizon='horizon_cols',metadata='metadata_cols')[role]:columns})


def _role(data,role,columns):
    if columns:return reclassify(data,role,*columns)
    if not isinstance(data,QEData):raise TypeError("Define column roles on a QEData object first.")
    return list(data.roles.get(role,[]))

def units(data,*columns):return _role(data,'units',columns)
def codes(data,*columns):return _role(data,'codes',columns)
def horizon(data,*columns):return _role(data,'horizon',columns)
def metadata(data,*columns):return _role(data,'metadata',columns)
def find_code_cols(data):return codes(data)
def find_meta_cols(data):return metadata(data)
def find_dimension_cols(data):
    if isinstance(data,ENASet):return [f'dimension_{i+1}' for i in range(data.points.shape[1])]
    rows=data.records if isinstance(data,QEData) else _coerce_records(data)
    return [k for k in (rows[0] if rows else []) if k.startswith(('dimension_','SVD','MR','GMR'))]

def find_binary_cols(data,include_logical=False):
    rows=data.records if isinstance(data,QEData) else _coerce_records(data)
    if not rows:return []
    result=[]
    for key in rows[0]:
        values=[r[key] for r in rows]
        if not include_logical and all(isinstance(v,(bool,np.bool_)) for v in values):continue
        try:
            numbers=np.asarray(values,float)
            if np.isfinite(numbers).all() and np.isin(numbers,[0,1]).all():result.append(key)
        except (ValueError,TypeError):pass
    return result


def accumulate(data,units=None,codes=None,horizon=None,**kwargs):
    from .rena import accumulate_data
    if isinstance(data,QEData):
        return accumulate_data(data.records,codes or data.roles.get('codes',[]),units or data.roles.get('units',[]),
                               horizon or data.roles.get('horizon',[]),data.roles.get('metadata',[]),**kwargs)
    return accumulate_data(data,codes,units,horizon,**kwargs)


def names_to_adjacency_key(codes,upper_triangle=True):
    codes=list(codes)
    pairs=[(i,j) for j in range(1,len(codes)) for i in range(j)] if upper_triangle else [(i,j) for j in range(len(codes)) for i in range(len(codes))]
    return np.array([(codes[i],codes[j]) for i,j in pairs]).T


def combn_c2(n):
    """Zero-based unordered pairs; order matches rENA::combn_c2."""
    return np.array([(i,j) for i in range(n) for j in range(i+1,n)],dtype=int).T


def merge_columns(records,columns,sep='::'):
    records=records.records if isinstance(records,QEData) else _coerce_records(records)
    return [sep.join(str(row[c]) for c in columns) for row in records]


def vector_to_ut(values):
    values=np.asarray(values,float)
    return np.array([values[i]*values[j] for j in range(1,len(values)) for i in range(j)])


def connection_matrix(vector,codes,*,ordered=False):
    codes=list(codes);vector=np.asarray(vector,float)
    pairs=[(i,j) for j in range(len(codes)) for i in range(len(codes))] if ordered else [(i,j) for j in range(1,len(codes)) for i in range(j)]
    if vector.shape!=(len(pairs),):raise ValueError("Connection vector length does not match the code layout.")
    mat=np.zeros((len(codes),len(codes)))
    for v,(i,j) in zip(vector,pairs):
        mat[i,j]=v
        if not ordered:mat[j,i]=v
    return mat


def ena_conversations(data,unit_labels,*,codes,units_by=None,conversation_by=None,window=4,conversation_exclude=()):
    """Return original row indices for co-occurrence context (zero-based indices)."""
    if isinstance(data,ENASet):data=data.enadata
    if isinstance(data,ENAData):
        units_by=units_by or data.units;conversation_by=conversation_by or data.conversation;records=data.records
    else:records=_coerce_records(data)
    if not units_by or not conversation_by:raise ValueError("units_by and conversation_by are required.")
    if not (np.isposinf(window) or (window>=1 and int(window)==window)):raise ValueError("window must be a positive integer or infinity.")
    if isinstance(unit_labels,str):unit_labels=[unit_labels]
    unitkeys=merge_columns(records,units_by);convkeys=merge_columns(records,conversation_by)
    contexts={}
    for i,key in enumerate(convkeys):contexts.setdefault(key,[]).append(i)
    selected=[];all_rows=set();remove=[]
    for key,indices in contexts.items():
        if key in conversation_exclude:continue
        for pos,i in enumerate(indices):
            if unitkeys[i] not in unit_labels or not any(_coerce_code_value(records[i][c])>0 for c in codes):continue
            selected.append(i);start=0 if np.isinf(window) else max(0,pos-int(window)+1)
            stanza=indices[start:pos+1]
            if all(sum(_coerce_code_value(records[j][c]) for j in stanza)>0 for c in codes):all_rows.update(stanza)
            else:remove.append(i)
    return dict(conversations=contexts,unitConvs=list(dict.fromkeys(convkeys[i] for i in sorted(selected))),
                allRows=sorted(all_rows),unitRows=sorted(selected),toRemove=sorted(remove),index_base=0)

class QEColumn(np.ndarray):
    """A NumPy column with an explicit QE role; independent of R's S3 classes."""
    def __new__(cls,values,role):
        obj=np.asarray(values).view(cls);obj.role=role;return obj
    def __array_finalize__(self,obj):self.role=getattr(obj,'role',None)


def as_qe_code(values):return QEColumn(values,'codes')
def as_qe_unit(values):return QEColumn(values,'units')
def as_qe_horizon(values):return QEColumn(values,'horizon')
def as_qe_metadata(values):return QEColumn(values,'metadata')
def is_qe_data(value):return isinstance(value,QEData)
def is_qe_code(value):return isinstance(value,QEColumn) and value.role=='codes'
def is_qe_unit(value):return isinstance(value,QEColumn) and value.role=='units'
def is_qe_horizon(value):return isinstance(value,QEColumn) and value.role=='horizon'
def is_qe_metadata(value):return isinstance(value,QEColumn) and value.role=='metadata'

class ENAMatrix(np.ndarray):
    def __new__(cls,values,kind='matrix',row_labels=None,column_labels=None):
        obj=np.asarray(values,float).view(cls)
        if obj.ndim!=2:raise ValueError("ENAMatrix must be two-dimensional.")
        if row_labels is not None and len(row_labels)!=obj.shape[0]:raise ValueError("Row label count mismatch.")
        if column_labels is not None and len(column_labels)!=obj.shape[1]:raise ValueError("Column label count mismatch.")
        obj.kind=kind;obj.row_labels=row_labels;obj.column_labels=column_labels;return obj
    def __array_finalize__(self,obj):
        self.kind=getattr(obj,'kind','matrix');self.row_labels=getattr(obj,'row_labels',None);self.column_labels=getattr(obj,'column_labels',None)


def as_ena_matrix(values,**kwargs):return ENAMatrix(values,**kwargs)
def as_ena_co_occurrence(values):return QEColumn(np.asarray(values,float),'co_occurrence')
def as_ena_metadata(values):return as_qe_metadata(values)
def remove_meta_data(data):
    if isinstance(data,QEData):
        excluded=set(data.roles.get('metadata',[]));return [{k:v for k,v in row.items() if k not in excluded} for row in data.records]
    return np.asarray(data)