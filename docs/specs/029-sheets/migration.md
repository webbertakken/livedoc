# Migration of stored sheets

**Status: specified; the plan and its dry run are built** (`planSheetMigration` in `@livedoc/sheets`, what a
document becomes, worked out without touching it, and counted across documents behind `SHEETS_MIGRATION=dry`).
Nothing is run.

How the Plan Sheets already stored become spreadsheets (S3, ruled 2026-11-18: migrated once into the new model, with no compatibility layer
beyond the 30-day way back).

## What there is

On 2026-11-18 production held 124 documents and its telemetry since 2026-10-25 held no Sheet event; stored sheets
are likely none or a handful (inferred: rooms are not countable from D1). The migration is still specified whole,
so no stored sheet is ever left behind.

## What it does

- A document whose tabs are **all Sheet tabs** becomes a spreadsheet in place: each Sheet tab a sheet tab, same name
  and order. Other sheets on one tab (copies, older Sheets) become sheet tabs after it, in element order.
- A document **mixing** Sheet tabs with other tabs keeps the other tabs; its Sheet tabs (and Sheet elements on
  general tabs, from before Sheet tabs) move to one new spreadsheet named "<Document> Sheets" in the same folder, with
  the same owner and share links, in tab order (default). The tabs they leave are removed; a Sheet element's tab keeps
  its other elements.
- Cells, formats (each distinct format becomes a style), merges, filters, validation and format rules, named ranges,
  freeze, sizes and comments carry over unchanged in meaning; charts anchored in a Sheet become charts of
  the workbook at the same place.
- A card table's rows stay as the plain cells they last showed; only its links, drafts and Controls column are
  dropped, and a sheet set up from Plan cards becomes an ordinary sheet (C6 and S3, ruled 2026-11-18). Nothing a person typed is lost; a draft row's typed values stay in its cells.
- A Sheet tab's first Sheet keeps its tab and name; a sheet's name that breaks the sheet name's rules, or is taken,
  is fitted to them (`SheetName.fit`), and a second Sheet of the same sheet (a paste) moves nothing more (default).
- A sheet no Sheet element shows only waits to expire, and is left; a Sheet tab with no Sheet goes (default).
- The workbook's file format is ODF (C5); its settings take the document owner's locale
  and time zone.
- Formulas reading another sheet that moved with them still read it; dashboard slots and form responses are
  re-pointed at the spreadsheet's sheets ([Plan's links](plan-links.md)).

## How it runs

Ruled (director, 2026-11-20): a background job behind a Worker variable, as the content move was
([Moving content into rooms](../006-document/document-storage-move.md)); no admin routes.

- **The switch**: the api's plain variable `SHEETS_MIGRATION`; absent (every fork's default) is off, `dry` plans,
  and `run` is reserved for the migration itself. docs.nu sets it in `hosted-vars.json`.
- **A dry run** (built): while the switch is `dry`, each minute up to 25 documents not planned yet, oldest first,
  are asked by their rooms what they would become; each answer is written to D1's `sheet_migration_plans` as
  counts (kind, tabs, sheets, cells, card tables, charts, tabs removed, sheets left), never content, logged
  `[sheets-migrate] dry <documentId> kind=<kind> ...`. A failed plan is named and tried again after an hour.
- **The operator's read** (built): `scripts/sheets-migration.ts dry (--local | --remote)` in `apps/api` reads those
  rows through wrangler, never writing, prints the totals by kind and every failure, and exits non-zero until every
  document is planned and none failed. Run on preview, then production, before any write, with Webber's yes.
- **The run** (Phase 16, where its targets exist): with the switch at `run`, once Plan no longer makes Sheet tabs,
  each room does it in one transaction a document: idempotent, logged
  `[sheets-migrate] <documentId> tabs=<n> sheets=<n> cells=<n>`, and a failure `[sheets-migrate] failed <documentId>
<reason>` that leaves the document as it was to be tried again.
- **A way back** (Phase 16): until the Plan Sheet's code is removed, a document's pre-migration rows are kept for 30
  days and the same switch at `restore` puts them back.

## What a person sees

Nothing changes in what they see beyond the new surface: their Sheet tab opens as a sheet of a spreadsheet with the
same cells, and a document that mixed them shows a link to "<Document> Sheets" where its Sheet tabs were. A one-time notice on the first open says "Sheets are now spreadsheets: same cells, more of Google Sheets'
tools." with **Learn More** (the help article) and **Got It**.
