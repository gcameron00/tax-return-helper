# Implementation plan

How the site gets from "an elegant mock-up of the checklist" to "the family and the tax
advisor both use it". Phase 1 is done and in this repository; phases 2–4 are the plan.

The sequencing principle: **each phase is independently useful.** Phase 1 is usable by
one person on one device today. Phase 2 makes it usable by the family. Phase 3 brings in
the advisor. Nothing is built on the promise of a later phase arriving.

---

## Phase 1 — Front-end prototype ✅ *built*

**Goal:** the complete interface, working against fake data, so the interaction design
can be judged before any backend decision is locked in.

**Scope**

- Design system in one CSS file — tokens, light/dark, components, responsive, print.
- Checklist screen: year selector, progress summary, categories, document rows.
- Item editing in a drawer: name, category, owner, status, comment.
- Add / rename / delete categories; add / delete items; move an item between categories.
- Filtering: full-text search, owner, and status (via the summary tiles).
- Start a new tax year, carried over from the previous one, with options.
- Mark a year final (read-only) and reopen it.
- History screen listing every year with its completion.
- Export a year as JSON; print/PDF stylesheet.
- Realistic seeded Swiss data across three years, persisted to `localStorage`.
- Documents placeholder page and About page.

**Deliberately not in scope:** anything that cannot be faked in the browser — accounts,
sharing, uploads, notifications.

**Done when** the family can click through the whole flow and say what is wrong with it.
That feedback is worth more than any amount of backend work done in the meantime.

---

## Phase 2 — Backend and shared state

**Goal:** the checklist is the same on every family device.

### 2.1 Storage — pick D1

Cloudflare D1 (SQLite) over KV. The data is relational — years contain categories contain
items — and per-item updates from two phones at once are the normal case. KV's
last-write-wins on a whole JSON document loses one person's ticks; a row update does not.
The volume is trivial either way, so correctness under concurrency is the deciding factor.

Schema follows [`data-model.md`](data-model.md): `people`, `tax_years`, `categories`,
`items`, with `items.updated_at` for conflict detection.

### 2.2 API

The Worker gains a `fetch` handler in front of the static assets. Routes as listed in
[`data-model.md`](data-model.md#planned-api-shape). Two rules to enforce **server-side**,
because the current locks are UI-only and therefore not locks:

- Writes to a year with `status = 'final'` are rejected (`409`).
- `taxYear` is unique (`409` on duplicate creation).

### 2.3 Authentication

The site is for one household, so the cheapest thing that is actually private:
**Cloudflare Access** in front of the whole Worker, with the family's email addresses on
the allow list. No password storage, no session code, no account management, and the
identity arrives in a header if per-person attribution is wanted later.

Fallback if Access is unavailable on the plan: a single shared passphrase exchanged for a
signed, HTTP-only cookie. Weaker, but still not the open internet.

### 2.4 Wiring the front end

`TRH.load()` / `TRH.save()` in `store.js` become `fetch` calls. Because that is the only
code that touches storage, the screens do not change. Work needed:

- Make the render path `async` at the entry points, with a loading state.
- Switch from whole-document writes to per-item `PATCH` on the fields that change.
- Optimistic updates with rollback on failure — the interface must stay instant.
- Keep `localStorage` as an offline cache: the checklist is used at a kitchen table and
  in a bank branch, and a read-only stale view beats a spinner.

**Done when** two family members can tick items on two devices and both see the result.

---

## Phase 3 — File transfer for the tax advisor

**Goal:** the advisor receives the documents without a year of email attachments.

- **Storage:** Cloudflare R2, keyed `{taxYear}/{itemId}/{uuid}-{filename}`.
- **Upload:** attached to a checklist row, not to a separate folder tree — a row is only
  really "received" when the file is there. Direct-to-R2 via a Worker-issued presigned
  URL, so document bytes never pass through the Worker.
- **Guards:** size cap, an allow-list of types (PDF and images, which is what banks
  actually send), and uploads refused for a finalised year.
- **Advisor access:** one expiring link per tax year giving a read-only index and a
  download-all. The advisor never needs an account on the family's site. Time-limited,
  revocable, and not indexed.
- **Attribution:** who uploaded what and when, so a missing document is a question with
  an answer.

**Open question to settle before building:** whether the advisor also gets a way to say
"this one is wrong, send it again". A comment thread per item is the obvious answer and
the obvious scope creep — decide explicitly rather than by drift.

**Done when** the advisor can be sent one link and needs nothing else.

---

## Phase 4 — Refinements, once the thing is in real use

Ordered by likely value, not by ease:

- **Stale-request reminders.** "Requested 21 days ago, still outstanding" is the single
  most useful thing the data can tell you. Needs a Cron Trigger and an email binding.
- **Year-on-year diff.** What is on this year's list that was not on last year's, and
  what quietly disappeared. Catches the carry-over mistakes.
- **Per-item due dates**, driven by the filing deadline and any extension.
- **Bulk actions** — reassign an owner, mark a whole category received.
- **Drag-to-reorder**, which requires the explicit `sort` field noted in the data model.
- **German UI**, since half the document names already are.

---

## Cross-cutting

**Testing.** There is no test framework and, at phase 1, nothing worth testing that
reading the code does not cover. That changes with the backend: phase 2 should add a
`vitest` unit suite over the pure functions in `store.js` (`tally`, `carryOver`,
`sortedYears` — all already pure and dependency-free) and API tests against a local
`wrangler dev`. Note that adding a `package.json` requires no `.assetsignore` change; it
is already excluded from the deployed bundle.

**Accessibility.** Phase 1 ships keyboard-operable rows, labelled controls, visible focus
rings, `aria-pressed` on the toggles, live-region toasts, reduced-motion support, and a
drawer that traps Tab and restores focus to the triggering row's edit control on close.

**Performance.** Four small static files, no framework, no build step. The whole list is
re-rendered on every change, which is correct at tens of rows and would be wrong at
thousands; if a year ever exceeds a few hundred items, render per category instead.

**What must not be touched.** `wrangler.toml`, `.assetsignore` and `.github/workflows/`
belong to the deployment setup. Phase 2 changes `wrangler.toml` for the first time — to
add the D1 binding and a `main` entry point — and that change should be made deliberately
and reviewed on its own, not folded into feature work.
