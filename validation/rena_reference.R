# Run: Rscript validation/rena_reference.R DATA.csv OUTPUT_DIRECTORY
suppressPackageStartupMessages(library(rENA))
stopifnot(as.character(packageVersion('rENA')) == '0.3.0')
args <- commandArgs(trailingOnly=TRUE)
stopifnot(length(args) == 2)
out <- args[2]
dir.create(out, recursive=TRUE, showWarnings=FALSE)
codes <- c('goal','evidence','strategy','tradeoff','revision')
d <- read.csv(args[1], check.names=FALSE)
acc <- ena.accumulate.data(units=d['team_id'], conversation=d['conversation_id'],
  metadata=d[c('condition','discussion_round')], codes=d[codes],
  model='EndPoint', window='MovingStanzaWindow', window.size.back=4,
  window.size.forward=0, as.list=FALSE)
a <- acc$metadata$condition == 'baseline'; b <- acc$metadata$condition == 'scaffolded'
models <- list(
  mean=ena.make.set(acc, dimensions=2, rotation.by=ena.rotate.by.mean,
                   rotation.params=list(a,b), as.list=FALSE),
  svd=ena.make.set(acc, dimensions=2, as.list=FALSE))
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
  pt <- as.matrix(s$points.rotated)[,1:2,drop=FALSE]
  ct <- as.matrix(s$centroids)[,1:2,drop=FALSE]
  st <- rENA:::ena.set(s)
  list(unit_labels=acc$unit.names, code_labels=codes,
    edge_labels=apply(acc$adjacency.matrix,2,paste,collapse='__'),
    raw_accumulated_vectors=unname(as.matrix(acc$adjacency.vectors)),
    line_weights=unname(as.matrix(s$line.weights)),
    points_for_projection=unname(as.matrix(s$points.normed.centered)),
    rotation_matrix=unname(as.matrix(s$rotation.set$rotation)[,1:2,drop=FALSE]),
    unit_coordinates=unname(pt),node_positions=unname(as.matrix(s$node.positions)[,1:2,drop=FALSE]),
    centroids=unname(ct),variance=vec(s$variance[1:2]),
    eigenvalues=if(is.null(s$rotation.set$eigenvalues))NULL else vec(s$rotation.set$eigenvalues[1:2]),
    correlations=matrix(as.numeric(unlist(ena.correlations(st, dims=1:2))),nrow=2),
    correlation_ci=unname(ena_correlation(pt,ct)),
    points=list(group_a=ps(pt[a,,drop=FALSE]),group_b=ps(pt[b,,drop=FALSE])),
    group_median=list(points=vec(as.matrix(ena.group(st, by=a, method=median, names="baseline")$points)[1,1:2]),
                      line_weights=vec(as.matrix(ena.group(st, by=a, method=median, names="baseline")$line.weights)[1,])),
    welch=lapply(1:2,function(i)wt(pt[a,i],pt[b,i])),
    mann_whitney=lapply(1:2,function(i)mw(pt[a,i],pt[b,i])),
    networks=list(baseline=vec(colMeans(s$line.weights[a,,drop=FALSE])),
                  scaffolded=vec(colMeans(s$line.weights[b,,drop=FALSE])),
                  subtraction=vec(colMeans(s$line.weights[a,,drop=FALSE])-colMeans(s$line.weights[b,,drop=FALSE]))))
}
result <- list(reference=list(rENA=as.character(packageVersion('rENA')), R=R.version.string),
               models=lapply(models,extract))
jsonlite::write_json(result,file.path(out,'rena_reference.json'),pretty=TRUE,auto_unbox=TRUE,
                    digits=NA, na='null',null='null')
# Native plotting calls: no reflections, sign alignment, or replacement renderer.
s <- models$mean
pt <- as.matrix(s$points.rotated)[,1:2,drop=FALSE]
colors <- c('#2166ac','#d6604d')
p <- ena.plot(s,title='rENA — native points and group means')
p <- ena.plot.points(p,pt[a,,drop=FALSE],colors=colors[1],labels=acc$unit.names[a])
p <- ena.plot.points(p,pt[b,,drop=FALSE],colors=colors[2],labels=acc$unit.names[b])
p <- ena.plot.group(p,pt[a,,drop=FALSE],colors=colors[1],labels='baseline',confidence.interval='box')
p <- ena.plot.group(p,pt[b,,drop=FALSE],colors=colors[2],labels='scaffolded',confidence.interval='box')
save_plot <- function(p,name) {
  widget <- plotly::plotly_build(p$plot)
  htmlwidgets::saveWidget(widget,file.path(out,paste0(name,'.html')),selfcontained=FALSE)
  writeLines(plotly::plotly_json(widget,jsonedit=FALSE,pretty=TRUE),file.path(out,paste0(name,'_traces.json')))
}
save_plot(p,'points')
networks <- result$models$mean$networks
for(n in names(networks)) {
  p <- ena.plot(s,title=paste('rENA — native',n))
  p <- ena.plot.network(p,network=networks[[n]],colors=colors)
  save_plot(p,n)
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
