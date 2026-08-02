# Tax Return Helper

A small private web app for one family's Swiss tax return.

Filing a Swiss tax return means gathering thirty-odd documents — salary certificates,
bank year-end statements, mortgage interest, pillar 3a certificates, childcare invoices —
from a dozen institutions, over several months, in a set that is slightly different every
year. This site keeps that list in one place so nobody has to hold it in their head.

**Status: front-end prototype.** The interface is complete and interactive; there is no
backend yet. Changes are saved to `localStorage` in your browser only.

---

## The two purposes

1. **Manage the document checklist** — what has to be collected for this year's return,
   who is responsible, and where each item stands. *This is what is built.*
2. **Transfer the files to the tax advisor** — an upload area so the advisor can collect
   the actual PDFs. *Planned; see [`docs/implementation-plan.md`](docs/implementation-plan.md).*

## How the checklist works

- **One checklist per tax year.** The app opens on the most recent year — the one being
  worked on. Previous years stay available, exactly as they were collected.
- **A new year starts as a copy of the last one.** The document list barely changes year
  to year, so you start from the previous list rather than a blank page. Items carry over
  as *outstanding*; you can optionally drop last year's *not applicable* rows and choose
  whether to bring the comments across.
- **The list stays editable all year.** Real years throw up documents nobody predicted
  in January.
- **Items are grouped into categories** — Bank accounts, Salary, Mortgage, and so on.
  Categories can be added, renamed and removed.
- **Each item has** a name, an owner, a status and an optional comment.
- **Four statuses:** `outstanding` → `requested` → `received`, plus `not applicable`.
  `requested` exists because most of the delay in a tax return is waiting on a third
  party, and a list that cannot tell "not started" from "asked the pension fund three
  weeks ago" makes you chase the same institution twice.
- **Progress ignores N/A items.** The percentage is measured against relevant documents
  only, so marking something not applicable moves the needle forward instead of dragging
  it down forever.
- **A year can be marked final.** It becomes read-only and settles into the history.
  It can be reopened — tax returns come back with questions.

## Pages

| Path | What it is |
| --- | --- |
| `/` | The checklist for the selected year. Deep-linkable: `/?year=2024` |
| `/history/` | Every year on record, newest first, with its completion |
| `/documents/` | Placeholder for the file transfer area (phase 3) |
| `/about/` | What the site is for, how it works, roadmap, privacy |

## Interface notes

- **Click a row** to open the editor drawer; **click the circle** to toggle received.
- **Click a stat tile** (Outstanding / Requested / Received / N/A) to filter by it.
- **`/`** focuses the search box. **`Esc`** closes the drawer.
- **Print** produces a clean paper/PDF version of the year without site chrome.
- **Export** downloads the year as readable JSON — a backup that is not locked inside
  this application.
- Light and dark themes, following the system by default; the toggle in the header
  overrides it.
- Responsive down to phone width; the drawer becomes a bottom sheet.

## Project layout

```
index.html              Checklist screen
about/index.html        About / documentation page
history/index.html      Previous years
documents/index.html    Phase 3 placeholder
assets/
  css/styles.css        Whole design system: tokens, components, print, responsive
  js/store.js           Data model, seed data, persistence  ← the backend seam
  js/main.js            Shared chrome: theme, icons, escaping, toasts
  js/app.js             Checklist screen logic
  js/history.js         History screen logic
  js/about.js           Reset-demo-data control
  favicon.svg
docs/
  data-model.md         The shape of the data and why
  implementation-plan.md Phased build-out plan
  design-notes.md       Interface and visual decisions
  testing.md            What is checked before a change ships
wrangler.toml           Cloudflare deploy config — do not edit
.assetsignore           Files excluded from the deployed bundle — do not edit
.github/workflows/      CI and deployment — do not edit
```

## Running it

No build step, no dependencies. Any static file server works:

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

Opening `index.html` directly from the filesystem mostly works, but the root-absolute
asset paths (`/assets/...`) need a server, so use one.

## Deployment

Pushed to `main` → deployed to Cloudflare Workers with static assets by the workflow in
`.github/workflows/`. Nothing in this project needs compiling; the repository *is* the
site. `wrangler.toml`, `.assetsignore` and `.github/workflows/` are owned by the
deployment setup and are not modified by feature work.

## Data and privacy

Tax documents are about as sensitive as household data gets. Three rules the build
follows:

1. In this phase, nothing leaves the browser — there is no server to send it to.
2. When the backend lands, the site is private to the household and not indexed.
3. When file upload lands, files are shared with the advisor through expiring links,
   never made public.

The seeded example data is fictional.

## Documentation

- [`docs/data-model.md`](docs/data-model.md) — entities, statuses, invariants, the
  planned API shape
- [`docs/implementation-plan.md`](docs/implementation-plan.md) — what was built in phase 1
  and how phases 2–4 are sequenced
- [`docs/design-notes.md`](docs/design-notes.md) — the interface decisions and why
- [`docs/testing.md`](docs/testing.md) — the manual pass to run before pushing, what is
  worth automating, and the suite phase 2 should add
