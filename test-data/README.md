# Test data

Three synthetic coded datasets for trying the platform. They are made up, so you can share
them freely. `scripts/generate-test-data.py` writes them with a fixed seed, so running it
again produces the same files:

```bash
python3 scripts/generate-test-data.py
```

| File | Use it for | Rows | Units | Codes |
| --- | --- | --- | --- | --- |
| `collab_2d.csv` | A clean 2D run | 1,200 | 40 students, 20 per condition | 6 |
| `clinical_sim_3d.csv` | A 3D run with real spread on Z | 1,260 | 72 participants, 24 per level | 8 |
| `edge_cases.csv` | The validation messages | 150 | 13 speakers | 5 |

Each file is built with a known pattern, so you can check that the platform finds it.
Every line of talk is coded from a "motif", a set of codes that tend to occur together.
A unit's mix of motifs shapes its network.

Start the app first:

```bash
npm run dev
```

Open http://localhost:5173.

---

## 1. `collab_2d.csv`: the 2D test

**The story.** Forty students work in teams of four across three activities. Half had
scaffolded prompts and half did not. Scaffolded students connect **Explaining, Evidence
and Evaluating**. Unscaffolded students connect **Planning, Questioning and Off_Task**.

**Columns**

| Column | Role |
| --- | --- |
| `condition` | Group: `Scaffolded` or `Unscaffolded` |
| `team` | Ten teams with nature names (Aurora … Juniper) |
| `student` | Student name, unique across the file |
| `activity` | 1, 2 or 3 |
| `line`, `utterance` | Order within the team, and a placeholder showing the codes |
| `Questioning`, `Explaining`, `Evidence`, `Planning`, `Evaluating`, `Off_Task` | Codes, 0/1 |

### Steps

**01 Source.** Drag `test-data/collab_2d.csv` onto the page, or use **Choose CSV file**.

**02 Preview.** You should see 1,200 rows and 12 columns. The six code columns are profiled
as binary. Continue to configuration.

**03 Configuration.** Set these by hand, or use **Load configuration** and pick
`test-data/collab_2d.config.json`:

| Field | Value |
| --- | --- |
| Codes | `Questioning`, `Explaining`, `Evidence`, `Planning`, `Evaluating`, `Off_Task` |
| Units | `condition`, `student` |
| Conversation | `team`, `activity` |
| Metadata | `team` (optional) |
| Window | Moving stanza window, Lines back **4**, Lines forward **0** |
| Rotation | Singular value decomposition (svd) |
| Dimensions | **2D** |
| Group column | `condition` |
| Compare / With | `Scaffolded` / `Unscaffolded` |

Press **Next** (or **Run analysis**).

### What you should see

- **Network.** The two groups' points sit on opposite sides of the X axis with little
  overlap. In the subtracted network, the Scaffolded colour runs through
  Explaining–Evidence–Evaluating and the Unscaffolded colour through
  Planning–Questioning–Off_Task.
- **Statistics.** Dimension 1 differs strongly: the Welch t-test gives p < .001 and
  Cohen's d is about 3.7. n = 20 per group. The Mann-Whitney test states that it ran the
  exact method, because each group has 300 points or fewer.
- **Model.** Goodness of fit (co-registration) is about 0.99 on both dimensions. The
  first dimension explains about 76% of the variance.

The effect is built to be large, so a wrong result is easy to spot.

### Things to try on this file

- **Means rotation.** Switch Rotation to **Means rotation (mean)**. The results turn stale
  and ask for a re-run. After the re-run, X runs exactly through the two group means.
- **3D.** Pick **3D** and re-run. The Network tab adds the four interactive 3D networks.
  This file has no designed third pattern, so dimension 3 is mostly noise; use the next
  file to see a meaningful Z.
- **Whole conversation.** Change Window to **Whole conversation**. The networks get
  denser because every line in a team's activity now connects to every other.
- **Individual comparison.** Pick one student from each group (for example
  `Scaffolded::an` and `Unscaffolded::alex`) for the individual networks.
- **Figures.** Change the colours, confidence intervals and node labels. The figures
  redraw straight away without a re-run.

---

## 2. `clinical_sim_3d.csv`: the 3D test

**The story.** Nursing teams at three experience levels debrief two simulation scenarios,
Sepsis and Cardiac. Three patterns are built in:

1. **Experience** (the group difference). Experts connect **Assessment, Diagnosis and
   Treatment**. Novices connect **Vital_Signs, Escalation and Team_Communication**.
   Intermediates sit between the two.
2. **Individual style**, independent of experience. Each participant leans towards one
   or more of *safety* (Medication_Safety, Treatment, Patient_Education), *handoff*
   (Team_Communication, Patient_Education, Escalation) or *monitoring* (Vital_Signs,
   Assessment, Medication_Safety).

