# Charts

**Status: specified.** Nothing is built.

Charts in a [spreadsheet](spreadsheet.md), as Google Sheets makes them: the workbook's own objects, kept in both
file formats, drawn by LiveDoc's chart code. Research: [Charts and pivots](../../research/sheets-open-standard/charts-and-pivots.md).

## What a chart is

- A chart belongs to a sheet: anchored at a cell's corner with an offset and a size, floating over the cells, or on
  a **chart sheet** of its own (**Move to Own Sheet**). It is never a canvas element.
- It reads its data ranges live, by row and column ids, as today's charts from a Sheet do ([Sheet](sheet.md#charts)).
- It is drawn by the chart drawing code of `@livedoc/document`, made a pure function of a chart's model and its data:
  the shared piece "charts" this plan owns, which plan 0019's documents use too.
- ODF keeps it as an embedded chart document, XLSX as a DrawingML chart, each read and written by its mapping
  ([Standard mapping](standard-mapping.md)).

## Chart types

Every type Google offers: Line, Smooth Line, Area, Stacked Area, 100% Stacked Area, Stepped Area (and stacked),
Column, Stacked Column, 100% Stacked Column, Bar, Stacked Bar, 100% Stacked Bar, Pie, Doughnut, 3D Pie, Combo,
Scatter, Bubble, Histogram, Candlestick, OHLC, Waterfall, Treemap, Geo (regions, markers), Gauge, Scorecard, Radar,
Organisational, Timeline, Table, Annotated Timeline. A type a format cannot hold is written as the nearest it can,
with the original kept for LiveDoc as unknown content, and the loss listed.

## Inserting

- **Insert › Chart** (and the toolbar's): reads the selection, or the data region around the active cell, and
  suggests a type (Google's rules: a date or text first column with number columns is a line or column chart; one
  series of shares is a pie), placed beside the data, selected, with the Chart Editor open.

## Chart Editor

A side panel of two tabs:

- **Setup**: Chart Type (a list grouped as Suggestions, Line, Area, Column, Bar, Pie, Scatter, Map, Other), Stacking,
  Data Range (a range picker, several ranges), X-Axis (with **Aggregate**), Series (each with **Aggregate**; **Add
  Series**), Switch Rows / Columns, Use Row N as Headers, Use Column A as Labels, Treat Labels as Text.
- **Customise**: sections Chart Style (background, font, border, maximise, plot null values, compare mode, 3D),
  Chart and Axis Titles, Series (colour, opacity, line thickness, dash type, point size and shape, data labels, error
  bars, trendline: linear, exponential, polynomial, logarithmic, power series, moving average, with its label and R²),
  Legend (position, font, colour), Horizontal Axis, Vertical Axis (min, max, log scale, number format), Gridlines and
  Ticks.

## Working with a chart

- An Editor selects, moves, resizes, deletes (Delete), copies and pastes a chart; its menu (⋮): **Edit Chart**,
  **Delete Chart**, **Download** (PNG, PDF, SVG), **Copy Chart**, **Move to Own Sheet**, **Alt Text**.
  **Publish Chart**: a LiveDoc share link to the chart alone, read-only, live, and its embed (C3 list, ruled 2026-11-18).
- Arrow keys nudge a selected chart (1 px, 10 px with Shift), Alt and the arrows resize it; Escape returns to the grid.
- A Participant and a Viewer see charts and download them; they cannot select them to move.

## Sparklines

`SPARKLINE(data, [options])` draws a line, bar, column or win/loss chart in its cell, with Google's options
(`charttype`, `color`, `max`, `min`, `rtl`, `linewidth`, `xmin`, `xmax`, `empty`, `nan`, ...). Files keep it by S5's
convention, with its cached value empty.

## Dashboards

A Dashboard slot's Sheet Chart (C4, ruled: kept) reads a chart of a spreadsheet, in its document or another the
reader may open ([Plan's links](plan-links.md)).

## Accessibility

- Every chart carries alt text (generated from its type, title and ranges until an Editor writes it), and a
  **View Data** table reachable by the keyboard.
- Colours of series meet 3:1 against the background and against neighbours; series also differ by marker or dash.

## Errors and limits

- Up to 100 charts a sheet; a chart reads up to 50 series and 10,000 points per series (Google's figure, assumed);
  past it, it draws the first and says "Showing the first 10,000 points".
- A chart whose range is deleted shows "No data" with **Edit Chart**.

## Telemetry

`Spreadsheet · Inserted · Chart` with its type; `Spreadsheet · Changed · Chart`.
