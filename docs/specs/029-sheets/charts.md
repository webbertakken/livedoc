# Charts

**Status: built in part** (plan 0020 Phase 11): the model, drawing over the cells, Insert › Chart, working with a
chart, the Chart Editor's controls for what the model holds (below), and writing charts into both file formats
([Charts in the file](standard-mapping.md#charts-in-the-file)); the rest specified.

Charts in a [spreadsheet](spreadsheet.md), as Google Sheets makes them: the workbook's own objects, kept in both
file formats, drawn by LiveDoc's chart code. Research: [Charts and pivots](../../research/sheets-open-standard/charts-and-pivots.md).

## What a chart is

- A chart belongs to a sheet: anchored at a cell's corner with an offset and a size, floating over the cells, or on
  a **chart sheet** of its own (**Move to Own Sheet**). It is never a canvas element.
- It reads its data ranges live, by row and column ids, as today's charts from a Sheet do ([Sheet](sheet.md#charts)).
- It inherits their empty cells: a cell that is empty or holds no number is no value, a gap, never 0
  ([No value is a gap](../009-elements/pie-chart.md#chart-types)). Customise's **Plot Null Values** is the one way
  to join a line across a gap, as Google's is.
- It is drawn by the chart drawing code of `@livedoc/document`, made a pure function of a chart's model and its data:
  the shared piece "charts" this plan owns, which plan 0019's documents use too.
- ODF keeps it as an embedded chart document, XLSX as a DrawingML chart, each read and written by its mapping
  ([Standard mapping](standard-mapping.md)).

## The model

A chart is one of its sheet's **objects**, kept in the sheet's layout beside its rules ([Sheet store](sheet-store.md#in-a-spreadsheet)).
A layout write sets one whole by its id, or removes it; two people changing two charts never overwrite each other,
and two changing one chart resolve to the last write. Each change is one undo step.

- **Place**: the cell its top-left corner sits in, by row and column ids, and an offset into that cell in px at
  100%; a width of 160 to 2,000 px and a height of 120 to 2,000 px. Inserting or resizing rows and columns before
  it moves it with its cell. When its cell's row or column is deleted, it moves to the one that takes its place
  (the next, else the one before).
- **Data**: one range by row and column ids, and optionally only some of its columns (picked by id, up to 13),
  read as today's charts from a Sheet read one ([Sheet](sheet.md#charts)): a first row of names heads the series, a
  first column of labels (or, on a scatter chart, of numbers: the x) labels them; on a scatter chart a first column
  of text beside two or more columns of numbers names its points, and the next column is its x
  ([Scatter's point names](../009-elements/pie-chart.md#chart-types)). Deleting rows or columns inside
  the range shrinks it; deleting all of it leaves the chart with no data, drawn as "No data".
- **Type**: one of [Chart types](#chart-types) built: Column, Bar, Line, Area, Scatter, Pie and Doughnut. A Column
  or Bar chart draws every series of its range side by side, as Google's does
  ([Several series](../009-elements/pie-chart.md#chart-types), D281).
- **Stacking**: a Column, Bar or Area chart stacks its series, Standard or 100%, or none (Google's Setup › Stacking),
  drawing Stacked Column, Stacked Bar, Stacked Area and their 100% kinds ([Stacking](../009-elements/pie-chart.md#chart-types),
  D282). Another type keeps it unused.
- **Smooth**: a Line chart draws its lines as curves through its points (Smooth Line, Google's Customise › Chart
  Style › Smooth; [Smooth Line](../009-elements/pie-chart.md#chart-types), D284). Another type keeps it unused.
- **Look**: a palette ([Chart palettes](../009-elements/pie-chart.md#chart-palettes)); per series, by its column's id,
  a colour, a scatter series drawn as a line ([Lines set by an agent](../009-elements/pie-chart.md#lines-set-by-an-agent)),
  and the right-hand axis; the legend's place (top, right, bottom, left) or none; the values printed on the marks;
  the value axis, shown unless turned off (Google shows it; a Plan chart's is off until turned on); a title, a
  horizontal axis title and a vertical axis title, each up to 200 characters; alt text up to 1,000.
- **Kept file XML**: a chart read from a file names its file XML, kept with the workbook, and the sum it was read as;
  the file is written with that XML while the chart is unchanged ([Charts in the file](standard-mapping.md#charts-in-the-file), D276).
- Up to 100 objects a sheet (`objects_full`); a chart that is not one of these shapes is refused (`write_invalid`).

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

Built of the Chart Editor: it opens on a chart inserted, on its Edit Chart button and on a double click; Setup holds
Chart Type (the built types), Stacking (None, Standard, 100%; on a Column, Bar or Area chart), Data Range (one range in A1, a typo refused "Type a range like A1:D20") and the Series,
each a scatter's to draw as a line; Customise holds Chart Title, Horizontal and Vertical Axis Title, Legend, Palette,
Value Axis, Data Labels, Smooth (on a Line chart), each series' colour (the one colour picker) and Alt Text. A control writes the chart at
once, one undo step; a text when it is left or Enter is pressed, Escape taking it back. A chart whose cells are gone
shows "No data" there.

## Working with a chart

- An Editor selects, moves, resizes, deletes (Delete), copies and pastes a chart; its menu (⋮): **Edit Chart**,
  **Delete Chart**, **Download** (PNG, PDF, SVG), **Copy Chart**, **Move to Own Sheet**, **Alt Text**.
  **Publish Chart**: a LiveDoc share link to the chart alone, read-only, live, and its embed (C3 list, ruled 2026-11-18).
- Arrow keys nudge a selected chart (1 px, 10 px with Shift), Alt and the arrows resize it; Escape returns to the grid.
- A Participant and a Viewer see charts and download them; they cannot select them to move.

## Sparklines

`SPARKLINE(data, [options])` draws a small chart filling its cell, as Google Sheets' does. Files keep it by S5's
convention, with its cached value empty.

- **Its value** is empty text: a formula reading the cell reads `""`, and nothing overflows into it. The chart is
  drawn when the cell's formula works a `SPARKLINE` out and its value is that empty text, so
  `=IF(B2>0, SPARKLINE(C2:H2), "")` draws only where `B2` is positive.
- **Data**: a range or an array, read across rows. Each value is a number; an empty cell is skipped or drawn as 0 by
  `empty` (`ignore` or `zero`), and any other value (text, a boolean) by `nan` (`ignore` or `convert`, as 0);
  both skip when not set (default, D71). An error in the data or the options is the cell's value. At most 10,000
  values are drawn, the first ones, as for a chart.
- **Options**: a range two cells wide, or an array `{"charttype","column"; "color","red"}`, each row a name (any case)
  and its value. A name it does not know is left alone; a `charttype` other than `line`, `column`, `winloss` or
  `bar` is `#VALUE!` (default, D71). Colours are CSS names (`red`) or hex (`#3D3D3D`); one that is neither is
  left alone.
- **line** (the default): the values left to right, joined, scaled between `ymin` and `ymax` (the data's own when
  not set, clipped beyond them); `color` sets the line, else the cell's text colour, else the sheet's accent;
  `linewidth` its thickness (1). Data two columns wide (more than one row) is x then y: `xmin` and `xmax` keep the
  points between them; one series spaces its points evenly.
- **column**: a column each value, up from 0 (or down for a negative), scaled between `ymin` and `ymax` (0 and the
  data's extremes when not set). `color` for every column, then `negcolor` for negatives, `lowcolor` and
  `highcolor` for the lowest and highest, `firstcolor` and `lastcolor`, each later one winning (default, D71);
  `axis` draws the line at 0 in `axiscolor`.
- **winloss**: a column each value, up for a positive and down for a negative, all the same height, nothing for 0;
  the same colours and axis as **column**.
- **bar**: the values side by side in one bar, each as wide as its share of `max` (the values' sum when not set),
  in `color1` and `color2` by turns; a negative value is 0.
- `rtl`: `TRUE` draws right to left. Sparklines draw the same in the grid, images, PDFs and SVG exports.
- Defaults: `color` is the sheet's accent, `color2` its accent lightened, `axiscolor` its muted ink (default, D71).

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

`Spreadsheet · Added · <type>` when Insert › Chart makes one (Column, Bar, Line, Area, Scatter, Pie, Doughnut);
`Sheet · Changed · Chart` for each move, resize, change or delete (the sheet's change kinds, `SHEET_CHANGE_KINDS`).