Because the styles vary independently of the groups, dimensions 2 **and 3** both carry
real variance. The points spread visibly along Z instead of lying in a flat sheet.

**Columns**

| Column | Role |
| --- | --- |
| `participant` | P001 … P072 |
| `experience` | Group: `Novice`, `Intermediate` or `Expert` (three values, so you choose two) |
| `team` | N1–N6, I1–I6, E1–E6. Every team has one experience level |
| `scenario` | `Sepsis` or `Cardiac` |
| `shift` | `Day` or `Night` (metadata only) |
| `turn`, `timestamp` | Order within the scenario |
| `Assessment`, `Vital_Signs`, `Diagnosis`, `Treatment`, `Medication_Safety`, `Team_Communication`, `Escalation`, `Patient_Education` | Codes, 0/1 |

### Steps

**01 Source.** Load `test-data/clinical_sim_3d.csv`. If results from the first file are
still on screen, the platform asks before replacing them.

**02 Preview.** You should see 1,260 rows and 15 columns, with eight binary code columns.

**03 Configuration.** Set these by hand, or use **Load configuration** with
`test-data/clinical_sim_3d.config.json`:

| Field | Value |
| --- | --- |
| Codes | all eight code columns |
| Units | `experience`, `participant` |
| Conversation | `team`, `scenario` |
| Metadata | `team`, `shift` (optional) |
| Window | Moving stanza window, Lines back **3**, Lines forward **0** |
| Rotation | **Means rotation (mean)** |
| Dimensions | **3D** |
| Group column | `experience` |
| Compare / With | `Novice` / `Expert` |

Press **Next**. The first 3D run downloads plotly (about 5 MB) once, so it takes longer.

### What you should see

- **Network, 3D figures.** Four interactive 3D networks. Drag to rotate, scroll or pinch
  to zoom, right-drag to pan. Novice and Expert points split along X. Rotate the view and
  both groups spread along Z as well as Y.
- **Statistics.** Dimension 1 differs strongly (Welch p < .001, Cohen's d about 3.5,
  n = 24 per group). The group tests cover dimensions 1 and 2 only, as pyENA reports them.
- **Model.** Goodness of fit, eigenvalues and axes include dimension 3. With means
  rotation, dimensions 2 and 3 have similar variance (about 49% and 43% of the
  three-dimensional total). That means Z is not an empty axis.

### Things to try on this file

- **A closer comparison.** Change With to `Intermediate`. The gap on dimension 1 shrinks
  (Cohen's d falls from about 3.5 to about 2.2), which is how it was designed.
- **svd rotation.** Switch to svd. Dimension 1 still follows experience, because that is
  the largest source of variance.
- **Back to 2D.** Pick 2D and re-run. The 3D figures disappear, and Model drops
  dimension 3.

---

## 3. `edge_cases.csv`: the validation test

This file is meant to trip the checks. It is semicolon-delimited. Its codes are spelled
`1`, `1.0`, `yes`, `TRUE`, `y`, `0`, `0.0`, `no`, `FALSE` or empty, and some cells hold
`NA`. Groups are in `arm`: `Control` (6 speakers), `Treatment` (6) and `Pilot` (1).

| Try this | Expected |
| --- | --- |
| Load the file | The delimiter is detected as semicolon. All five code columns are profiled as binary despite the mixed spellings |
| Look at Codes | `score` (0–5) is hidden until you press **Show all columns** |
| Codes: all five. Units: `arm`, `speaker`. Conversation: `group_id`. Group column: `arm`. Compare `Control` with `Pilot` | Two errors: "Pilot has 1 unit. A comparison needs at least 2 per group." and "Never_Coded never occurs in Control or Pilot…". **Next** stays disabled and says what is missing when you hover it |
| Change With to `Treatment` | The Pilot error goes; the Never_Coded error stays |
| Remove `Never_Coded` from Codes | The checklist clears and the run succeeds (13 units, Lines back 2 works well) |
| Pick the same group twice | "Choose two different groups to compare." |
| Choose Means rotation before naming groups | "Means rotation needs two named groups." |
| Set both group colours to the same token | "The two groups need different colours." |
| Load `collab_2d.config.json` on this file | A notice lists the columns this file does not have, and they are left out |

---

## Checked

- All three files were run through native pyENA (`~/code/pyENA`, the library the
  platform vendors) with svd and mean rotation in 2 and 3 dimensions. Every
  combination completes. The numbers above come from those runs; the platform's
  Pyodide build should agree to floating-point precision.
- The platform's own parser profiles the files as described above, and its validation
  returns the two edge-case messages word for word.
- `edge_cases.csv` with `Never_Coded` also fails inside pyENA (the node-position fit
  cannot use a code that never occurs). The platform catches this before the run.
