"""Composable 2D layers, trajectories and native Plotly animation.

These are Python interfaces; they preserve analytical values, not Plotly/R
object schemas or identical R styling defaults.
"""
from __future__ import annotations
from dataclasses import dataclass,field
from pathlib import Path
import copy
import numpy as np
from .rena import ENASet,_mean_point_and_ci,group_mask

@dataclass
class ENAPlot:
    ena_set: ENASet
    title: str = 'ENA Plot'
    dimensions: tuple[int,int] = (0,1)
    figure: object = field(init=False)
    ax: object = field(init=False)
    layers: dict[str,list] = field(default_factory=dict,init=False)
    point_groups: list = field(default_factory=list,init=False)
    def __post_init__(self):
        import matplotlib.pyplot as plt
        if max(self.dimensions)>=self.ena_set.points.shape[1]:raise ValueError("Selected plot dimensions are unavailable.")
        self.figure,self.ax=plt.subplots(figsize=(7,7));self.ax.set_title(self.title)
        self.ax.set_xlabel(f'Dimension {self.dimensions[0]+1}');self.ax.set_ylabel(f'Dimension {self.dimensions[1]+1}')
        self.ax.axhline(0,color='#ddd',lw=.8);self.ax.axvline(0,color='#ddd',lw=.8)
        self.ax.set_aspect('equal',adjustable='box')
    def save(self,path):
        path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);self.figure.savefig(path,bbox_inches='tight');return path
    def show(self):return self.figure
    def close(self):
        import matplotlib.pyplot as plt
        plt.close(self.figure)


def ena_plot(ena_set,title='ENA Plot',**kwargs):return ENAPlot(ena_set,title,**kwargs)


def _points(plot,points):
    p=np.asarray(points,float)
    if p.ndim==1:p=p[None,:]
    if p.ndim!=2 or p.shape[1]<=max(plot.dimensions) or not np.isfinite(p).all():raise ValueError("Invalid point coordinates.")
    return p[:,plot.dimensions]


def _layer(plot,name,artists):
    key=name or f'layer_{len(plot.layers)+1}'
    if key in plot.layers:raise ValueError(f"A layer named {key!r} already exists.")
    plot.layers[key]=list(artists);return plot


def add_points(plot,points=None,*,wh=None,colors='#2166ac',labels=None,name=None,point_size=30,show_mean=False):
    all_points=plot.ena_set.points if points is None else points
    if wh is not None:all_points=np.asarray(all_points)[wh]
    p=_points(plot,all_points)
    artists=[plot.ax.scatter(p[:,0],p[:,1],c=colors,s=point_size,label=name)]
    if labels is not None:
        if len(labels)!=len(p):raise ValueError("One label per point is required.")
        artists += [plot.ax.annotate(str(label),xy,xytext=(4,4),textcoords='offset points') for label,xy in zip(labels,p)]
    plot.point_groups.append((np.asarray(all_points),colors,name or f'layer_{len(plot.layers)+1}'))
    _layer(plot,name,artists)
    if show_mean:add_group(plot,all_points,colors=colors,name=None)
    return check_range(plot)


def add_group(plot,points,*,method='mean',colors='#2166ac',confidence_interval='box',outlier_interval='none',name=None):
    import matplotlib.patches as patches
    p=_points(plot,points)
    reducer={'mean':np.mean,'median':np.median}.get(method) if isinstance(method,str) else method
    if reducer is None:raise ValueError("Use mean, median or a scalar callable.")
    if confidence_interval not in {'none','box','crosshairs'} or outlier_interval not in {'none','box','crosshairs'}:raise ValueError("Unknown interval style.")
    if method!='mean' and (confidence_interval!='none' or outlier_interval!='none'):raise ValueError("Group intervals require method='mean'.")
    value=np.apply_along_axis(reducer,0,p);artists=[plot.ax.scatter(*value,c=colors,s=95,marker='s',edgecolors='black',label=name,zorder=5)]
    summary=_mean_point_and_ci(p)
    for style,bounds in [(confidence_interval,np.array(list(summary['confidence_interval_95'].values())).T),
                         (outlier_interval,np.array([value-1.5*np.asarray(summary['iqr']),value+1.5*np.asarray(summary['iqr'])]))]:
        if style=='none' or not np.isfinite(bounds).all():continue
        lo,hi=bounds
        if style=='box':
            box=patches.Rectangle(lo,*(hi-lo),fill=False,edgecolor=colors,linestyle='--');plot.ax.add_patch(box);artists.append(box)
        else:artists+=plot.ax.plot([lo[0],hi[0]],[value[1],value[1]],color=colors)+plot.ax.plot([value[0],value[0]],[lo[1],hi[1]],color=colors)
    return check_range(_layer(plot,name,artists))


