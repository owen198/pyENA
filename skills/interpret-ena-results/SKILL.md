---
name: interpret-ena-results
description: Interpret Epistemic Network Analysis outputs in the style used by Shaffer, Collier, and Ruis. Use when Codex needs to explain ENA points, mean networks, subtracted networks, confidence intervals, and statistical tests from rENA or pyENA outputs, especially for paper-ready results sections, figure interpretation, or JSON summaries such as statistical_summary.json.
---

# Interpret ENA Results

Interpret ENA outputs using the explanatory logic shown in Shaffer, Collier, and Ruis (2016) and Shaffer and Ruis (2017).

## Core Rule

Explain ENA results in this order:

1. Explain where the groups or units are located in ENA space.
2. Explain whether the groups differ statistically on each ENA dimension.
3. Explain which connections make the groups different.
4. Explain what those stronger or weaker connections mean substantively.
5. If possible, close the interpretive loop by referring back to original qualitative data.

Do not interpret a significant t-test as if it tested a single edge. In Shaffer-style interpretation, these tests evaluate whether groups differ in their projected ENA positions, which summarize overall network structure.

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

### 2. Read the statistical tests second

Use Welch t-tests and Mann-Whitney U tests as evidence for whether projected group positions differ.

Report:
- test statistic
- p value
- effect size when available
- means or medians for the two groups

Interpretation rule:
- significant results indicate systematic differences in overall ENA structure
- non-significant results indicate that the dimension does not meaningfully distinguish the groups

### 3. Read the mean networks third

Use mean networks to describe each group's representative pattern of connections.

Focus on:
- the strongest edges in each group
- whether one group emphasizes technical, collaborative, interpretive, or reasoning-oriented connections more than the other

Do not treat node placement as arbitrary. In ENA, node positions support interpretation of the dimensions and are fixed within the model.

### 4. Read the subtracted network fourth

Use the subtracted network to explain what creates the group difference.

Interpretation rule:
- positive edges mean Group A is stronger on that connection
- negative edges mean Group B is stronger on that connection
- larger edge magnitude means a more salient difference

Always interpret a subtracted network together with the original mean networks. A missing edge in a subtraction plot may simply mean the groups are similar on that connection.

### 5. Close the interpretive loop

After interpreting points and networks, return to source text or events when possible.

Use original excerpts, utterances, or coded episodes to show what the stronger connections actually looked like in context.

## Writing Template

Use this structure for paper-ready results writing:

1. ENA space:
   Describe where each group's points are located and whether the groups separate visually.
2. Statistical comparison:
   Report whether the groups differ on Dimension 1 and Dimension 2.
3. Mean and subtracted networks:
   Identify the main connections that are stronger for each group.
4. Substantive interpretation:
   Explain what these stronger connections suggest about the groups' discourse, reasoning, or practice.
5. Qualitative confirmation:
   If data are available, connect the network interpretation back to raw examples.

## JSON-Oriented Use

When reading `statistical_summary.json`, look for these sections:
- `points`
- `statistics`
- `networks.group_a_mean_network`
- `networks.group_b_mean_network`
- `networks.subtracted_mean_network_top_edges`
- `model`

Interpret them as follows:
- `points`: visual separation and confidence intervals
- `statistics`: whether ENA dimensions differ significantly
- `group_a_mean_network` and `group_b_mean_network`: each group's representative structure
- `subtracted_mean_network_top_edges`: the most salient differences between groups
- `model`: contextual information such as code set and dimensional setup

## Style

Write in formal academic prose unless the user asks for bullets.

Prefer statements such as:
- "These results indicate that..."
- "This suggests that..."
- "Taken together, the point distribution and subtracted network indicate..."

Avoid statements such as:
- "Group A is better"
- "This edge is significant"

Instead, describe differences in structure, emphasis, and coordination among codes.
