# Data model

The shape the prototype uses today, and the shape the backend should keep. It is
deliberately small: one household, a list of years, categories inside a year, items
inside a category.

Implemented in [`assets/js/store.js`](../assets/js/store.js).

## Overview

```
Household
└── Person[]                     Anna, Daniel, Joint, Children
└── TaxYear[]                    one per filing year
    └── Category[]               Bank accounts, Salary, Mortgage, …
        └── Item[]               the documents themselves
```

Categories are nested inside the year rather than shared across years. That is the
important structural decision: a finalised year must stay a faithful record of what was
collected, so renaming a category in 2026 must not silently rewrite 2023. Carry-over
copies structure; it does not alias it.

## Root

```jsonc
{
  "schemaVersion": 1,
  "household": "Cameron household",
  "people": [ /* Person */ ],
  "years":   [ /* TaxYear */ ]
}
```

`schemaVersion` is checked on load. A mismatch discards the stored state and re-seeds —
acceptable for a prototype, and the hook for a real migration later.

## Person

```jsonc
{ "id": "p_anna", "name": "Anna", "initials": "A" }
```

An owner is *who is going to chase the document*, not who legally owns the underlying
account. That is why `Joint` and `Children` are people here: they are useful answers to
"whose job is this?" even though neither is an individual adult.

People are household-level, not per-year — the family does not change as often as the
document list. If someone joins or leaves, historical items keep referring to them by id.

## TaxYear

```jsonc
{
  "taxYear": 2025,               // integer, unique across years
  "status": "open",              // "open" | "final"
  "createdAt": "2026-01-08",     // ISO date
  "finalizedAt": null,           // ISO date when status === "final", else null
  "note": "Carried over from 2024.",
  "categories": [ /* Category */ ]
}
```

`taxYear` is the year the return is *about* (2025), not the year it is filed (2026). It
doubles as the natural key: `/?year=2025`.

**Invariants**

- `taxYear` is unique. Creating a duplicate is rejected.
- `status === "final"` ⟺ `finalizedAt` is set.
- A final year is read-only: no item, category or field may change while it is locked.
  Reopening (`final → open`, clearing `finalizedAt`) is allowed and expected.

## Category

```jsonc
{
  "id": "cat_...",
  "name": "Bank accounts & securities",
  "collapsed": false,            // view state, persisted for convenience
  "items": [ /* Item */ ]
}
```

`collapsed` is presentation, not data. It lives here because the prototype has nowhere
better; when the backend arrives it should move to a per-device preference rather than
being written to the shared record — otherwise one person collapsing a section collapses
it for everybody.

## Item

```jsonc
{
  "id": "it_...",
  "name": "Pillar 3a contribution certificate",
  "ownerId": "p_anna",           // → Person.id
  "status": "outstanding",       // see below
  "comment": "Ordered via e-banking on 14 Jan"
}
```

Exactly the four fields the brief asks for: name, owner, status, optional comment.
Everything else the interface shows (progress, counts, ordering) is derived.

### Status

| id | Meaning | Why it exists |
| --- | --- | --- |
| `outstanding` | Not started | The default for anything carried into a new year |
| `requested` | Asked for, waiting on a third party | Most of the delay in a tax return lives here; without it you chase the same bank twice |
| `received` | In hand | The only status that counts as done |
| `na` | Considered, does not apply this year | Keeps the decision visible instead of deleting the row and losing the knowledge |

The intended progression is `outstanding → requested → received`, but it is not enforced —
documents arrive unasked, and a received document can turn out to be the wrong one.

### Derived values

```
relevant = total − na
percent  = relevant === 0 ? 100 : round(received / relevant × 100)
```

Progress is measured against relevant items only. Marking something not applicable is a
step forward — it removes work — so it must not permanently cap the percentage below 100.

## Carry-over

Creating year *N+1* from year *N* (`TRH.carryOver`):

- Categories and items are **deep-copied with fresh ids**. No shared references, so the
  old year is untouched by later edits.
- Every item's status resets to `outstanding`. Last year's certificate is not this
  year's certificate.
- `skipNa` (default on): items that were `na` last year are left out. They were already
  judged irrelevant, and anything genuinely recurring can be added back.
- `keepComments` (default off): comments are usually about a specific chase in a specific
  year, so they are dropped unless asked for.
- The new year is `open`; the source year is not modified or auto-finalised. Overlap is
  normal — the 2026 list starts before the 2025 return comes back.

## Persistence today

One `localStorage` key, `trh.state.v1`, holding the whole root object as JSON. Every
write is a full-document write. At this size (a few hundred items across all years, tens
of KB) that is entirely adequate and keeps the code honest.

Four functions in `store.js` are the only code that touches storage:

```js
TRH.load()   // → state, seeding on first run or on a schema mismatch
TRH.save(s)  // full write
TRH.seed()   // the example data
TRH.reset()  // clear
```

## Planned API shape

When the backend lands, `load`/`save` become the seam. A resource-shaped API that fits
the model without reshaping it:

```
GET    /api/state                     whole document — fine at this size
GET    /api/years                     [{taxYear, status, percent}]
GET    /api/years/:taxYear
POST   /api/years                     {fromYear, taxYear, skipNa, keepComments}
PATCH  /api/years/:taxYear            {status: "final" | "open", note}
POST   /api/years/:taxYear/categories
PATCH  /api/categories/:id            {name}
DELETE /api/categories/:id
POST   /api/categories/:id/items
PATCH  /api/items/:id                 {name, ownerId, status, comment}
DELETE /api/items/:id
```

Two things worth getting right at that point:

- **Reject writes to a final year server-side.** The lock is currently only enforced in
  the UI, which is no enforcement at all.
- **Handle concurrent edits.** Two people collecting documents on two phones is the
  normal case, not the edge case. Per-item `PATCH` (rather than whole-document writes)
  plus a `version` or `updatedAt` field keeps one person's ticks from clobbering the
  other's.

## Not modelled yet

Deliberate omissions, listed so they are choices rather than oversights:

- **Files.** Phase 3. An item will gain `attachments: [{id, filename, size, uploadedAt,
  uploadedBy}]`, with bytes in R2 and only metadata in the database.
- **Due dates and reminders.** Useful for "requested three weeks ago, still nothing", but
  it needs a scheduled job to be worth anything.
- **An audit trail.** Who ticked what, when. Cheap to add once there is a server and more
  than one device; meaningless in `localStorage`.
- **Item ordering.** Items sit in insertion order within a category. An explicit `sort`
  field is needed the moment drag-to-reorder appears.