def add_nodes(plot,*,labels=True,color='#222',size=30,name=None):
    nodes=_points(plot,plot.ena_set.node_positions)
    artists=[plot.ax.scatter(nodes[:,0],nodes[:,1],c=color,s=size)]
    if labels:artists += [plot.ax.annotate(code,xy,xytext=(4,0),textcoords='offset points') for code,xy in zip(plot.ena_set.enadata.codes,nodes)]
    return check_range(_layer(plot,name,artists))


def add_network(plot,network,*,colors=('#2166ac','#d6604d'),threshold=0.,show_all_nodes=True,
                layers=('nodes','edges'),name=None,multiplier=8.,thin_lines_in_front=True):
    from matplotlib.patches import FancyArrowPatch
    d=plot.ena_set.enadata;coords=_points(plot,plot.ena_set.node_positions);v=np.asarray(network,float).copy()
    if v.shape!=(len(d.edge_labels),) or not np.isfinite(v).all():raise ValueError("Network must match model edges.")
    limits=np.atleast_1d(threshold).astype(float)
    if len(limits)>2 or limits[0]<0 or (len(limits)==2 and limits[1]<limits[0]):raise ValueError("Invalid threshold range.")
    v[np.abs(v)<limits[0]]=0
    if len(limits)==2:v=np.sign(v)*np.minimum(np.abs(v),limits[1])
    if set(layers)-{'nodes','edges'}:raise ValueError("layers may contain nodes and edges.")
    artists=[];used=set();order=np.argsort(np.abs(v))
    if thin_lines_in_front:order=order[::-1]
    for k in order:
        weight=v[k]
        if weight==0:continue
        sep='->' if d.ordered else '__';a,b=d.edge_labels[k].split(sep);i,j=d.codes.index(a),d.codes.index(b);used.update([i,j])
        if 'edges' not in layers:continue
        color=colors[0] if weight>0 else colors[1];width=max(.2,abs(weight)*multiplier)
        if d.ordered:
            artist=FancyArrowPatch(coords[i],coords[j],arrowstyle='-|>',mutation_scale=12,color=color,lw=width,
                                  connectionstyle='arc3,rad=.12' if i!=j else 'arc3,rad=.5')
            plot.ax.add_patch(artist);artists.append(artist)
        else:artists+=plot.ax.plot(coords[[i,j],0],coords[[i,j],1],color=color,lw=width)
    if 'nodes' in layers:
        ids=list(range(len(coords))) if show_all_nodes else sorted(used)
        if ids:
            artists.append(plot.ax.scatter(coords[ids,0],coords[ids,1],c='#222',s=30,zorder=4))
            artists += [plot.ax.annotate(d.codes[i],coords[i],xytext=(4,0),textcoords='offset points') for i in ids]
    return check_range(_layer(plot,name,artists))


