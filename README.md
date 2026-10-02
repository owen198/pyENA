# IdeaLens (demo)

*See how ideas connect.*

IdeaLens is a demonstration of Epistemic Network Analysis in the browser. The
analysis is Owen's [pyENA](https://github.com/owen198/pyENA) library itself, run
on Pyodide inside a Web Worker, and the figures come from pyENA's own matplotlib
code. A small server keeps accounts and saved analyses in MongoDB.

The product is named IdeaLens; the library that runs every analysis keeps its
own name, pyENA, and the platform credits it wherever it says what produced a
number or a figure (the design system's Name section).

Built from `pyENA-platform-build-plan.txt`, the second requirements
(`Requirements - the second version.txt`), the IdeaLens rename and landing brief
(2 Oct 2026) and the IdeaLens design system (`~/Downloads/IdeaLens-design-system`,
copied into `public/ds` by `npm run sync:ds`). Its mark is a lowercase i whose
tittle is the accent node, wired to two more (`Logo` in `src/ui/marks.tsx`, drawn
from the Logo preview; the favicon is its 16px version).

## Run it locally

Needs Node 22.18 or later.

```bash
npm install
npm run dev
```

Open http://localhost:5173. `npm run dev` also starts the API and, with no
`MONGODB_URI` set, a local MongoDB whose data stays in `.data/mongo` (git ignores
it) between restarts. The first start downloads a MongoDB binary; the first
analysis downloads the Python runtime and numpy, scipy and matplotlib from the
jsdelivr CDN. Both are cached afterwards.

```bash
npm test          # parser, schema, interpretation, validation and API tests
npm run typecheck
```

The API tests start a throwaway MongoDB in `.data/mongo-test` and delete it
afterwards; they never touch `.data/mongo` or a `MONGODB_URI`.

## Settings

Everything is set through the environment; nothing secret is kept in the
repository. `.env.example` lists the names. Copy it to `.env` (git ignores it) or
set the variables on the server.

| Variable | What |
| --- | --- |
| `MONGODB_URI` | The MongoDB connection string. Required in production; unset in development means the local database. |
| `MONGODB_DB` | Database name, `pyena` by default. |
| `PORT` | Port for `npm start`, 8787 by default. |
| `COOKIE_SECURE` | `true` on an HTTPS deployment, so the session cookie is sent over HTTPS only. |
| `SESSION_DAYS` | How long a sign-in lasts, 14 days by default. |
| `ALLOW_SIGNUP` | `false` to close sign-up to new accounts. |
| `ANTHROPIC_API_KEY` | Turns on the AI: questions in the Interpretation panel and **Write with Claude** in the Report tab. Unset, only the built-in interpretation is offered. |
| `ANTHROPIC_MODEL` | The Claude model, `claude-opus-5-5` by default. |
| `OPENAI_API_KEY` | Used instead of Claude when `ANTHROPIC_API_KEY` is unset: the same instructions, sent to OpenAI (`server/openai.ts`). |
| `OPENAI_MODEL` | The OpenAI model, `gpt-5` by default. |

## Deploy

The platform is one Node server: the built site and the API on one port. It
needs a MongoDB, given as `MONGODB_URI`. Production never starts a local
database, and refuses to run without one. Every setting comes from the
environment (the table above); nothing secret is in the repository or the
image.

**Any host that runs Docker** (Render, Railway, Fly.io, a VM):

```bash
docker build -t pyena-platform .
docker run -p 8787:8787 -e MONGODB_URI="mongodb+srv://…" -e COOKIE_SECURE=true pyena-platform
```

**One machine with its own database** (a booth laptop, a lab server):

```bash
docker compose up -d
```

This starts the platform and MongoDB together (`docker-compose.yml`). The
database is reachable only by the platform and keeps its data in a volume.
Open `http://<machine>:8787`.

**Without Docker** (Node 22.18 or later):

```bash
npm ci
npm run build
MONGODB_URI="mongodb+srv://…" COOKIE_SECURE=true npm start
```

On the host:

- **HTTPS.** Serve it over HTTPS (most hosts provide it) and set
  `COOKIE_SECURE=true`; the server warns at start when it is not set.
- **Health check.** Point the host's health check at `/api/health`, which
  answers `{"ok":true}` when the server and the database are up. The Docker
  image checks it itself.
- **Port.** The server listens on `PORT` (8787 by default); hosts that set
  `PORT` themselves are followed.
- **Sign-up.** `ALLOW_SIGNUP=false` closes it once the accounts you need exist.
- **Claude.** `ANTHROPIC_API_KEY` is optional. Without it, the built-in
  interpretation is the one offered.

What the server does for you:
- It compresses responses (the tour's figure data goes from 579 KB to 107 KB).
- It caches the hashed bundles for a year and the page itself never, so a new
  release reaches everyone at once.
- It sends `nosniff`, `SAMEORIGIN` framing, a referrer policy and, with
  `COOKIE_SECURE`, HSTS.
- Browsers still download Pyodide and plotly.js from the jsdelivr CDN, so
  visitors need internet access.

Passwords are stored as scrypt hashes. The session is an httpOnly, SameSite=Lax
cookie whose token is stored only as a SHA-256 hash. The API accepts changes
only as JSON from the site's own scripts.

Checked on 30 Sep 2026: `npm run build`, then `npm start` against a separate
MongoDB. The health check, deep links, the tour page, compression, cache and
security headers all answered as above. In a browser, the landing tour ran and
an account was created. Gender ENA case 2 ran on the engine, drew all 12
figures, saved, and appeared in History with its finding. The Docker files
were not built here (no Docker on this machine).

## What is here

**Landing page** (`/`). One idea, *See how ideas connect.*, shown rather than
listed:

1. **Hero.** The line as the one statement, one sentence,
   and the waitlist (an address and **Join the waitlist**).
2. **How it works** (`#showcase`). One real network, carried by the scroll
   through six chapters: **01 Ideas** (RS.data's six codes, each on its own),
   **02 Connect** (connections draw in, by weight), **03 Understand** (the codes
   move to pyENA's 2D node positions, on graph paper), **04 See more** (the same
   camera turns and the nodes rise to their places on dimension 3; their flat
   positions stay marked on the plane, and the pair depth separates most is
   pointed out), **05 Interpret** (beside two single connections, a margin note
   shows "Generating interpretation…" and then writes itself, with a leader line
   to the connection) and **06 Explore** (the history the analysis is kept in,
   and the way on). The drawing is a function of the scroll position, so
   scrolling back plays it backwards; under reduced motion each chapter shows
   its finished state. With depth, a mouse drag or the arrow keys turn it; a
   finger always scrolls the page.
3. **Your research** (`#research`). How research enters the product, played by
   the scroll, the way the showcase is, but the reverse layout: the demo on the
   left, the title and one sentence on the right (demo first on a phone). One
   mock of the workspace's upload step changes state as the page scrolls: the
   empty upload area, a pointer opening the file picker and choosing
   `student_experience_research.csv`, the file as Source 001, **Upload** with its
   progress, then Saved and "Ready to analyze" with the first rows. The file is
   the tutorial's example dataset, so its size, rows and columns are real.
   Nothing on it can be pressed; under reduced motion it shows each stage
   finished.
4. **History.** Signed in, your own recent analyses; otherwise the pyENA
   examples, each one click from opening as an analysis.
   It arrives each time it scrolls into view, from either direction: the
   heading rises, then the analyses glide in from the right and settle into
   the list in turn, from below and top row first when scrolling down, from
   above and bottom row first when scrolling up. Once it has left the screen it
   resets for the next visit (shown at rest under reduced motion).
5. **Waitlist** (`#waitlist`). The same list as the hero's, beside the team
   connecting to "you"; joining in one place shows as joined in both.
6. **Footer.** The line, the sections, **Privacy Policy** and **Terms of
   Service**.

The interpretations on the landing page are a demonstration, written ahead of
time from RS.data's model numbers (edge weights, node distances) and the
dataset's own lines; nothing on the page calls an interpretation API.

Every number on the page is pyENA's own. `scripts/build-landing-demo.py` runs
native pyENA (the vendored archive) on RS.data with `example.py`'s configuration
and writes `src/content/demo-rs.json`; `scripts/build-landing-depth.py` runs the
same model with `dimensions=3`, refuses to write unless its dimensions 1 and 2
are the 2D model's own (they agree exactly), and writes only each node's and
unit's position on dimension 3 (`src/content/demo-depth.json`). The 2D and 3D
views are therefore one model. `src/content/demo.test.ts` and `depth.test.ts`
hold both files to pyENA's summary and to the dataset. To regenerate them (needs
numpy and scipy, and matplotlib and fontTools for the tour's figures):

```bash
python3 scripts/build-landing-demo.py
python3 scripts/build-landing-depth.py
python3 scripts/build-tour-figures.py
```

The drawing is a real network, so it is drawn as the product draws: on graph
paper in its own coordinates, with the grid and every node projected through one
camera, and no sticker or moving grid beside it.

The previous landing sections (the framed platform tour, the eleven-step
walk-through, the start panel and the product-news box) are no longer on the
page. Their files (`PlatformTour.tsx`, `Story.tsx`, `StartCta.tsx`,
`StayConnected.tsx`, and `/tour`) are still in the repository, unused by the
landing page, until they are confirmed for removal.

The floating navigation shrinks once the page scrolls and underlines the section
in view; on a phone the sections fold into **Menu**.

**Waitlist.** An email address and **Join the waitlist**, with the words the
visitor agrees to beside the button. The server keeps the address, those words
and when, in the `updates` collection with `source: "waitlist"`
(`POST /api/updates`); **Leave the list** marks it withdrawn. Nothing is emailed
from the platform: the team exports the list.

**First-time tutorial** (`src/tutorial/`). A hands-on tour of the real workspace,
not a set of cards. A new account starts it (the account's `settings.tutorial`
is `not_started`); accounts made earlier never start it on their own. It opens
an example analysis, "Student experiences of online learning", and walks
through ten steps, each with a spotlight on the actual control and a panel
beside it that names the control in bold, the step number and progress dots,
and **Skip tutorial**. Where the step needs a click, a mouse pointer (the landing
page's own arrow) glides in from the panel and taps the exact place to click,
with a brand dot under its tip and a ring going out from it, until the step is
done; on a small control it rests low and to the right so the label stays
readable. In 3D it stands on the strongest connection, found through the scene's
camera, and follows it as the network is turned. Steps that only ask the
researcher to look have no pointer; under reduced motion it stands still.

1. **Upload**: **Use example dataset** loads the example through the same path
   as a chosen file, coding schema included.
2. **Check your research data**: the real data table.
3. **Generate your analysis**: the example's settings are applied (again after a
   reload, if need be) and the researcher presses **Run analysis**; the step
   waits for the real run.
4. **See how ideas connect**: the subtracted network figure.
5. **Ask about your results**: the **Interpretation** button opens the panel.
6. **Pick what to understand**: the first of the biggest differences.
7. **Ask a question**: **Why are these connected?**, answered with an example.
8. **Check the evidence**: the answer's first [E#] reference opens its line of
   data (named as the answer numbers it).
9. **Look deeper**: **Run in 3D** (waits for the 3D networks), then **Ask from
   the results**: click another line in 3D (the Ask buttons count too).
10. **Your conversations**: **All** back to the panel's home, where the
    conversations are kept, then the **Report** tab.

When the panel was closed (a reload, say) part-way through a step, the step says
how to get the conversation back and points at the way: the Interpretation
button, or the conversation on the panel's home.

It ends with "You've completed your first IdeaLens analysis." and **Start
exploring**, which leaves the researcher in that analysis.

The tutorial never takes the researcher's own choice away. Started from an
analysis that already holds data (an example opened from the landing page, a
file of their own), its start card says so: the tutorial runs in a separate
example analysis, the researcher's stays as it is, and the last card offers
**Back to** that analysis (or **Stay in the example**); skipping part-way also
goes back. Started from an empty analysis, the tutorial uses that one instead of
leaving an empty draft in the history. Data still loading or still arriving from
the landing page never counts as empty. The account records
`in_progress`, `completed` or `skipped` (`PUT /api/me/tutorial`), so a finished
or skipped tutorial does not start again; this browser remembers the step, so a
reload carries on. Leaving the example analysis pauses it with a way back.
**Take the tutorial** in the account menu starts it again from the beginning.
The dimming never takes a click, so the whole workspace stays usable. The
tutorial's panel never sits on the connection analysis: for a control inside the
analysis it waits just left of it and points in, so the answer stays readable;
for anything else it keeps clear of it. A step's control that is scrolled out of
the results column (under the step band, say) is scrolled into view first.

The example dataset is made up for teaching and written by
`scripts/build-tutorial-data.py` (fixed seed; `--check` runs native pyENA on it
in 2D and 3D). It is kept out of the example lists, which show only the pyENA
repository's examples.

**Privacy Policy and Terms of Service** (`/privacy`, `/terms`). Plain-language
pages that state only what the platform does (accounts, saved analyses, the
waitlist, Write with Claude, the CDN, browser storage). The contact address
reads "to be added" until `CONTACT_EMAIL` in `src/content/site.ts` is set.

**Team and Papers** (`/team`, `/papers`). Their own pages, from
`src/content/site.ts`: the team and "Our papers" show as "To be added" until that
file is filled in, and "The method behind pyENA" cites Tan, Swiecki, Ruis and
Shaffer (2024) and the two Shaffer papers pyENA's interpretation guide follows.

**Product news, by consent.** Signed in, the consent goes on the account
(`PUT` / `DELETE /api/me/news`). Until an account has agreed, IdeaLens asks
at every sign-in, in a modal with the same drawing. **Not now** asks again at
the next sign-in, and Settings shows the consent with a way to withdraw it.
Nothing is emailed from the platform: the team exports the list.

**Accounts** (`/login`, `/signup`, `/settings`). Username and password. Settings
holds the theme and a password change.

**History** (`/projects`, **History** in the navigation). Every saved analysis,
newest first: when it was started and last updated, its data and codes, and its
finding, the dimensions on which Welch's t separates the groups. **Open** is on
every row; **Rename**, **Duplicate** and **Delete** (which asks first) are under
Actions. An analysis
keeps its dataset, coding schema, settings, results, figures and
interpretations, and saves itself as you work: the bar above the steps says
**Saving…**, **Saved** or **Not saved** with **Try again**. Reopening one shows it
as it was; if a figure then needs redrawing, the engine repeats the saved run
quietly first.

**The workspace** (`/projects/:id`), in five steps. The light-blue band names
them, with **Previous** and **Next** either side:

1. **Upload data.** The research name, then the data: drag a CSV anywhere onto
   the page or choose one, and
   optionally a coding schema (a CSV of codes and their meanings; a file named
   like `codebook` dropped on the page is read as one). Four examples from the
   pyENA repository sit in the box below. The Gender examples bring their own
   codebooks.
2. **Preview data.** The **Dataset** tab shows the parsed table, with each
   column's meaning from the schema; the **Coding schema** tab lists every code,
   its meaning and whether it is in the dataset. Delimiter and header can be
   changed here.
3. **Variables & settings.** Units, conversation, codes (hover one for its
   meaning), the stanza window, groups, rotation, 2 or 3 dimensions, figure
   colours.
4. **Run analysis.** A summary of exactly what will run, the Python equivalent,
   and **Run analysis**.
5. **View results.** Data, Network, Statistics, Model and Report tabs, and the
   **Interpretation** button.

**Interpretation** (`src/interpret/`, `src/components/interpret/`). One front
door: the **Interpretation** button at the top right of the results, with how
many conversations the analysis holds. It opens a panel docked to the right of
the results, on its home, laid out like an AI chat's start page: **Your
conversations** as a chat list (a speech bubble, the title, the time and the
last answer in two lines; first when there are any), then suggestions. Two looks
keep them apart, each with a matching key beside its heading: what is yours
(conversations here, notes in the Report) sits on the brand tint with a brand
edge; suggestions are dashed outlines on the page with no fill. With notes
kept, the home links to them in the Report. The suggestions: **the biggest differences**
(the connections whose subtracted weight is largest, with their meanings and the
group they are stronger in; **All 15 connections** for the rest) and **the
figures**. At the bottom, **Ask anything about these results…** asks about the
subtracted network and says so. Picking anything opens its conversation; **All**
goes back to the home. A conversation reads like an AI chat: four starter
cards before the first question, questions in bubbles on the right, answers
signed with the IdeaLens mark, and a rounded message box that grows with the
question (Enter sends, Shift+Enter starts a new line). The results carry
visible shortcuts to the same panel: **Ask about this figure** under each 2D
figure, **Ask** beside each edge in the Model tab, and in 3D a line whose hover
label says "Click to ask about this connection". A figure itself is only for
looking: clicking the picture opens nothing. The first time results appear, a
tip under the button says what it is for, once per account
(`interpretation-button`, remembered with `PUT /api/me/notices`). Opening sends
nothing. The step rail folds to a strip of step numbers while
it is open; its left edge drags (or arrow keys) to widen it, and this browser
remembers the width; × or Esc closes it. On a phone it is a sheet at the bottom.
It rings the figure or table row and, in 3D, widens the edge and fades the
others. Its head names the figure or connection (A ↔ B: ENA connections have no
direction), the two groups' weights for an edge, and how many lines bring the
ideas together; **Evidence** and **Counter-evidence** fold open beneath.

- **Evidence**, gathered in the browser for that figure or edge only
  (`evidence.ts`): the group mean weights and difference from pyENA's summary and
  the edge's rank, the codes' meanings from the coding schema, the lines where
  the two codes meet inside the stanza window (counted by group and unit), up to
  twelve numbered excerpts [E1…] balanced across the groups (at most two per
  unit), and counter-evidence from the weaker group. A figure is read through
  the edges it draws most strongly. Nothing else of the dataset is ever sent.
- **The conversation** starts empty, with four quick questions (Why are these
  connected? What evidence supports this? Are there contradictions? What else
  could explain this?) and a box for your own; nothing goes to the AI until you
  ask. The answer streams from `POST /api/interpret/connection`, whose
  instructions are SKILL.md plus analyst rules: cite only the given [E#], keep
  evidence, inference and speculation apart, challenge causal claims, offer
  alternatives, and say "The available evidence isn't sufficient to determine
  this." when it is not. Until text arrives the first answer names its stages;
  follow-ups say "Analysing your question…". [E#] in an answer becomes a chip
  only when that line exists, and opens it with its source row and stanza window.
  Errors say "Unable to analyse this connection right now." with **Try again**.
  Under each answer, **Copy**, **Add to notes**, and on the last one
  **Regenerate**, which asks the last question again.
- **Saved** with the analysis, one conversation per figure or edge (an edge is
  its sorted code pair, so 3D and the Model tab share it); reopening shows it as
  it was, never regenerated, marked "from an earlier run" after a re-run. Opening
  another edge says "Now analysing C ↔ D" and starts its own conversation.
- **Without an API key** the panel still shows the evidence and says questions to
  the AI are not available on this server yet.

The **Report** tab is what the researcher keeps, read full width: **Your notes**
(the answers kept with **Add to notes**, with where each came from, **Open in
Interpretation**, and **Download notes** as Markdown) and the whole-model
interpretation. Conversations are listed in one place only, the panel's home.
The old address `/projects/:id/interpretation` opens the workspace on this tab.
History rows count each analysis's conversations. **Download
everything (ZIP)** adds `interpretation/notes.md`, `interpretation/conversations.md`
and the latest whole-model interpretation (`interpretation/whole_model.txt`).

The first-time tutorial teaches this too, after the network: the Interpretation
button, the biggest difference, **Why are these connected?** (the tutorial
answers with an example written from the evidence and never calls the AI), an
[E#] reference, a 3D line as a shortcut, **All** and the conversations kept
there, and the Report tab. Accounts that finished the earlier tutorial see a
one-time "New: Interpretation" notice (**Show me** runs the tutorial,
**Dismiss**), remembered with `PUT /api/me/notices`.

**Interpretation.** The built-in writer follows pyENA's
`skills/interpret-ena-results/SKILL.md` in its order and by its rules: where the
groups sit, the Welch, Mann–Whitney and ANOVA tests on each dimension, the mean
and subtracted networks with the axis interpretation, chi-square and goodness of
fit kept apart from the point-space tests, then what the connections mean,
closed with lines from the data's text column that carry both codes. It uses
only numbers from `statistical_summary.json`, names codes by their meaning when
there is a schema, and works offline. With `ANTHROPIC_API_KEY` set, **Write with
Claude** sends the summary, the schema and those excerpts (never the dataset) to
Claude with SKILL.md as its instructions. Interpretations can be copied or
downloaded, and are saved with the analysis.

**Light and dark.** Light, Dark or Match my computer, from **Theme** at the top
of every page or in Settings. When the computer's setting differs from IdeaLens's,
on a first visit or when the computer switches, IdeaLens asks before changing,
offering Switch, Keep and Always match my computer. A signed-in choice follows
the account to other computers.

**3D.** **Dimensions** can be 2 or 3; **Run in 3D** re-runs any 2D result in
three dimensions. The Network tab then adds pyENA's four interactive 3D networks
(`plot3d.py`), which you rotate by dragging and pan by right-dragging. On the
page the scroll wheel moves on to the next result, never the model: plotly
cancels every wheel event over its canvas, so the frame stops them first. On a
touch screen a swipe over a model scrolls the page too. **Full screen** opens a
network over the whole window, on the same view, where scrolling or pinching
zooms and a touch screen can rotate; Esc closes it. The first 3D run installs plotly 7.1.0 into the engine
and loads plotly.js 4.1.1 from the jsdelivr CDN.

**Figures on graph paper.** On screen each figure draws its own graph paper in
its own coordinates: pyENA's tick steps as the major lines, finer lines between,
and one step and an equal scale on both axes wherever their spans are comparable.
Every node, point and edge sits on the lines at any size. Downloads keep pyENA's
own look.

## Where things live

| Path | What |
| --- | --- |
| `public/ds/` | The IdeaLens design system, copied verbatim (`npm run sync:ds`). Never edited here: change it at its source and sync. |
| `public/py/pyena-<commit>.zip` | pyENA at one pinned commit (`npm run vendor:pyena [commit]`). |
| `public/samples/` | The example datasets and codebooks, from that same commit. |
| `server/` | The API: accounts (`auth.ts`), analyses (`projects.ts`, datasets and figures in GridFS), Claude interpretation (`interpret.ts`, with SKILL.md vendored beside it), consent to product news (`updates.ts`). |
| `shared/api.ts` | The JSON shapes the server and the browser exchange. |
| `src/engine/bridge.py` | The only Python the platform adds: sequences pyENA's calls, reports each step, maps figure colours onto tokens, draws the on-screen graph paper. |
| `src/engine/engine.worker.ts` | Pyodide in a Web Worker. |
| `src/state/` | The workspace state machine (`store.ts`), autosave (`persist.ts`), the session (`session.ts`). |
| `src/theme/` | Light, dark and the question before switching; the paper tokens figures are drawn with. |
| `src/interpret/` | The built-in interpretation and the excerpt finder, tested against native pyENA summaries. |
| `src/pages/` | Landing (and its parts in `landing/`), Team and Papers (`Site.tsx`), sign-in, history, workspace, settings. |
| `src/content/site.ts` | The team and the papers. |
| `src/content/demo-rs.json` | The landing page's RS.data, written by `scripts/build-landing-demo.py` with native pyENA. |
| `src/content/demo-depth.json`, `depth.ts` | The same model's dimension 3, written by `scripts/build-landing-depth.py`. |
| `src/pages/landing/Showcase.tsx` | The scroll-driven showcase: ideas, connections, 2D, 3D, interpretation, history. |
| `src/pages/landing/Research.tsx`, `Waitlist.tsx` | The research input and the waitlist. |
| `src/pages/Legal.tsx` | The Privacy Policy and Terms of Service. |
| `src/components/Tutorial.tsx`, `src/state/tutorial.ts` | The first-time introduction after sign-up. |
| `public/tour/rs-figures.json` | The platform tour's result and figures, written by `scripts/build-tour-figures.py` with the engine's own bridge. |
| `src/pages/TourFrame.tsx` | The workspace as the tour shows it, at `/tour`. |
| `src/state/handoff.ts` | An example opened from the landing page, carried through sign-in into a new analysis. |
| `test-data/` | Synthetic 2D, 3D and edge-case datasets with a walkthrough (`scripts/generate-test-data.py`). |

## Checked against pyENA

On RS.data with `examples/rs/example.py`'s configuration, the exported
`statistical_summary.json` has the same keys, order and strings as the CLI's.
All 246 numbers agree within 4.4e-14; the only differences are floating-point
last digits between Pyodide's numpy and native numpy. Gender ENA case 2 matches
native pyENA to the last digit.

The Network tab draws the same twelve figures as pyENA's
`generate_analysis_outputs()`, with the same plotting calls and file names
(`firstgame_mean_network`, `firstgame_points_ci`, `individual_firstgame_network`,
`subtracted_individual_network`, …). The individual comparison compares one unit
from each group, as the library's `focus_unit_a` and `focus_unit_b` do. The RS.data
example preselects `example.py`'s units, `FirstGame::steven z` and
`SecondGame::samuel o`.

In line with pyENA's README, the platform:
- shows pyENA's own error message verbatim beneath a plain-language explanation
  ("catch `ValueError` and print the message directly");
- states which Mann-Whitney method ran: exact at 300 points or fewer per group,
  asymptotic above;
- carries the README's notes on interpretation. The point-space tests do not test
  single edges; chi-square is a frequency-based companion analysis; goodness of
  fit describes the visualization, not the group separation; axis poles are
  heuristic.

### End-to-end check (26 Sep 2026)

Each example was driven through the UI: Load, then Apply this configuration,
then Run analysis, then every download button. The downloaded files were
captured in the page and compared with native pyENA at `ed788e0`, run from a
scratch copy of the repository.

| Example | Numbers compared | Largest difference from native pyENA |
| --- | --- | --- |
| RS.data (`example.py --summary-only`) | 246 | 4.4e-14 |
| RS.data in 3D (`ena(dimensions=3)` + `summarize_ena_results`) | 256 | 4.4e-14 |
| Gender ENA case 1 (`case1.py --summary-only`) | 354 | 6.2e-14 |
| Gender ENA case 2 (`case2.py --summary-only`) | 246 | 1.1e-14 |

- The four 3D networks match pyENA's `plot3d` figures trace for trace: same
  traces, names, edge widths and marker sizes, and 582 coordinates within 4.4e-14.
- `edges.csv` matches the summary; the SVG, 300 dpi PNG and interactive HTML
  files are valid.
- The **Python equivalent** each example shows, run with native pyENA, writes a
  `statistical_summary.json` byte-identical to pyENA's own script output. The
  Gender scripts add a `data_context` block of their own, which is not pyENA
  output.
- One expected difference: in Gender case 1, the ANOVA on dimension 2 compares
  two means that both sit at about 1e-17. Native numpy computed F = -2.4e-33
  (so scipy's p-value is NaN); the browser engine computed F = +6.6e-33 (p = 1).
  Both are zero plus rounding. When pyENA writes NaN, the platform keeps it
  verbatim in the exported file and shows "p not defined (NaN)".

### Second version (27–28 Sep 2026)

In a browser, against a throwaway database: an account was created, a new
analysis loaded Gender ENA case 1 (codebook included), applied its
configuration and ran. The interpretation wrote itself, and everything was
saved: result, 12 figures, schema, interpretation. The analysis was then
reopened as saved, a figure colour changed (the engine rebuilt the model and
redrew), duplicated and deleted. Theme choices were exercised in Settings, and
the question when the computer switches. The API tests cover the same ground
without a browser, including that one account can never see or change
another's analyses.

### Landing page and history (28 Sep 2026)

- The landing data matches native pyENA exactly (207 summary numbers, largest
  difference 0), and the tests above hold it to the dataset.
- Scrolling the page moves the drawing through all eleven states in order, each
  as its step reaches the reading line.
- In a browser, against a throwaway database: a research name and RS.data were
  carried from the landing page through sign-up into one new analysis, named as
  typed. The analysis ran in 2D and 3D. A mouse wheel over an inline 3D network
  left its camera unchanged; in full screen the same wheel zoomed it.
- The history row showed the finding ("Welch's t separates the groups on
  dimension 1"). The API tests cover consent: kept only when ticked, withdrawn
  on request.
- Later the same day: a real mouse wheel over an inline 3D network scrolled
  the results on by 500px, and the camera did not move; in full screen the wheel
  zoomed. The consent question appeared at sign-up and again at the next
  sign-in after **Not now**, and stopped once agreed to. The platform tour went
  through all eight steps in the frame.

## Checked against the design system

- The design-system files are linked unedited from `public/ds/`. Every colour,
  space, radius and shadow in `src/styles/` is a token.
- **Two registers.** The workspace, history and settings are the product
  register: flat, no stickers or textured fields. The hero, the Team and Papers
  page heads, the consent box and sign-in are the canvas register: textured
  fields, the live plot grid on the hero, one statement and one button, and
  stickers copied from the Stickers preview (two or three per composition, one
  on a phone). The landing page's walk-through is a real network, so it is drawn
  in the product register, with nothing from the canvas register beside it.
- **Dark theme.** The design system ships no dark theme and allows no new
  colours, so each dark token is a mix of two palette tokens, and every
  pairing was checked against the system's 4.5:1 and 3:1 floors
  (`src/styles/theme.css` lists the ratios). The deep canvases and the figures
  keep the paper theme in both modes.
- Two typefaces only. The Python equivalent and diagnostics are set in Figtree,
  not a monospace ("never introduce a third typeface").
- Serif and sans never share a line: step numbers and metadata sit on their own
  line above or below serif titles.
- Brand symbols are drawn at 24px, the smallest size the system allows.
- Accent appears once per place: the stale bar uses the flagged tag, with its
  reason in ink.
- `metadata` styling is used only for numbering and facts, never for buttons.
- One shadow: modals, menus and the theme question, the popovers the system
  allows it for.

Where the build plan and a README disagreed, the README won.

## Decisions

- **Group colours:** `brand` and `accent`, one colour per group, applied to its
  points, its mean network and its side of the subtracted network. The second
  group also uses triangles for points and a diamond for its mean.
- **Tabs:** Data / Network / Statistics / Model / Interpretation. Fit, axes and
  edges are inside Model.
- **Stat tiles:** neutral, with no finding mark on p < .05. Every tile names its test and n.
- **Model:** EndPoint only.
- **Dimensions:** 2 by default, 3 on request, for the Z axis and 3D networks.
- **Pinning:** pyENA is vendored at `ed788e0`, so nothing is fetched from GitHub
  at runtime. GitHub `main` has moved on since (`6025cf7`). To update, pull the
  library, then run `npm run vendor:pyena <commit>` and re-check the output.
- **Backend:** Express and MongoDB. Datasets and figures live in GridFS, since a
  CSV or a run's figures can outgrow a 16 MB document. The analysis itself still
  runs in the browser.
- **Interpretation:** the built-in writer is always there; Claude is optional.

Where this build differs from the plan:
- Changing figure options (colours, confidence intervals, node labels) redraws
  the figures immediately rather than marking the results stale, because the
  model hasn't changed.
- Rail headings open any step that is unlocked. Locked steps say what is missing.
- A selected code that never occurs in the compared groups is caught before the
  run: pyENA's chi-square test cannot run with it.
- There is no kitchen-sink route; the design system's own `preview.html` fills that role.
- **Deliberate exceptions, at the owner's request:**
  - The step band shows four small Network bloom stickers (48 and 36px, 60%
    opacity), whole and never behind text, where the band has room beside the
    step names; they are hidden on a phone.
    - **Drift:** each flower moves slowly along its own lane, left to right and
      back in a shallow arc, taking 13 to 19 seconds each way.
    - **Bloom:** each one blooms on a slow 12-second cycle. The stem and
      branches draw, the leaves unfold, the edges appear and the node heads
      open; the bloom holds while the heads breathe in and out (3.2 seconds);
      then it folds away and grows again. The flowers are staggered so they are
      never in step.
    - The Stickers README keeps stickers in the canvas register and static at
      rest.
  - The Demo tag glows in and out, and its dot breathes, on the same 3.2-second
    rhythm.
  - The coded-talk bubbles in the Start panel breathe in and out in turn (3.2
    seconds, 1.6 apart).
  - The consent drawing loops: three connections from the team draw themselves
    to "you" in turn (4.8 seconds each, one arriving every 1.6), hold and fade,
    while the nodes bloom on the same 3.2-second breath.
  - Under reduced motion both are still.
- The plan's monospace code block, its metadata-styled "Select all binary"
  button, its number-beside-title rail headings and its two-accent stale bar
  were changed to follow the design-system README.
