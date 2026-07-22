# MITDP Markdown → SharePoint pipeline

Converts Markdown into HTML styled with the **Maryland Web Design System
(MDWDS)**, publishes it to **GitHub Pages**, and embeds it in a **classic
SharePoint** page via an auto-resizing iframe. Content changes are made in
Markdown; a push rebuilds and republishes with no copy-paste.

```
content/*.md ──► build.js ──► docs/*.html ──► GitHub Pages ──► <iframe> in SharePoint
   (edit)        (convert +      (served)        (hosts)         (auto-height)
                class-inject)
```

## Tier 1 — one-time setup

1. **Create the repo** and push these files. In repo **Settings → Pages**, set
   the source to **GitHub Actions**.
2. **Set your origins.** In `build.js`, set `CONFIG.parentOrigin` to your
   SharePoint host (e.g. `https://doit.maryland.gov`). In
   `sharepoint-snippet.html`, set `GITHUB_PAGES_ORIGIN` to your Pages origin
   (e.g. `https://maryland-gov.github.io`). These two must be correct or the
   height messages are silently dropped.
3. **Add the web part.** On the classic page, add a **Content Editor Web Part**
   (or Script Editor Web Part), edit its HTML source, and paste
   `sharepoint-snippet.html`. Point the iframe `src` at the specific
   `docs/<name>.html` URL on GitHub Pages.

That's it — the MDWDS stylesheet is loaded by the embedded page itself, so
nothing about the SharePoint page's own styling matters.

## Tier 2 — repeatable content updates

1. Edit a file in `content/` (or add a new `*.md`).
2. Commit and push to `main`.
3. The GitHub Action rebuilds `docs/` and redeploys Pages. The SharePoint page
   shows the update automatically — no re-paste. (A brand-new page only needs
   its own web part + iframe `src` added once.)

## What the converter handles

- Wraps everything in `.usa-prose` so MDWDS typography/table styles apply.
- Converts Google-Docs single-cell "callout" tables into real MDWDS components,
  matching digital.maryland.gov:
  - By default a callout becomes a **Summary Box** (`.usa-summary-box`). If it
    opens with a short lead-in phrase ending in a colon (e.g.
    "…ensures that:"), that phrase becomes the box heading and the rest the body.
  - A callout that starts with **`Note:` / `Alert:` / `Important:` / `Warning:` /
    `Success:`** becomes the matching **Alert** (`.usa-alert--info/warning/success`)
    instead — use this for announcing something new.
- Multi-column tables become striped `.usa-table` data tables.
- Preserves `## Heading {#anchor}` IDs and internal `#anchor` links.
- Resolves reference-style/base64 images and drops stray empty headings.

### SDLC interactive timeline pages

A markdown file whose first lines include `Template: sdlc` renders as the
interactive SDLC page (clickable timeline linking to phase details) instead of
a prose page. See `content/sdlc.md` for the working example. The format per
phase:

```markdown
* ### **Phase Name** *(optional)*

  *Timeline:* Short text shown inside the timeline box
  *Milestone:* Label for the chip above the box (omit for none)
  *Weight:* 1.5   ← relative box width (omit for 1)

* One or more detail paragraphs for the phase.

* **Gate: Gate Name**
  Gate description (omit the whole block for the final phase).
```

Colors are assigned automatically by position (yellow → light blue → gray →
blues, matching the prototype). If `*Timeline:*` is omitted, the first sentence
of the detail is used. The parser tolerates the usual Google-Docs export noise
(leading bullets on everything, headings without bold treated as body text).

### Section table of contents

Any heading with a `{.toc}` attribute, followed immediately by a list of
links, is rewritten as a two-column linked navigation block styled to match
digital.maryland.gov (bold heading, horizontal rules, red bullets, blue
underlined links, single-column on mobile).

```markdown
## Sections {.toc}

- [Understanding of User Needs](#understanding-of-user-needs)
- [Core Problems & Definition of Success](#core-problems-&-definition-of-success)
- [Product Strategy](#product-strategy)
```

Any heading level works (`##`, `###`, `####`) — the heading tag is preserved
for correct outline semantics, and the `.toc` class controls the styling. The
heading text isn't hardcoded to "Sections", so you can use "In this document",
"Jump to", etc. Links can point to in-page anchors or full URLs.

### Buttons (call-to-action links)

