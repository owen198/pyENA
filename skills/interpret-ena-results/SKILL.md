---
name: interpret-ena-results
description: Interpret Epistemic Network Analysis outputs in the style used by Shaffer, Collier, and Ruis. Use when Codex needs to explain ENA points, mean networks, subtracted networks, confidence intervals, statistical tests, goodness-of-fit summaries, and JSON outputs such as statistical_summary.json in paper-ready academic prose.
---

# Interpret ENA Results

Interpret ENA outputs using the explanatory logic shown in Shaffer, Collier, and Ruis (2016) and Shaffer and Ruis (2017).

This skill must support the current `pyENA` `statistical_summary.json` structure, including:
- `points`
- `statistics.welch_t_test`
- `statistics.mann_whitney_u`
- `statistics.anova`
- `statistics.chi_square`
- `statistics.goodness_of_fit`
- `axis_interpretation`
- `networks.group_a_mean_network`
- `networks.group_b_mean_network`
- `networks.subtracted_mean_network`
- `networks.subtracted_mean_network_top_edges`
- `model.explained_variance_ratio`

## Core Rule

Explain ENA results in this order:

1. Explain where the groups or units are located in ENA space.
2. Explain whether the groups differ statistically on each ENA dimension.
3. Explain which connections make the groups different.
4. Explain what those stronger or weaker connections mean substantively.
5. If relevant, explain frequency-based and fit-based context without confusing them with point-space tests.
6. If possible, close the interpretive loop by referring back to original qualitative data.

Do not interpret a significant t-test as if it tested a single edge. In Shaffer-style interpretation, these tests evaluate whether groups differ in their projected ENA positions, which summarize overall network structure.

Do not treat chi-square as if it tested ENA point separation. Chi-square in the current `pyENA` JSON is a frequency-based comparison of code presence, not a direct test of network-position differences.

Do not treat goodness of fit as if it measured the size of the group difference. Goodness of fit evaluates how closely the plotted ENA visualization aligns with the underlying model geometry.

When responding, default to paragraph-based interpretation. Do not default to bullet lists unless the user explicitly asks for bullets, a table, or a checklist.

## Workflow

### 1. Read the points first

Use group mean points, medians, and confidence intervals to describe whether groups separate in ENA space.

State:
- which group is on the negative or positive side of a dimension
- whether the confidence intervals overlap substantially
- whether one dimension appears to separate groups more than another

Preferred interpretation:
- separation on Dimension 1 means groups differ in overall network structure along the primary comparison axis
- lack of separation on Dimension 2 means the secondary variation does not distinguish the groups clearly

When `model.explained_variance_ratio` is present, report it briefly as contextual support. Use it to describe how much retained variance is represented by each plotted dimension, but do not treat it as evidence that a group difference is substantively meaningful by itself.

### 2. Read the statistical tests second

Use Welch t-tests, Mann-Whitney U tests, and ANOVA as evidence for whether projected group positions differ.

Report:
- test statistic
- p value
- effect size when available
- means or medians for the two groups

Interpretation rule:
- significant results indicate systematic differences in overall ENA structure
- non-significant results indicate that the dimension does not meaningfully distinguish the groups
- if Welch t-test, Mann-Whitney U, and ANOVA all point in the same direction on a dimension, treat that as converging evidence
- if the parametric and non-parametric tests disagree, note that explicitly and interpret cautiously

### 2a. Read ANOVA as a companion statistic

When `statistics.anova` is present, treat it as a companion summary for dimension-level point comparisons.

Report:
- `f_statistic`
- `p_value`
- group means

Interpretation rule:
- in a two-group comparison, ANOVA should usually align with the t-test because both ask whether groups differ on that ENA dimension
- use ANOVA as supporting evidence, not as the primary substantive interpretation

### 2b. Read chi-square separately from ENA-space tests

When `statistics.chi_square` is present, interpret it as a frequency-based comparison of code occurrence, not as a direct test of ENA point separation.

Report:
- the overall chi-square statistic, degrees of freedom, and p value
- the codes with the clearest group differences in frequency when `per_code` is available

Interpretation rule:
- chi-square addresses whether groups differ in how often codes occur
- Welch t-test, Mann-Whitney U, and ANOVA address whether groups differ in projected ENA structure
- explain these as complementary but distinct sources of evidence

### 3. Read the mean networks third

Use mean networks to describe each group's representative pattern of connections.

Focus on:
- the strongest edges in each group
- whether one group emphasizes technical, collaborative, interpretive, or reasoning-oriented connections more than the other

Do not treat node placement as arbitrary. In ENA, node positions support interpretation of the dimensions and are fixed within the model.

