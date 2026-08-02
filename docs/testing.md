# Testing

What is checked before a change ships, what is deliberately not automated yet, and what
the suite should look like when it arrives. This expands the one-paragraph *Testing* note
in [`implementation-plan.md`](implementation-plan.md#cross-cutting) into something you can
follow.

## Where it stands today

There is no test framework, no `package.json` and no build step. That is a decision, not
an omission: phase 1 is a front-end prototype whose entire purpose is to be judged by eye
by the family. Almost every line of it is markup, styling and DOM rendering that is still
expected to change on feedback, and a test suite over an interface that has not been
agreed yet mostly locks in decisions nobody has made.

The corollary is that the checking currently happens two ways — reading the diff, and the
manual pass below. Both are real steps; neither is optional because the automated ones are
missing.

## What is actually worth testing

The pure functions. They are already dependency-free and side-effect-free, they encode
rules that are written down in [`data-model.md`](data-model.md), and they are the part of
the code where a bug is silent rather than visible.

| Function | In | The rule that must hold |
| --- | --- | --- |
| `TRH.tally` | `store.js` | `relevant = total − na`; `percent = round(received / relevant × 100)`; **all-N/A is 100%, not a division by zero** |
| `TRH.carryOver` | `store.js` | Deep copy with fresh ids; every status resets to `outstanding`; `skipNa` drops last year's N/A rows; `keepComments` off drops comments; **the source year is not mutated** |
| `TRH.sortedYears` / `latestYear` | `store.js` | Newest first, on a copy — `.slice()` before `.sort()`, because sorting in place would reorder the stored state |
| `TRH.yearByTaxYear` | `store.js` | `Number()` coercion: the year arrives from `?year=2024` as a string and must still match the integer key |
| `TRH.load` | `store.js` | Corrupt JSON, absent storage, or a `schemaVersion` mismatch all fall back to a fresh seed rather than throwing |
| `TRH.save` | `store.js` | Returns `false` instead of throwing when storage is full or blocked (private browsing) |
| `TRH.esc` | `main.js` | Every user-typed string reaching `innerHTML` is escaped. Document names and comments are user input even in a prototype |
| `TRH.initials` / `avatarColor` | `store.js` | Same person, same colour, everywhere — the colour is derived from the id, not stored |

**`carryOver` is the highest-value test in the codebase.** It runs once a year, unattended,
and a bug in it corrupts the year you are about to spend three months working in while
leaving the source year looking perfectly fine. Aliasing instead of copying is the specific
failure to guard against: the year separation described in
[`data-model.md`](data-model.md#carry-over) depends entirely on that function.

Beyond the functions, three invariants deserve tests the moment there is a server to
enforce them, because right now they are enforced only by the interface and are therefore
not enforced at all:

- `taxYear` is unique.
- `status === "final"` ⟺ `finalizedAt` is set.
- No write of any kind succeeds against a final year.

## What is not worth automating yet

The screens. `app.js` re-renders the whole list from state on every change, so a DOM test
asserts markup rather than behaviour, and that markup is the thing most likely to be
redesigned. Filtering, the drawer, the toasts and the print stylesheet are all cheaper and
more honestly verified by looking at them. This changes when the interface settles — not
before.

## The manual pass

Run this before pushing anything that touches the checklist screen. It takes about ten
minutes and catches the class of breakage that unit tests would not.

```bash
python3 -m http.server 8080   # root-absolute /assets paths need a server
```

Start from known state: **About → reset demo data**, then reload.

- [ ] The page opens on 2025 — the most recent year — and the ring matches the tiles.
- [ ] Click a row's circle: it goes received and the ring and counts move. No toast —
      routine edits commit silently; toasts are reserved for things you might want undone.
- [ ] Click the row body: the drawer opens; change name, owner, status and comment; each
      writes through with no Save button; `Esc` closes it.
- [ ] Move an item to another category from the drawer; it leaves one and joins the other.
- [ ] Click each stat tile: it filters to that status, and clicking again clears it.
- [ ] `/` focuses search; typing narrows the list; the no-matches empty state offers to
      clear the filter.
- [ ] Add a category, rename it, delete it — the confirm names the item count. Delete an
      item and **Undo** from the toast; the row comes back where it was.
- [ ] Start a new year from 2025. Every row is outstanding, comments are gone unless you
      asked for them, N/A rows are absent unless you asked for them, **and 2025 is
      unchanged when you switch back to it**.
- [ ] Mark a year final: the banner shows, circles disable, add and delete controls
      disappear, the drawer is read-only. Reopen it and they all come back.
- [ ] `/history/` lists every year newest first with the same percentages as the main page.
- [ ] Export downloads readable JSON for the right year. Print preview drops the header,
      toolbar and footer and keeps categories off page breaks.
- [ ] Toggle light/dark; reload — no flash of the wrong theme.
- [ ] Narrow to phone width: the drawer becomes a bottom sheet and the tiles still read.
- [ ] Reload: everything you just did survived.
- [ ] Console is clean.

An easy one to skip and worth not skipping: **type `<script>alert(1)</script>` as a
document name.** It should render as text.

## When automation earns its place — phase 2

The backend is the trigger. Once state lives on a server, a bug stops being "my browser
looks odd" and starts being "the shared list is wrong", and the manual pass cannot cover
concurrency at all.

**Unit suite — `vitest`.** The obstacle is that `store.js` is an IIFE that assigns to
`window.TRH` rather than an ES module, so it cannot be imported for its exports. Do not
restructure production code to suit the tests: run vitest with `environment: 'jsdom'`,
import the file for its side effects, and read `window.TRH` afterwards.

```js
// tests/store.test.js
import { beforeAll, beforeEach, expect, test } from "vitest";

beforeAll(async () => { await import("../assets/js/store.js"); });
beforeEach(() => { localStorage.clear(); });

test("all-N/A counts as complete", () => {
  const t = window.TRH.tally([{ status: "na" }, { status: "na" }]);
  expect(t.relevant).toBe(0);
  expect(t.percent).toBe(100);
});
```

Two things to get right in that suite:

- **Clear `localStorage` between tests.** `TRH.load` seeds and immediately saves, so one
  test leaks into the next otherwise.
- **`TRH.uid` uses `Date.now()` and `carryOver` uses `new Date()`.** Freeze time with
  `vi.useFakeTimers().setSystemTime(...)` where the value matters, and otherwise assert
  the property rather than the literal — that the new ids *differ* from the source ids,
  not that they equal some string.

**API tests.** Against a local `wrangler dev` (via `unstable_dev` or the Workers vitest
pool), covering the routes in
[`data-model.md`](data-model.md#planned-api-shape) and, specifically, that the two rules
above return `409`. A test that only proves the happy path proves the least interesting
half.

**Nothing needs to change to deploy this.** `package.json`, `package-lock.json` and
`node_modules` are already listed in `.assetsignore`, and `node_modules/` is in
`.gitignore`, so adding a dev-only toolchain does not affect the deployed bundle. No edit
to `.assetsignore` or `wrangler.toml` is required, which is the point of checking before
adding one.

## CI

`.github/workflows/deploy.yml` deploys `main` to Cloudflare and runs nothing else. When
there is a suite, it belongs in **its own workflow** running on pull requests, not as a
step bolted onto the deploy job — deployment has to keep working on a repository where
there is nothing to run.

Once that workflow is green and trusted, make it required for merging into `main`. A test
job that nothing blocks on is decoration.

Note that `.github/workflows/` is owned by the deployment setup
([`README.md`](../README.md#deployment)), so adding the test workflow is a deliberate,
separately reviewed change rather than something folded into feature work.

## One rule for the tests themselves

Test the invariants in [`data-model.md`](data-model.md), not the implementation in
`store.js`. If a test has to be rewritten every time a function is refactored, it was
describing the code rather than the rule, and it will be deleted the first time it is
inconvenient.