Add `{.button}` to a Markdown link to render it as a USWDS primary button;
add `.outline` for the outlined secondary variant. Two buttons on adjacent
lines sit inline next to each other.

```markdown
[Go to Launchpad Stage 1](stage-1.html){.button}
[Go to Launchpad Stage 2](stage-2.html){.button .outline}
```

Buttons don't get the external-link icon or the `.usa-link` underline —
they're styled entirely by the USWDS button classes.

### Intro paragraph (lede)

For a slightly larger, more prominent first paragraph — typically the one
immediately below a page title — add `{.intro}` at the end of the paragraph.
It renders as a USWDS `.usa-intro` lede.

```markdown
# Stage 1

Stage 1 of the Launchpad focuses on your understanding of user needs, how you're defining the core problems that your project exists to solve, and the product strategy that you're recommending as an investment to solve those problems. {.intro}

## Overview

The Launchpad is the foundation of our System Development Life Cycle...
```

Any paragraph can carry `{.intro}` — it's not restricted to the first one on
the page — but stylistically it works best on lede text and shouldn't be used
for regular body copy. The attribute goes at the very end of the paragraph,
after the last word.

### Automatic heading cleanup (Google Docs export quirk)

Google Docs sometimes exports styled body text as `## Long paragraph text.`,
which renders as a giant heading. The pipeline detects these — any heading
whose text is longer than 60 characters **and** ends with `.` or `!` — and
demotes them to a paragraph automatically. Question-headings ending with `?`
and short headings are left alone.

If a legitimate heading gets caught by this rule, shorten it or split it into
a heading + intro paragraph.

### Section with image on the right

For a section where the text sits on the left and an image sits on the right,
add `{.image-right}` to the section heading, put the image in that section,
and add the body content normally. The pipeline pulls the image into a right
column and everything else into a left column. The layout collapses to a
single stacked column below ~640px.

```markdown
## What is an MITDP? {.image-right}

![Venn diagram of MITDP criteria](images/mitdp-venn.png)

Established in law since 2002, MITDPs are IT development projects that meet
any one or more of the program criteria.

The most relevant criteria in practice are:

- Is the project a development project?
- Is the project estimated to cost more than $5M?

MITDP funds cannot pay for ongoing operating costs, ...
```

The image can appear anywhere between the heading and the next same-or-higher
heading — the pipeline finds the first one and moves it to the right column.
Images should live in `content/images/` and be referenced as
`images/filename.png`; the build step copies `content/images/` into `docs/`
so the relative path resolves on GitHub Pages.

### Card grid (linked cards with descriptions)