When `axis_interpretation` is present, use it as a heuristic guide to explain what each dimension appears to distinguish. However, do not treat it as a standalone conclusion. Always check that the axis interpretation is consistent with the mean networks and the subtracted network.

### 4. Read the subtracted network fourth

Use the subtracted network to explain what creates the group difference.

Interpretation rule:
- positive edges mean Group A is stronger on that connection
- negative edges mean Group B is stronger on that connection
- larger edge magnitude means a more salient difference

Always interpret a subtracted network together with the original mean networks. A missing edge in a subtraction plot may simply mean the groups are similar on that connection.

### 4a. Read goodness of fit before making strong visual claims

When `statistics.goodness_of_fit` is present, evaluate it before making strong claims about the plotted space.

Report:
- the co-registration correlations for each dimension
- whether Pearson and Spearman values are consistently high
- the provided summary when helpful

Interpretation rule:
- high co-registration correlations indicate that the ENA visualization is closely aligned with the underlying model geometry
- lower or mixed co-registration correlations mean the visualization should be interpreted more cautiously
- goodness of fit is about the fidelity of the visualization to the model, not about whether the groups differ significantly

### 5. Close the interpretive loop

After interpreting points, tests, and networks, return to source text or events when possible.

Use original excerpts, utterances, or coded episodes to show what the stronger connections actually looked like in context.

## Writing Template

Use this structure for paper-ready results writing:

1. ENA space:
   Describe where each group's points are located and whether the groups separate visually.
2. Statistical comparison:
   Report whether the groups differ on Dimension 1 and Dimension 2 using Welch t-test, Mann-Whitney U, and ANOVA where available.
3. Mean and subtracted networks:
   Identify the main connections that are stronger for each group.
4. Frequency and fit context:
   If available, explain chi-square results and goodness of fit without conflating them with ENA-space differences.
5. Substantive interpretation:
   Explain what these stronger connections suggest about the groups' discourse, reasoning, or practice.
6. Qualitative confirmation:
   If data are available, connect the network interpretation back to raw examples.

## JSON-Oriented Use

When reading `statistical_summary.json`, look for these sections:
- `points`
- `statistics.welch_t_test`
- `statistics.mann_whitney_u`
- `statistics.anova`
- `statistics.chi_square`
- `statistics.goodness_of_fit`
- `axis_interpretation`
- `networks.group_a_mean_network`
- `networks.group_b_mean_network`
- `networks.subtracted_mean_network`
- `networks.subtracted_mean_network_top_edges`
- `model`

Interpret them as follows:
- `points`: visual separation, group centers, medians, and confidence intervals
- `statistics.welch_t_test`: parametric evidence for dimension-level group differences, including means, standard deviations, confidence intervals, and Cohen's d
- `statistics.mann_whitney_u`: non-parametric evidence for dimension-level group differences, including medians and approximate effect size `r`
- `statistics.anova`: companion parametric evidence for dimension-level group differences
- `statistics.chi_square`: code-frequency differences that complement, but do not replace, ENA-space interpretation
- `statistics.goodness_of_fit`: whether the plotted ENA visualization is well aligned with the underlying model geometry
- `axis_interpretation`: heuristic description of what each dimension appears to distinguish based on node positions
- `group_a_mean_network` and `group_b_mean_network`: each group's representative structure
- `subtracted_mean_network`: the full edge-by-edge difference between groups
- `subtracted_mean_network_top_edges`: the most salient differences between groups
- `model`: contextual information such as code set, dimensional setup, and explained variance ratios

## Paragraph Requirement

Unless the user explicitly asks for bullets, tables, or a checklist, write the interpretation as connected paragraphs.

Preferred output shape:
- one paragraph on ENA space and point separation
- one paragraph on statistical comparisons across dimensions
- one paragraph on mean networks, subtracted networks, and axis interpretation
- one paragraph on chi-square and goodness-of-fit context when those sections are present
- one paragraph on substantive meaning or qualitative confirmation when data are available

Avoid turning the interpretation into a list of disconnected metric readouts. The response should read like a results section, not like a dashboard dump.

## Style

Write in formal academic prose unless the user asks for bullets.

Prefer statements such as:
- "These results indicate that..."
- "This suggests that..."
- "Taken together, the point distribution and subtracted network indicate..."
- "The chi-square results provide complementary evidence that..."
- "The goodness-of-fit summary suggests that..."

Avoid statements such as:
- "Group A is better"
- "This edge is significant"
- "The chi-square proves the ENA difference"
- "The fit value proves the groups are different"

Instead, describe differences in structure, emphasis, coordination among codes, frequency context, and the fidelity of the visualization.
