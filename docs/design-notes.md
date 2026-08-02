# Design notes

Why the interface looks and behaves the way it does. Useful when changing it: most of
these are decisions, not defaults.

## The situation being designed for

Someone opens this on a phone, in the kitchen, having just opened an envelope from a
pension fund. They want to tick one thing and close it. The second most common visit is
in March, wanting to know *what is still missing and who is supposed to be getting it*.

So: the current year's list, its outstanding count, and one-tap ticking are the interface.
Everything else — history, categories, editing, exports — gets out of the way.

## Layout

**A single column, capped at 1120px.** Document names are short; a wide multi-column
layout would spread thirty rows across a screen the eye has to hunt. One column reads
top to bottom in category order, which is also the order documents arrive in.

**The year is the page title, and it is a control.** The most common navigation on this
site is "show me a different year", so it is the largest thing on the page and directly
clickable, rather than a tab strip or a sidebar. It renders as a plain heading until
hovered — a dropdown that does not look like a form field.

**Progress before the list.** The ring answers "how far along are we?" without reading
anything. The four tiles beside it answer "what is left?" — and each is also the filter
for that status, so the number you just read is one click from being the list you see.
Statistics that are also controls beat statistics you have to act on somewhere else.

## Colour

**Swiss red as a mark, not as a system.** The brand is red; the buttons are not. Red on
every primary action reads as *error* or *danger*, and this application has a genuine
destructive action (delete) that needs red to mean something. Primary actions are ink —
near-black in light mode, near-white in dark.

**Status colours carry semantics, and are not the only signal.** Grey outstanding, amber
requested, green received, and a dashed outline for not-applicable. Each pill also carries
its label, so nothing depends on colour perception; N/A additionally uses a dashed border
and hollow dot, which survives being printed in black and white.

**Warm-tinted neutrals.** Pure grey on a document-management screen looks like a
spreadsheet. A slight warmth reads closer to paper, which is what this is about.

**Light and dark are both first-class.** The dark palette is a separate set of tokens, not
an inversion: the status colours are re-chosen for contrast on dark surfaces rather than
algorithmically flipped. The theme follows the system by default and the toggle overrides
it; an inline script in each page's `<head>` applies it before first paint so there is no
flash.

## The row

```
( ) Document name                          AB Anna    · Requested    ⋯
    comment, if any
```

**The circle is a real target, not a checkbox.** Ticking "received" is the single most
frequent action, so it does not require opening anything. Everything else about the row
opens the editor.

**One-click-to-received, but four statuses.** The circle toggles the common case;
`requested` and `na` are a deliberate choice made in the drawer. Cycling all four states
through one control would make the frequent action ambiguous.

**Comments are shown inline, truncated.** A comment is usually "chased them on the 14th" —
worth seeing while scanning, not worth a click to discover. Nothing else in the interface
tells you a row has one.

**Received rows fade rather than strike through.** They stay legible; the tax advisor's
question is often about something already collected.

## Editing

**A drawer, not a modal.** The list stays visible behind it, which matters when the edit
is "which category does this belong in?" On phones it becomes a bottom sheet, where the
controls land under the thumb.

**Every field writes through immediately.** There is no Save button, because there is no
state in which a half-edited document is meaningful, and no plausible reason to abandon an
edit. "Done" closes; it does not commit.

## Locking a year

A finalised year is read-only everywhere: the check circles disable, the add and delete
controls disappear rather than greying out, and the drawer becomes a plain read view. It
is announced by a banner with the finalisation date and a Reopen button — the lock is
protection against accidents, not a decision that has to be regretted.

## Destructive actions and undo

Deleting a category or a document takes the whole state snapshot first and offers **Undo**
in the toast for seven seconds. Category deletion also confirms first, with the item count
in the prompt, because it can destroy a lot at once. Item deletion does not confirm — undo
is the better affordance for a single row, and a confirmation dialog on every deletion
trains people to dismiss dialogs.

## Empty states

Three different ones, because they need three different answers: nothing on the list yet
(add a category), no matching documents (clear the filter), and a category with no
documents (add one). A single generic "nothing here" would be useless in all three.

## Keyboard and accessibility

- Rows are `role="button"` with `tabindex="0"`, and respond to Enter and Space.
- `/` focuses search; `Esc` closes the drawer.
- Every icon-only control has an `aria-label`; toggles carry `aria-pressed`; collapsible
  categories carry `aria-expanded`.
- Toasts are a polite live region.
- Focus rings are visible and use the brand colour — the one place red is load-bearing.
- `prefers-reduced-motion` disables every transition.
- The drawer traps Tab while open, and closing it returns focus to the row's "⋯" edit
  control rather than dropping it to `<body>`.

## Print

A tax checklist gets printed — to take to an appointment, or as a PDF for the advisor.
The print stylesheet drops the header, footer, toolbar and every control, keeps categories
from breaking across pages, and forces light colours. It is a proper output format, not an
afterthought.

## Implementation constraints this creates

**No framework, no build step.** The repository is the site. That is a real constraint on
this design and it holds: the whole list re-renders from state on every change, which is
correct at tens of rows and would need revisiting at thousands.

**Everything that reaches `innerHTML` is escaped** through `TRH.esc`. Document names and
comments are user input, even in a prototype, and template-literal rendering makes that
easy to forget exactly once.

**Icons are inline SVG defined in one place** (`main.js`), so they inherit `currentColor`
and cost no requests. The few that appear in static HTML are written out literally so the
page is not blank before JavaScript runs.