def add_trajectory(plot,*,by=None,labels=False,colors=None,name=None):
    d=plot.ena_set.enadata
    if d.trajectory_steps is None:raise ValueError("A trajectory model is required.")
    groups={}
    for i,key in enumerate(d.unit_keys):groups.setdefault(key,[]).append(i)
    artists=[]
    for count,(key,ids) in enumerate(groups.items()):
        if by is not None and key not in by:continue
        xy=_points(plot,plot.ena_set.points[ids]);color=colors[count%len(colors)] if isinstance(colors,(list,tuple)) else colors
        artists+=plot.ax.plot(xy[:,0],xy[:,1],'-o',label='::'.join(map(str,key)),color=color)
        if labels:artists += [plot.ax.annotate(str(d.trajectory_steps[i]),xy[j]) for j,i in enumerate(ids)]
    return check_range(_layer(plot,name,artists))


def with_means(plot,**kwargs):
    for points,color,name in list(plot.point_groups):add_group(plot,points,colors=color,**kwargs)
    return plot


def check_range(plot,padding=.1):
    plot.ax.relim();plot.ax.autoscale_view()
    arrays=[_points(plot,plot.ena_set.node_positions),_points(plot,plot.ena_set.points)]
    for artist in plot.ax.patches:
        if hasattr(artist,'get_bbox'):arrays.append(np.array([artist.get_bbox().min,artist.get_bbox().max]))
    values=np.vstack(arrays);low=values.min(axis=0);high=values.max(axis=0)
    span=max(float(np.max(high-low)),1e-3);mid=(high+low)/2;half=span*(.5+padding)
    plot.ax.set_xlim(mid[0]-half,mid[0]+half);plot.ax.set_ylim(mid[1]-half,mid[1]+half)
    return plot


def clear(plot,wh=None):
    names=list(plot.layers) if wh is None else ([wh] if isinstance(wh,str) else list(wh))
    for name in names:
        for artist in plot.layers.pop(name,[]):artist.remove()
    if wh is None:plot.point_groups.clear()
    else:plot.point_groups=[g for g in plot.point_groups if g[2] not in names]
    return plot


def show(plot):return plot.figure


def ena_plotter(ena_set,group_column,groups,*,points=True,mean=True,network=True):
    from .rena import group_points,group_network
    plots={}
    for count,label in enumerate(groups):
        p=ena_plot(ena_set,str(label));color=('#2166ac','#d6604d')[count%2]
        if network:add_network(p,group_network(ena_set,group_column,label),colors=(color,color))
        if points:add_points(p,group_points(ena_set,group_column,label),colors=color)
        if mean:add_group(p,group_points(ena_set,group_column,label),colors=color)
        plots[label]=p
    return plots


def with_trajectory(ena_set,*,frame=1100,transition=1000,easing='circle-in-out'):
    """Return a Plotly animation; does not launch a browser."""
    import plotly.graph_objects as go
    d=ena_set.enadata
    if d.trajectory_steps is None:raise ValueError("A trajectory model is required.")
    groups={}
    for i,key in enumerate(d.unit_keys):groups.setdefault(key,[]).append(i)
    maximum=max(map(len,groups.values()));frames=[]
    for step in range(maximum):
        traces=[]
        for key,ids in groups.items():
            xy=ena_set.points[ids[:step+1],:2]
            traces.append(go.Scatter(x=xy[:,0],y=xy[:,1],mode='lines+markers',name='::'.join(map(str,key))))
        frames.append(go.Frame(data=traces,name=str(step)))
    fig=go.Figure(data=frames[0].data,frames=frames)
    fig.update_layout(updatemenus=[dict(type='buttons',buttons=[dict(label='Play',method='animate',args=[None,dict(frame=dict(duration=frame,redraw=True),transition=dict(duration=transition,easing=easing))])])],
                      sliders=[dict(steps=[dict(label=f.name,method='animate',args=[[f.name],dict(mode='immediate',frame=dict(duration=0,redraw=True))]) for f in frames])])
    xy=ena_set.points[:,:2];margin=np.maximum(np.ptp(xy,axis=0)*.1,.01)
    fig.update_xaxes(range=[float(xy[:,0].min()-margin[0]),float(xy[:,0].max()+margin[0])])
    fig.update_yaxes(range=[float(xy[:,1].min()-margin[1]),float(xy[:,1].max()+margin[1])],scaleanchor='x',scaleratio=1)
    return fig


