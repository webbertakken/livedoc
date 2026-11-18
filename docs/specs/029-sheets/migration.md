# Migration of stored sheets

**Status: specified.** Nothing is run.

How the Plan Sheets already stored become spreadsheets (S3, default: migrated once into the new model, with no
compatibility layer).

## What there is

On 2026-11-18 production held 124 documents and its telemetry since 2026-10-25 held no Sheet event; stored sheets
are likely none or a handful (inferred: rooms are not countable from D1). The migration is still specified whole,
so no stored sheet is ever left behind.

## What it does

- Each **Sheet tab** becomes a **workbook tab** of the same name and place, holding its sheet; any other sheets on that
  tab (copies, older Sheets) join the same workbook in element order.
- A Sheet element on a general tab (from before Sheet tabs) becomes a workbook tab added after its tab, named as the
  sheet, and the element is removed.
- Cells, formats (each distinct format becomes a style), merges, filters, validation and format rules, named ranges,
  freeze, sizes and comments carry over unchanged in meaning; charts anchored in a Sheet become charts of
  the workbook at the same place.
- A card table's rows stay as the plain cells they last showed; only its links, drafts and Controls column are
  dropped, and a sheet set up from Plan cards becomes an ordinary sheet (C6, ruled; this handling (default),
  confirmed with S3). Nothing a person typed is lost; a draft row's typed values stay in its cells.
- The workbook's file format is ODF (C5); its settings take the document owner's locale
  and time zone.
- Dashboard slots and form responses are re-pointed at the workbook's sheets ([Plan's links](plan-links.md)).

## How it runs

- A room schema step does it, document by document, on the room's next open or upkeep: idempotent, one transaction
  a document, logged `[sheets-migrate] <documentId> tabs=<n> sheets=<n> cells=<n>` and a failure
  `[sheets-migrate] failed <documentId> <reason>` that leaves the document as it was to be tried again.
- A **dry run** (an admin route, read-only) counts what each document would become, run on preview then production
  before any write, with Webber's yes.
- **A way back**: until the Plan Sheet's code is removed, a document's pre-migration rows are kept (renamed) for 30
  days and an admin route restores them.

## What a person sees

Nothing changes in what they see beyond the new surface: their Sheet tab opens as a workbook tab with the same
cells. A one-time notice on the first open says "Sheets are now spreadsheets: same cells, more of Google Sheets'
tools." with **Learn More** (the help article) and **Got It**.
