# Run: Rscript validation/rena_reference.R DATA.csv OUTPUT_DIRECTORY
suppressPackageStartupMessages(library(rENA))
stopifnot(as.character(packageVersion('rENA')) == '0.3.0')
args <- commandArgs(trailingOnly=TRUE)
stopifnot(length(args) == 3)
DIMS <- as.integer(args[3])
out <- args[2]
dir.create(out, recursive=TRUE, showWarnings=FALSE)
codes <- c('Data','Technical.Constraints','Performance.Parameters','Client.and.Consultant.Requests','Design.Reasoning','Collaboration')
d <- read.csv(args[1], check.names=FALSE)
acc <- ena.accumulate.data(units=d[c('Condition','UserName')], conversation=d[c('Condition','GroupName')],
  metadata=d[c('Condition','GroupName')], codes=d[codes],
  model='EndPoint', window='MovingStanzaWindow', window.size.back=4,
  window.size.forward=0, as.list=FALSE)
a <- acc$metadata$Condition == 'FirstGame'; b <- acc$metadata$Condition == 'SecondGame'
models <- list(
  mean=ena.make.set(acc, dimensions=DIMS, rotation.by=ena.rotate.by.mean,
                   rotation.params=list(a,b), as.list=FALSE),
  svd=ena.make.set(acc, dimensions=DIMS, as.list=FALSE))
vec <- function(x) unname(as.numeric(x))
wt <- function(x,y) {
  z <- t.test(x,y)
  list(t_statistic=vec(z$statistic), p_value=z$p.value, degrees_of_freedom=vec(z$parameter),
       confidence_interval_95=vec(z$conf.int), mean_x=mean(x), mean_y=mean(y),
       sd_x=sd(x),sd_y=sd(y), n_x=length(x),n_y=length(y), standard_error=vec(z$stderr),
       cohens_d=fun_cohens.d(x,y))
}
mw <- function(x,y) {
  z <- suppressWarnings(wilcox.test(x,y))
  list(u_statistic=vec(z$statistic), p_value=z$p.value,
       method=if(grepl('exact',z$method)) 'exact' else 'asymptotic')
}
ps <- function(x) list(n=nrow(x), mean_point=vec(colMeans(x)),median_point=vec(apply(x,2,median)),
  sd=vec(apply(x,2,sd)),iqr=vec(apply(x,2,IQR)),
  confidence_interval_95=lapply(seq_len(ncol(x)),function(i)vec(t.test(x[,i])$conf.int)))
extract <- function(s) {
  pt <- as.matrix(s$points.rotated)[,seq_len(DIMS),drop=FALSE]
  ct <- as.matrix(s$centroids)[,seq_len(DIMS),drop=FALSE]
  st <- rENA:::ena.set(s)
  list(unit_labels=acc$unit.names, code_labels=codes,
    edge_labels=apply(acc$adjacency.matrix,2,paste,collapse='__'),
    raw_accumulated_vectors=unname(as.matrix(acc$adjacency.vectors)),
    line_weights=unname(as.matrix(s$line.weights)),
    points_for_projection=unname(as.matrix(s$points.normed.centered)),
    rotation_matrix=unname(as.matrix(s$rotation.set$rotation)[,seq_len(DIMS),drop=FALSE]),
    unit_coordinates=unname(pt),node_positions=unname(as.matrix(s$node.positions)[,seq_len(DIMS),drop=FALSE]),
    centroids=unname(ct),variance=vec(s$variance[seq_len(DIMS)]),
    eigenvalues=if(is.null(s$rotation.set$eigenvalues))NULL else vec(s$rotation.set$eigenvalues[seq_len(DIMS)]),
    correlations=matrix(as.numeric(unlist(ena.correlations(st, dims=seq_len(DIMS)))),nrow=DIMS),
    correlation_ci=unname(ena_correlation(pt,ct)),
    anova=lapply(seq_len(DIMS),function(i){z<-oneway.test(c(pt[a,i],pt[b,i]) ~ factor(c(rep(1,sum(a)),rep(2,sum(b)))),var.equal=TRUE);list(f_statistic=unname(z$statistic),p_value=z$p.value)}),
    points=list(group_a=ps(pt[a,,drop=FALSE]),group_b=ps(pt[b,,drop=FALSE])),
    group_median=list(points=vec(as.matrix(ena.group(st, by=a, method=median, names="FirstGame")$points)[1,seq_len(DIMS)]),
                      line_weights=vec(as.matrix(ena.group(st, by=a, method=median, names="FirstGame")$line.weights)[1,])),
    welch=lapply(seq_len(DIMS),function(i)wt(pt[a,i],pt[b,i])),
    mann_whitney=lapply(seq_len(DIMS),function(i)mw(pt[a,i],pt[b,i])),
    networks=list(FirstGame=vec(colMeans(s$line.weights[a,,drop=FALSE])),
                  SecondGame=vec(colMeans(s$line.weights[b,,drop=FALSE])),
                  FirstGame_minus_SecondGame=vec(colMeans(s$line.weights[a,,drop=FALSE])-colMeans(s$line.weights[b,,drop=FALSE]))))
}
result <- list(input=list(md5=unname(tools::md5sum(args[1])),dimensions=DIMS),reference=list(rENA=as.character(packageVersion('rENA')), R=R.version.string),
               models=lapply(models,extract))
jsonlite::write_json(result,file.path(out,'rena_reference.json'),pretty=TRUE,auto_unbox=TRUE,
                    digits=NA, na='null',null='null')
# Native plotting calls: no reflections, sign alignment, or replacement renderer.
s <- models$mean
pt <- as.matrix(s$points.rotated)[,seq_len(DIMS),drop=FALSE]
colors <- c('#ff0000','#0000ff')
p <- ena.plot(s,title='rENA — native points and group means')
p <- ena.plot.points(p,pt[a,1:2,drop=FALSE],colors=colors[1],labels=NULL)
p <- ena.plot.points(p,pt[b,1:2,drop=FALSE],colors=colors[2],labels=NULL)
p <- ena.plot.group(p,pt[a,1:2,drop=FALSE],colors=colors[1],labels='FirstGame',confidence.interval='box')
p <- ena.plot.group(p,pt[b,1:2,drop=FALSE],colors=colors[2],labels='SecondGame',confidence.interval='box')
save_plot <- function(p,name) {
  widget <- plotly::plotly_build(p$plot)
  htmlwidgets::saveWidget(widget,file.path(out,paste0(name,'.html')),selfcontained=FALSE)
  writeLines(plotly::plotly_json(widget,jsonedit=FALSE,pretty=TRUE),file.path(out,paste0(name,'_traces.json')))
}
if(DIMS == 2)save_plot(p,'points')
networks <- result$models$mean$networks
for(n in names(networks)) {
  p <- ena.plot(s,title=paste('rENA — native',n))
  p <- ena.plot.network(p,network=networks[[n]],colors=colors)
  if(DIMS == 2)save_plot(p,n)
}
# Archive local implementation bodies so the audit is pinned to the installed version.
ns <- asNamespace('rENA')
con <- file(file.path(out,'rena_summary_sources.txt'),'w')
for(n in c('summary.ena.set','ena.set.creator','ena.correlations','ena_correlation',
           'fun_cohens.d','ena.group','ena.plot.group','ena.svd','ena.rotate.by.mean')) {
  writeLines(c(paste('\nFUNCTION',n),deparse(get(n,ns))),con)
}
close(con)
jsonlite::write_json(sort(getNamespaceExports('rENA')),file.path(out,'rena_exports.json'),pretty=TRUE)
cat('R reference and native plots:',normalizePath(out),'\n')
