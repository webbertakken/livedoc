# Charts and pivot tables

Follow the references below only as needed; never upfront.

Researched 2026-11-18.

## Charts

- Today a chart from a Sheet is a **canvas chart element** (`chartSource` naming the sheet and range by ids, a
  `sheetAnchor` in px over the cells), drawn by the canvas's own element view, seven types: Column, Bar, Line, Area,
  Scatter, Pie, Doughnut (`sheet.md` "Charts", verified).
- Google Sheets has about 30 chart types (line, area, column, bar, pie, doughnut, scatter, bubble, combo, stepped
  area, histogram, candlestick, waterfall, OHLC, treemap, geo, gauge, scorecard, timeline, org, table, radar,
  sparkline in a cell, and stacked and 100% variants) with a Setup and a Customise tab (assumed: from the product;
  confirmed by captures).
- ODF holds a chart as an embedded ODF chart document (`chart:chart`, plot area, series by cell range address),
  OOXML as a DrawingML chart part (assumed: from the schemas' element names).

| Design             | A. Keep chart elements, anchored in the workbook       | B. Charts as the workbook's own objects, in the model and the file     |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------- |
| Reuse              | The canvas's renderer, styles, palettes and indicators | The renderer reused as a drawing function; the element wrapper dropped |
| The file           | Converted at the boundary                              | One to one with `chart:chart` and DrawingML                            |
| Outside the canvas | A workbook tab has no canvas: elements need a host     | Native to the workbook                                                 |
| Dashboards         | Read across documents either way                       | Same                                                                   |

**Recommendation: B**, reusing the chart drawing code from `@livedoc/document` as a pure function (the "charts"
shared piece this plan owns, for 0019's documents too).

## Pivot tables

- Not built today (verified: no pivot in `packages/sheets`).
- ODF: `table:data-pilot-table` (source range, fields by orientation, functions); OOXML: a pivot cache and table
  (assumed: schema element names).
- Model: a pivot is a source range, row and column groups, values with a summary function and "show as", filters,
  calculated fields; its output is written to cells by the engine as a spill-like region (inferred: Google's pivot
  output cannot be typed over).

**Recommendation**: a pivot model in `@livedoc/sheets`, evaluated by the engine into a read-only region, written to
the file as a data pilot with its cached cells.