def move_nodes_to_unit_circle(ena_set,*,dimensions=(0,1),equal_space=False):
    from .pipeline import network_centroids
    result=copy.deepcopy(ena_set);coords=result.node_positions[:,dimensions].copy();r=np.linalg.norm(coords,axis=1);ids=np.flatnonzero(r>0)
    if not len(ids):return result
    radius=r.max()
    if equal_space:
        upper=sorted((i for i in ids if coords[i,1]>=0),key=lambda i:-coords[i,0])
        lower=sorted((i for i in ids if coords[i,1]<0),key=lambda i:coords[i,0]);order=upper+lower
        anchor=int(np.flatnonzero(r==radius)[0]);start=order.index(anchor);base=np.arctan2(coords[anchor,1],coords[anchor,0])
        for offset in range(len(order)):
            idx=order[(start+offset)%len(order)];angle=base+offset*2*np.pi/len(order);coords[idx]=radius*np.array([np.cos(angle),np.sin(angle)])
    else:coords[ids]*=(radius/r[ids])[:,None]
    result.node_positions[:,dimensions]=coords
    result.centroids=network_centroids(result.line_weights,result.node_positions,result.enadata)
    if result.rotation_set is not None:result.rotation_set.node_positions=result.node_positions.copy()
    return result


def move_nodes_to_unit_circle_with_equal_space(ena_set,**kwargs):return move_nodes_to_unit_circle(ena_set,equal_space=True,**kwargs)


def plot_ordered_network_3d(ena_set,network,*,title=None,colors=('#2166ac','#d6604d'),point_groups=()):
    """Native Plotly arrows for a directed model; no R plotting backend."""
    import plotly.graph_objects as go
    coords=np.asarray(ena_set.node_positions,float)
    if not ena_set.enadata.ordered or coords.shape[1]<3:raise ValueError("A directed model with at least three dimensions is required.")
    v=np.asarray(network,float)
    if v.shape!=(len(ena_set.edge_labels),):raise ValueError("Network edge count mismatch.")
    fig=go.Figure();span=max(float(np.ptp(coords[:,:3],axis=0).max()),1.)
    for weight,label in zip(v,ena_set.edge_labels):
        if weight==0:continue
        a,b=label.split('->');start=coords[ena_set.enadata.codes.index(a),:3];end=coords[ena_set.enadata.codes.index(b),:3]
        color=colors[0] if weight>0 else colors[1]
        if a==b:
            t=np.linspace(0,2*np.pi,30);xy=start[None,:]+np.column_stack([np.cos(t),np.sin(t),np.zeros(len(t))])*.04*span
        else:xy=np.array([start,end])
        fig.add_trace(go.Scatter3d(x=xy[:,0],y=xy[:,1],z=xy[:,2],mode='lines',line=dict(color=color,width=max(1,8*abs(weight))),showlegend=False,name=label))
        direction=end-start;length=np.linalg.norm(direction)
        if length:
            tip=start+.82*direction;unit=direction/length
            fig.add_trace(go.Cone(x=[tip[0]],y=[tip[1]],z=[tip[2]],u=[unit[0]],v=[unit[1]],w=[unit[2]],
                sizemode='absolute',sizeref=.04*span,colorscale=[[0,color],[1,color]],showscale=False,showlegend=False))
    fig.add_trace(go.Scatter3d(x=coords[:,0],y=coords[:,1],z=coords[:,2],text=ena_set.enadata.codes,mode='markers+text',marker=dict(color='#222',size=5),name='Codes'))
    for group in point_groups:
        points=np.asarray(group['points'],float)
        fig.add_trace(go.Scatter3d(x=points[:,0],y=points[:,1],z=points[:,2],mode='markers',
            marker=dict(color=group.get('color','#2166ac'),size=4),name=group.get('label',group.get('name','Points'))))
    fig.update_layout(title=title,scene=dict(aspectmode='data'))
    return fig