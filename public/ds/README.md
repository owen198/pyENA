IdeaLens — *See how ideas connect.* — is the visual and interaction system for a platform that runs Epistemic Network Analysis on the pyENA library: coded discourse goes in, and accumulated co-occurrences, a projected space, and mean and subtracted networks come out. It is built for researchers and students doing serious analytic work — handling sources, codes, units, conversations, evidence and open questions — and it reads as an academic journal, a research archive and a well-made piece of modern software at once, rooted in NCCU's blue-and-red identity. It should never read as another AI chatbot with a paper-coloured theme: nothing here exists because "modern software usually has it." Every element earns its place by carrying information, hierarchy or a specific interaction.

## Name

The product is **IdeaLens**, one word with two capitals, never "Idea Lens", "Idealens" or "IDEALENS". Its line is **See how ideas connect.**, a full sentence with its full stop, set apart from the name, never fused into one string.

The wordmark is the name in the serif, weight 400, beside the Logo mark: the mark at 24px or larger, `space-2` between them. The line appears where the product introduces itself: the hero statement, the page title and description, the footer and the waitlist. It is set as a statement in the serif, or as one plain sentence of body copy; never in `metadata` caps, and never as a badge label. Where both appear together, the name leads and the line follows on its own line.

The analysis itself keeps its own name. The library that runs it is pyENA, credited by that name wherever the product says what produced a number or a figure, as a researcher cites a method.

## Two registers

The system works in two registers, and the difference between them is deliberate.

The **product register** is everything a researcher works inside — sources, notes, networks, tables, analysis. It is flat, editorial and quiet: paper `surface`, hairline rules, `radius-md` at most, one shadow in the whole system, no illustration. Everything below under Color, Typography, Spacing, Borders and Research vocabulary describes this register, and it is the default.

The **canvas register** is the front of the product: marketing pages, sign-in, onboarding, an empty first-run screen. It sits on a textured colour field or a slowly scrolling plot grid (see Canvas), carries hand-drawn stickers (see Stickers) and composes into a hero (see Hero). It uses the same palette, the same two typefaces and the same tokens — nothing new is introduced for it — and it stops at the door of the working product. A sticker never appears beside a real network; a textured field never sits behind a table of results.

## Principles

**Intellectual, not corporate.** In the product register, compositions come from typographic hierarchy, numbering, citation and source metadata, fine rules and marginal annotation — not gradients, floating cards or stock illustration. If a screen could belong to a generic SaaS dashboard, it is wrong for IdeaLens.

**Editorial, not decorative.** Structure is made of type scale, rules and alignment. Decoration is not added to fill space; an empty margin is a legitimate outcome.

**Distinctive, not merely minimal.** This is not "cream background, ink text, blue button." `display`, `h1` and `h2` in EB Garamond next to `label` and `metadata` in Figtree, tracked wide and uppercase, is the recognizable contrast that carries the brand — lean on it deliberately on every screen.

**Human, not generated.** Copy speaks like a researcher, not a product. Empty states, buttons and errors are written in plain, concrete language — never "Let's get started!" or "Your AI research journey begins here."

## Color

