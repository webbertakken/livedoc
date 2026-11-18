# The layout engine

How a text document is laid out on pages while it is edited. Researched November 2026. Claims are tagged **verified**
(how), **inferred** (from what) or **assumed**.

## What it must do

Breaks at line granularity; page, column and section breaks; headers and footers per section (first, odd, even);
footnotes at the foot of their page; columns; tables across pages with repeated header rows and rows kept whole; keep
with next, keep together, widows and orphans; pageless mode; typing latency within the web performance budgets
([Web performance](../../specs/016-platform/web-performance.md)); a screen reader reading the text; print and PDF
matching the screen.

## Three designs

### A. Measured DOM pagination

The editable text stays one ProseMirror DOM; a layout pass measures its lines (`Range.getClientRects`) and pushes
content to the next page by inserting page gaps (widgets or margins) where a page fills. Headers, footers and
footnotes are drawn in each page's margin as views.

- LiveDoc's articles already do this at line granularity (verified: `article-pages.md` "Flowing onto pages",
  `apps/live/lib/article/article-flow-geometry.ts`).
- Accessibility comes from the DOM: the text is real, selectable, and read by screen readers and the browser's spell
  check (inferred).
- Tables across pages and footnotes need the measured layout to split a node visually, which a single contenteditable
  cannot do without duplicating rows (inferred). Splitting is done by rendering the table's continuation as a
  read-only mirror with the real rows hidden, or by breaking the table into row groups the view lays per page.
- Cost grows with the document: measuring a 300-page document on every keystroke is too slow, so the pass must be
  incremental, from the changed block onward, stopping once page boundaries settle (inferred).

### B. An own layout engine drawing to a canvas

Text shaped and laid out in JavaScript, drawn to a `<canvas>`; input through a hidden editable element. Google Docs
moved to this in 2021 (assumed: Google's announcement of canvas-based rendering for Docs, May 2021).

- Full control of breaks, footnotes, tables across pages and print fidelity (inferred).
- Text shaping, bidirectional text, IME, spell check, selection, find, accessibility and copy all have to be rebuilt;
  Google keeps a parallel accessible DOM for screen readers (assumed).
- Years of work for a parity Google reached with a large team (inferred).

### C. CSS paged media

The document rendered with `@page` rules, `break-*` properties and running headers, through a polyfill such as
Paged.js (MIT, 0.4.3; verified: `npm view`).

- Excellent for printing and PDF; Paged.js re-flows the whole document into pages, a batch process, not live editing
  (inferred: it renders into new DOM per page).
- Browsers' native `@page` support is limited to printing (inferred).

## Judgement

| Need             | A. Measured DOM                | B. Canvas engine | C. Paged media       |
| ---------------- | ------------------------------ | ---------------- | -------------------- |
| Fidelity         | Good; tables need care         | Best             | Good, print only     |
| Typing latency   | Good, if layout is incremental | Good             | Not for live editing |
| Accessibility    | Native                         | Rebuilt by hand  | Native               |
| Spell check, IME | Native                         | Rebuilt          | Native               |
| Print and PDF    | Layout reused                  | Layout reused    | Native               |
| Effort           | Extends what exists            | Very large       | Small, partial       |

**Finding** (inferred): design A for editing, with an incremental layout pass and its own page model that print and
PDF reuse; design C's ideas (break properties, running headers) inform the page model. Tables across pages are the
riskiest row and are spiked first in Phase 10.
