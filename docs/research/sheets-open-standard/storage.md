# Storage at scale

Follow the references below only as needed; never upfront.

How a workbook's cells live in the document's room. Researched 2026-11-18.

## Where it stands

- A room is a SQLite Durable Object; sheets sit in `sheets` (layout JSON) and `sheet_cells` (one row a cell, input and
  format as JSON) (verified, read `document-schema.ts`).
- Caps: 50,000 cells and 4 MB a sheet, 200,000 cells a document; a write is 5,000 cells (verified, `limits.ts`).
- Cloudflare's limits for a SQLite Durable Object: 10 GB of storage an object, 8 MB a row or value, 100 columns a
  table, 100 bound parameters and 100 KB a statement, 30 s of CPU a request by default ([Durable Objects
  limits](https://developers.cloudflare.com/durable-objects/platform/limits/), verified 2026-11-18). The specs still
  say 2 MB a row (`document-storage.md`): the platform now allows 8 MB.

## Designs

| Concern          | A. A row per cell, as now                                                                                                                                             | B. Blocks of cells (a row per 256 rows × 64 columns tile)                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 20 million cells | 20 million rows; at about 60 bytes each with keys, about 1.2 GB, inside 10 GB (inferred)                                                                              | About 1,200 tiles for a dense sheet; fewer rows, bigger values                                                  |
| Load by viewport | A range query on (row position) needs positions: ids are not ordered, so a load reads the layout first, then cells by id sets (100 bound parameters a query: batches) | A tile key is a position; but positions move on insert, so tiles are keyed by id ranges, which drift (inferred) |
| A write          | Touches its cells' rows only                                                                                                                                          | Rewrites whole tiles; two people in one tile serialise                                                          |
| Styles           | Format JSON per cell                                                                                                                                                  | Style ids per tile, the styles in their own table (as ODF's automatic styles)                                   |
| Copies, branches | Row copies                                                                                                                                                            | Tile copies                                                                                                     |

## Recommendation

**A**, with styles moved to a table of their own (a cell holds a style id, as the file does) and cells indexed by
sheet and row id for viewport loads; layout (the order of row and column ids) stays one JSON per sheet only while
small, and moves to its own table past a size Phase 5 measures (a million row ids are about 7 MB of JSON, close to
the 8 MB row limit; inferred). The 5,000-cell write and the outbox stay.