`surface` (#FFFFED) is the canvas everywhere; `surface-soft` (#F7F7F7) sits under it for modals, quote blocks and zebra rows. Set primary copy in `ink` and secondary or metadata copy in `ink-secondary` — never smaller than 14px, since its contrast margin is already close to the floor.

`brand` (#1E3086) carries the system's identity: links, primary buttons, selected states, active navigation, focus rings and the first series in any chart. `brand-dark` is its hover/pressed state; `brand-surface` is the tint behind a selected row or active nav item — never a button fill.

`accent` (#DF3022) is an annotation color, not a second brand color — a researcher's red pen in the margin. Use it for: the small dot beside an open annotation, a "finding" badge, a flagged reference, a tiny emphasis mark. Never a section background, a nav bar, a large surface, or two elements side by side competing for the eye. `accent-surface` is its light tint for a flagged row; put `ink`, not `accent`, on text sitting inside that tint.

`border` (#D9D9C9) draws hairlines and resting control outlines only. It is a low-contrast line by design — it never alone signals a state change; hover, focus, selection and validation always escalate to `brand` or `accent` plus a text or icon change, not color alone.

In the canvas register the same colours become large textured fields: `brand` and `ink` for the deep canvases, `surface`, `brand-surface` and `accent-surface` for the light washes. `accent` is the one colour that never becomes a field — at that size it stops being an annotation colour.

Never introduce a colour outside this list. No purple, no cyan, no gradients of any kind — the canvas texture is a noise tile, not a gradient, and a gradient has no informational reason to exist here.

## Typography

EB Garamond carries ideas; Figtree runs the interface. Never blend them within one line of text, and never introduce a third typeface.

Both ship with the system as variable font files under `fonts/` — Figtree across weights 300–900 and EB Garamond across 400–800, each with its italic — so a consuming surface loads them from here rather than from a font CDN. Both are licensed under the SIL Open Font License; the licences sit beside the files.

Set the largest statement on any screen — a splash line, a cover statement — in `display`, once. Page and research titles are `h1`; section introductions are `h2`; card and sub-section titles are `h3`; pulled quotations and excerpts are `quote`, in italic. Keep serif weight at 400 throughout; the serif should read literary and slightly imperfect, not luxury-branded, so resist bolding it.

Body copy runs in Figtree: `body-lg` for abstracts and lead paragraphs, `body` as the default, `small` for dense lists and helper text. Interface text — navigation, labels, buttons, filters — is `label` (600) or `button` (600). `metadata` (500, tracked at 0.04em, set uppercase in CSS) is reserved for source numbering and citation-style facts: `SOURCE 024`, `AUTHOR / YEAR`, `pp. 42–58`. Uppercase tracking belongs to `metadata` alone — do not stretch it over headings or body copy.

## Spacing & grid

Spacing runs on the `space-1` (4px) through `space-9` (96px) scale; pick the token by relationship, not by eye — `space-2` between a label and its value, `space-4` inside a card, `space-8` for a desktop page margin.

Compose on an editorial grid, not a centered stack. A research page typically carries three zones: a main content column, a narrower source/metadata column, and an annotation margin running down one side for marginal marks and reader notes. Content may begin flush left while metadata sits in its own narrow column beside it — do not force everything to the same center line. Use asymmetry deliberately: a wide reading column paired with a slim rail reads as a designed page, not a template.

## Borders, radius & shadow

Borders are 1px, drawn in `border`, and used sparingly — a hairline under a section, a rule between list rows, the resting edge of an input. Vertical rules are rarer still, reserved for separating a reading column from its annotation margin.

Radius scales with how "designed" an object should feel: `radius-none` for objects that live directly on the page (an index row, a table), `radius-sm` for small controls (tags, checkboses, badges), `radius-md` for everything else — buttons, inputs, cards, source objects. `radius-full` exists only for a genuine pill control such as a toggle; it is not a button shape.

Shadow appears exactly once in this system: `shadow-modal`, for a modal or popover lifted off the page. Cards, buttons and source objects stay flat and are told apart from their surface by a `border` and a fill change, never a drop shadow.

## Iconography & symbols

Functional icons (search, bookmark, link, arrow, close) are simple single-weight line marks — see the Icons component — closer to a library catalog or publishing mark than a rounded consumer icon set. Stroke weight is constant across the set; there is no filled or two-tone variant.

Five brand symbols carry IdeaLens's identity independent of any wordmark, documented in Brand Symbols: a citation mark, a connection mark, an annotation mark, an index bracket, and the small `accent`-colored finding mark. They appear in loading and empty states, section dividers, and page headers — never as decoration with no structural role.

The primary mark (Logo) is a lowercase **i** standing inside a network: an extruded stem — front, top and side faces in `brand`, `brand-surface` and `brand-dark` — with a node where the tittle would be, in `accent`, wired by edges to two more. It is the one place the annotation red appears in the identity itself, and it states the system's whole argument in a single shape: an idea is a node, and what it means is how it connects. Use it wherever the product needs a mark independent of the wordmark — the app icon, the favicon, and the shape the Loading network resolves into.

Grids are the system's other recurring texture, and there are exactly two. The static graph paper (`ml-graph-paper`, `border` lines over `surface-soft`) sits under a network the product is actually drawing — Loading, and any real network view. The live plot grid (`ml-canvas--grid`) belongs to the canvas register only: the same geometry, drawn in the field's own text colour, scrolling right to left under a hero or a sign-in screen. Neither is wallpaper, and the moving one never goes behind real data.

Stickers are the canvas register's illustration set: eight hand-drawn marks in `ink` outline and flat token fills, each one a real IdeaLens object — a network bloom, a node cluster, coded talk, a stanza window, projected points, subtracted networks, coded rows, a finding. They are drawn, not generated: nodes are rotated ellipses rather than true circles, outlines wobble, nothing is symmetrical. They bleed off the edge of a canvas, never float in the middle of one, and they never appear in the product register — a sticker beside a real result would suggest the result is decorative too. The full set and its construction rules live in Stickers.

## Research vocabulary

Numbering is structural, never decorative. Sources are numbered `SOURCE 001`, `SOURCE 002…`; citations follow `Author, Y. (Year)` with venue and page range set in `metadata`.

The analysis has its own vocabulary, and the interface uses the same words the method does: code, unit, conversation, stanza window, accumulation, rotation, projected point, mean network, subtracted network, edge weight, goodness of fit. A group comparison names its two groups rather than calling them A and B wherever the data supplies real labels. Alongside these, the reading-and-notes side of the product uses Source, Note, Question, Theme, Connection, Finding and Annotation. Do not invent object types outside these two vocabularies, and never soften a statistical term into a friendlier one — a researcher reading "strength" where the model computed an edge weight has been misinformed.

## Motion

Motion narrates a research action, never decorates a screen. A connection line draws itself between two related objects; a source's metadata resolves in around it after it appears; an annotation mark fades in beside the passage it marks; search results settle into an ordered index rather than fading in as a block. Standard transitions run 150–300ms; a meaningful transformation (opening a full reading view) may run to 400–500ms. Nothing floats, bounces, or loops at rest, and every animation respects `prefers-reduced-motion` by cutting to its end state.

Two things are allowed to loop, both in service of what they depict. Loading shows a small network's own nodes and edges connecting up, edge by edge, and stops the moment real content replaces it. The canvas register's live plot grid (see Canvas) scrolls right to left at 160px per 12 seconds, the way the grid under a running plot does — and it is barred from sitting behind an actual network or chart, where moving rules would imply the data itself is moving. Reduced motion holds both still: the network already connected, the grid already drawn.

## Accessibility

Every text/background pairing above states its ratio in its token note; do not introduce a new pairing without checking it against the same 4.5:1 floor (3:1 for 24px+ text, icons, borders and focus rings that carry meaning). Color never carries meaning alone: a selected state pairs a `brand` fill or ring with a checkmark or bold weight change; a flagged reference pairs `accent-surface` with a visible icon, not tint alone. Every interactive element defines hover, focus, active and disabled states, and the focus ring is always a solid `brand` outline, never the browser default.

## What this system is not

No purple-blue gradients, glassmorphism, glowing cards, or a 3D object floating with no purpose. No AI sparkles, robot or brain imagery, or a network graphic invented just to look busy — the networks this system draws plot the product's own nodes and edges, the stickers are a documented set of the product's own objects, and the Logo's extruded stem and its three nodes are one deliberate, flat mark, not a 3D scene. No stock illustration, no mascot, no smiling-researcher photography. No pill buttons, no 20px+ corner radii, no cards stacked inside cards, no drop shadow on every surface. No invented metrics or filler statistics, and no statistic stated without the test that produced it. No "Good morning, researcher!", no chatbot bubbles, no onboarding copy that oversells. If an element cannot be traced to a token, a workflow or a piece of real information, it does not belong on the page.