For a set of resource links where each item needs a title and a short
description (like Maryland.gov's service tiles), add `{.card-grid}` to the
section heading and put the items in a two-column table where each cell
contains `[Title](url) description text`. Empty trailing cells are fine.

```markdown
## MITDP Resources {.card-grid}

| [Dashboard](http://mitdp.maryland.gov) Data on the schedules, costs, and progress of all current MITDPs | [Oversight Process](/oversight) Operational processes, including oversight requirements, policies, guidance, and how to become a new MITDP |
| :---- | :---- |
| [SDLC](/sdlc) Our updated SDLC ensures user-centered, iterative service delivery | [Launchpad](#launchpad) The Launchpad supports our SDLC to ensure that projects are clearly defined |
| [Staffing Requirements](/staffing) Effective July 2026, all MITDPs must be staffed with specific leadership roles | |
```

Each cell becomes a card: bold title on the left, `→` on the right, then the
description on the next line. The grid uses `auto-fit, minmax(300px, 1fr)`,
so it flows to more rows on narrow embeds and stacks single-column on mobile.
Bolding the link (e.g. `**[Title](url)**`) works too — Google-Docs-style
exports produce that markup and it's preserved.

### Multi-column section index

For a grouped table of contents with multiple named columns (e.g. "Launchpad
Stage 1" and "Launchpad Stage 2" side by side), mark each column's heading
with `{.toc-column}` and put the two blocks next to each other in the source.
The pipeline auto-groups consecutive `.toc-column` heading + list pairs into
one grid layout, and separates any groups broken up by other content.

```markdown
## Launchpad contents

### Launchpad Stage 1 {.toc-column}

- [Understanding of User Needs](#understanding-of-user-needs)
- [Core Problems & Definition of Success](#core-problems-&-definition-of-success)
- [Product Strategy](#product-strategy)

### Launchpad Stage 2 {.toc-column}

- [Implementation Strategy](https://…)
- [Cost Estimate](https://…)
- [Project Vitals](https://…)
```

Any number of `.toc-column` blocks in a row are supported — the grid uses
`auto-fit, minmax(280px, 1fr)`, so columns flow onto multiple rows on narrow
screens and stack single-column on mobile. Column headings should usually be
one level below the containing section (e.g. `###` under `##`), so document
outline semantics stay clean.

### Google Docs export quirk: lists inside callouts

Google Docs exports callout boxes as single-cell Markdown tables, and standard
Markdown tables **cannot contain block-level constructs like numbered or
bulleted lists**. So a list that appears inside a callout in the source doc
comes out of the export as flowing text — often with the list markers stripped
entirely. The pipeline can't recover a structure that isn't in the source.

**Workaround (edit the markdown after export):** re-add inline markers inside
the callout cell. The converter recognises three conventions:

*Numbered list — `1. … 2. … 3. …`* (must start at 1 and be sequential):

```markdown
| A successful understanding of user needs ensures that: 1. The team is working on the right problems. 2. The team makes good implementation decisions. |
| :---- |
```

*Bulleted list with `•` (bullet character)* — safe to use anywhere in the
cell, prose lead-in is allowed:

```markdown
| Success factors: • Clear ownership • Documented decisions • Regular retrospectives |
| :---- |
```

*Bulleted list with `- ` (hyphen + space)* — the body must **start** with
`- `, so em-dashes and hyphenated compounds in prose ("well-known — or so I
hear —") aren't mistaken for list items:

```markdown
| - First item - Second item - Third item |
| :---- |
```

All list conventions require at least two items to trigger. If none of them
match, the callout renders as plain prose. When in doubt, prefer `•` for
bullets — it's the most permissive and lowest-risk marker.

### Choosing Summary Box vs Alert

The mapping follows Maryland's own guidance: a **Summary Box** surfaces key
information from the page, while an **Alert** flags something new. Because the
Google export can't express that intent, the rule is prefix-driven — add
`Alert:` (or `Note:`, etc.) to the start of a callout cell in the Markdown to
render it as an Alert; leave it unprefixed to get a Summary Box.

## Official Maryland header and footer

Pages are built with the official Maryland site chrome, copied from
mitdp.maryland.gov:

- **Statewide banner** (top) and **statewide footer** (bottom) are Maryland's
  own web components, loaded from the state CDN
  (`cdn.maryland.gov/mdwds/latest/components/…`). They self-render and stay
  current automatically — don't hand-edit them.
- **Site header** — the Maryland logo plus this site's title. Uses the
  `.maryland-header` classes from MDWDS.
- **Site footer** — a dark blue attribution band above the statewide footer.

### Configuring it

All editable text lives in `CONFIG` at the top of `build.js`:

```js
siteChrome: true,                    // set false to build with no chrome
siteName: "Major IT Development Project (MITDP) Oversight",
footer: {
  title: "This content is published by …",
  text:  "For questions about MITDP oversight, …",
  links: [ { text: "MITDP Dashboard", href: "https://mitdp.maryland.gov" } ],
},
```

The markup itself is in `partials/header.html` and `partials/footer.html`.

### Chrome is hidden inside the SharePoint iframe

The SharePoint page that embeds these pages **already has Maryland's header
and footer**. Rendering ours inside the iframe too would show them twice,
nested. So each page detects whether it's framed (`window.parent !== window`)
and, if so, adds `is-embedded` to `<html>`, which hides `.site-chrome` via
CSS.

The practical effect: standalone on GitHub Pages you get the full official
Maryland page; embedded in SharePoint you get just the content, exactly as
before. No configuration needed — it switches automatically.

## URL structure

Pages are published as clean URLs — no `.html` extension. Each Markdown file
`content/<name>.md` becomes `docs/<name>/index.html`, which GitHub Pages
serves at `https://<org>.github.io/<repo>/<name>/`. So `content/launchpad.md`
is live at `/launchpad/` (or `/launchpad` — both work).

### Folder support

Markdown files can live in subfolders. `content/launchpad/stage-1.md` builds
to `docs/launchpad/stage-1/index.html`, served at `/launchpad/stage-1/`. The
output folder tree mirrors the source folder tree.

### Cross-page links (standard Markdown behavior)

Links in Markdown are resolved **relative to the source `.md` file**, the
same way GitHub renders your files and the same way most Markdown editors
preview them. So from `content/launchpad/stage-1.md`:

- `stage-2.md` → the sibling page → published URL `/launchpad/stage-2/`
- `../sdlc.md` → the top-level SDLC page → published URL `/sdlc/`
- `../images/mitdp-venn.png` → the shared image at `content/images/`
- `images/local-image.png` → an image in `content/launchpad/images/`
- `#anchor` → an anchor on the current page (left untouched)

You can write link targets with either `.md` or `.html` — both get
normalized to the clean-URL form. The pipeline computes the correct number
of `../` prefixes automatically based on the current page's folder depth,
so you never have to think about it.

External URLs, `mailto:` and `tel:` links, and pure `#anchor` fragments are
left completely untouched.

### Legacy `.html` URLs

For old URLs ending in `.html` (from an earlier version of the pipeline or
elsewhere), the build ships a small `docs/404.html` that redirects them to
the clean form. So an old SharePoint iframe pointing at `launchpad.html`
still works — it just takes one extra hop through the 404 page.

## Deploying to GitHub Pages

GitHub Pages runs its own Jekyll build by default, which will render your raw
`.md` with a stock theme and **ignore this pipeline**. You must switch Pages to
the GitHub Actions source so the workflow's built output is what gets served.

1. **Add these files to the repo** (see the checklist below) and push to `main`.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment → Source**, select **GitHub Actions**
   (not "Deploy from a branch"). This is the step that stops Jekyll from
   rendering your Markdown directly.
4. Push any change to `main` (or run the workflow manually from the **Actions**
   tab → *Publish to GitHub Pages* → *Run workflow*). The workflow installs
   dependencies, runs `npm run build`, and deploys `docs/` to Pages.
5. Confirm at `https://<org>.github.io/<repo>/<name>.html`. The URL does not
   change between the Jekyll version and this one, so your SharePoint iframe
   `src` stays the same.

If the page still looks unstyled after deploying, it's almost always that the
Pages **Source** is still set to "Deploy from a branch" — recheck step 3.

## Files in this repository

Commit all of these (everything except `node_modules/` and `docs/`, which are
generated). Use this as a completeness check:

```
mitdp-pipeline/
├── build.js                        # converter (required)
├── template.html                   # standalone prose-page template (required)
├── partials/
│   ├── header.html                 # official MD banner + site header (required)
│   └── footer.html                 # site footer + official MD statewide footer (required)
├── sdlc-template.html              # interactive SDLC timeline template (required)
├── package.json                    # dependencies + build script (required)
├── package-lock.json               # exact dep versions for `npm ci` (required)
├── .gitignore                      # ignores node_modules/ and docs/ (required)
├── README.md                       # this file
├── sharepoint-snippet.html         # paste into the classic Web Part (reference)
├── content/
│   ├── images/                     # PNG/JPG/SVG assets, copied to docs/ on build
│   │   └── mitdp-venn.png
│   ├── launchpad.md                # buttons + two-column TOC + data table example
│   ├── mitdp-overview.md           # image-right + card-grid example
│   ├── stage-1.md                  # prose + summary boxes + TOC example
│   └── sdlc.md                     # interactive SDLC example (Template: sdlc)
└── .github/
    └── workflows/
        └── publish.yml             # GitHub Actions deploy (required)
```

Do **not** commit `node_modules/` (reinstalled by `npm ci`) or `docs/`
(regenerated by the build in CI). Both are already in `.gitignore`.

## Local preview

```bash
npm ci
npm run build          # writes docs/*.html
npx serve docs         # or any static server, then open the file
```

## Notes

- **Security:** the parent listener validates `event.origin` and the child posts
  only to `parentOrigin` — not `"*"`. Keep it that way.
- **Accessibility (Section 508):** the iframe needs a real `title` (the snippet
  sets one). Framed content is a separate document for screen readers and is not
  in SharePoint search — link to the source page too if discoverability matters.
- **CSS version** is pinned to `0.47.4` in `build.js` to match what
  digital.maryland.gov serves, so components render identically. Bump it when
  Maryland ships a newer release (check the version in the wordmark URL on
  https://digital.maryland.gov).
