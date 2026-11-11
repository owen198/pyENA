"""Methods/report export without an R or rmarkdown runtime dependency."""
from __future__ import annotations
import html
import json
from pathlib import Path
import numpy as np


def json_safe(value):
    if isinstance(value,np.ndarray):return json_safe(value.tolist())
    if isinstance(value,np.generic):return json_safe(value.item())
    if isinstance(value,float):return value if np.isfinite(value) else None
    if isinstance(value,dict):return {str(k):json_safe(v) for k,v in value.items()}
    if isinstance(value,(list,tuple)):return [json_safe(v) for v in value]
    return value


def methods_report(ena_set,*,comparison_groups=None):
    d=ena_set.enadata;fit=ena_set.fit_metadata
    norm=fit.get('normalization','sphere');norm=getattr(norm,'__name__',norm)
    text=(f"Epistemic network analysis was conducted using pyENA with {len(ena_set.unit_labels)} analysis units "
          f"and {len(d.codes)} codes ({', '.join(d.codes)}). Analysis units were defined by {', '.join(d.units)}, "
          f"with conversation boundaries defined by {', '.join(d.conversation)}. "
          f"The {d.model} model used a {d.window} window with backward parameter {d.window_size_back} "
          f"and forward parameter {d.window_size_forward}. "
          f"The normalization method was {norm}; the rotation method was {ena_set.rotation_method}, "
          f"retaining {ena_set.points.shape[1]} dimensions.")
    if d.window=='MovingStanzaWindow':text+=' The backward parameter includes the current row; zero also retains the current row.'
    weight=d.accumulation_options.get('weight_by','binary')
    weight=getattr(weight,'__name__',weight)
    text+=f' Co-occurrences used {weight} weighting.'
    if d.accumulation_options.get('mask') is not None:text+=' An explicit edge mask was applied.'
    if comparison_groups:
        if len(comparison_groups)!=2:raise ValueError("Provide two comparison group labels.")
        text+=f" Group comparisons between {comparison_groups[0]} and {comparison_groups[1]} used two-sided Welch t-tests and Mann–Whitney U tests on retained coordinates."
    if ena_set.rotation_method=='mean':
        text+=' Group membership was used to choose the means-rotation axis; ordinary coordinate-test p-values do not adjust for this axis selection.'
    if d.ordered:text+=' Ordered accumulation uses the documented temporal-transition convention; tma context-tensor equivalence is not established.'
    return text


def ena_writeup(ena_set,output_file=None,*,summary=None,comparison_groups=None):
    text=methods_report(ena_set,comparison_groups=comparison_groups)
    if output_file is None:return text
    path=Path(output_file);suffix=path.suffix.lower()
    if suffix not in {'.txt','.md','.html','.json'}:raise ValueError("Supported report formats: txt, md, html, json (Word/rmarkdown rendering is not implemented).")
    if suffix=='.html':content='<!doctype html><meta charset="utf-8"><title>ENA methods</title><main><h1>ENA methods</h1><p>'+html.escape(text)+'</p></main>'
    elif suffix=='.json':content=json.dumps(json_safe(dict(methods=text,summary=summary)),indent=2,allow_nan=False)
    else:content=text
    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(content,encoding='utf-8')
    return path

methods_report_stream=methods_report