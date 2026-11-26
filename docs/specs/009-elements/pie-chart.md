# Data charts (pie + bar + line)

Data charts are elements whose marks are sized by value, in a categorical
palette, with an optional legend. The palette holds them in its own top-level **Data**
category ([Palette top-level categories and bands](../010-palette/palette-top-level-categories.md)):
**Pie**, **Column**, and **Line**, built so more chart kinds slot in beside them. Each draws as one of seven
**chart types** (Chart types, below): Column, Bar, Line, Area, Scatter, Pie and Doughnut. They share the
animation set, legend toggle, and context-menu categories; pie + bar also share
the same 1-D data model, while the line chart carries a 2-D dataset (see Model).

## Behaviour

- Drag a **Pie**, **Column**, or **Line** chart in from the palette's **Data**
  category. It drops with sample data. (The Column tile was called **Bar** until October 2026; it makes the same
  `bar-chart` element, named as Google Sheets and Excel name a chart of upright bars.) Any of them then becomes any
  chart type from its menu's **Chart Type** section. Each is a row with a one-line blurb
  ("Proportions of a whole", "A trend over time") rather than a caption tile:
  the picture names the chart, not the job it does.
- A **Data** context-menu category edits the chart. Pie / bar edit inline: one
  row per datum — a recolourable swatch (opening the
  [colour picker](../004-interface-design/colour-picker.md) in a popover), a **label**, and a **value** — plus
  add / remove. The line chart's 2-D grid is too wide for the narrow menu, so
  the category instead **summarises the series** (a colour dot + name) and an
  **Edit Data** button opens a **modal** (`LineDataDialog`): a row per category,
  a column per series, add / remove either axis, and an **Import CSV** button
  (header row = series names, first column = category labels). The chart +
  legend redraw live from the data. A value cleared to empty, inline or in the modal, is no value (Chart types "No
  value is a gap"), shown as an empty field.
- Hovering a mark (slice / bar / line point) shows a readout with its label +
  value, regardless of the legend toggle.
- **The readout stays in view** (operator, 2026-11-26): it sits above its mark, centred, and moves in along its side
  just far enough to stay inside what is seen of the page, a sheet scrolled part way past the chart, a panel's edge
  or the window's; with no room above its mark it sits below it.
- A **Chart** context-menu category holds display options: a **Legend**
  placement picker — **Off / Top / Left / Right / Below** (glyph-over-label
  tiles). Picking a side both turns the legend on and positions it (setting
  `chartLegend: true` and `chartLegendPosition`), while **Off** sets
  `chartLegend: false`. The default is **Below**: a side legend spends up to
  130px of a 280px-wide chart on series names, squeezing the plot into a third
  of the card, and it is the plot people are reading — a bottom band costs
  height, which these charts have more of to give. The resolved default applies
  to every chart that never picked a placement, which is the point of a default
  rather than a per-element field. The chart default sizes are squarer to match. The chart layout (`chartFrame`) reserves a
  vertical strip for a left/right legend or a horizontal band for a top/bottom
  one, and the chart body fills the remaining `area`; `ChartLegend` stacks in a
  column on the side, or wraps in a centred row on top/bottom.
- Under the placement tiles (while the legend is on), **Text Size** (the one
  [Text Size](../004-interface-design/fonts.md#text-size) slider, 6 to 48 px, without Scale) sets the
  key's row size. It writes the element's ordinary `textSize` (a chart has no label, so the Text
  flyout never offers it) and reads through `legendFontPx` (`label-font.ts`): a px is itself, and
  the presets earlier charts carry read 11 / 14 / 18px, with Medium the default. A key is not a name, so it has its own scale rather than
  the label one. An absent `textSize` reads as Medium.
- Under the legend, **Show Values** (`chartValues`, off by default, so a chart made before it draws as it did) prints
  each mark's number on the chart: above a column, after a bar, above each point of a line, area or scatter series, and
  inside a pie's or doughnut's wedge (as a percentage when the values add up to 100). A column chart with values also
  names each column under its baseline, so its legend can be turned off; a name wider than its column's share is cut
  with an ellipsis, and dropped when not one letter fits, so neighbours never overprint. Numbers read short from
  10,000 up: 120000 as 120k, 1500000 as 1.5M, at most one decimal, in the unit the rounded number reads in (999,960 is
  1M, not 1000k); under that in full (1,080). A wedge's number takes the ink that reads on its colour; the rest take the chart's text
  colour, at the key's size. The editor's toggle fires `Element·Changed·ChartValues`. It is a display option of the
  chart, so it follows the Chart category's gating: an Editor changes it; a Participant or Viewer sees the numbers.
- Under Show Values, **Show Axis** (`chartAxis`, off by default, so a chart made before it draws as it did) draws the
  value axis on a column, bar, line, area or scatter chart (a pie has none): tick labels at round values (1, 2 or 5
  times a power of ten, four or five of them, the range widened to the next round value past the largest and
  smallest, zero always in it but on a scatter chart, below) and a faint gridline across the plot at each, the plot drawn in from the side the
  labels take. A column or line chart labels its left side; a bar chart its bottom. Numbers read as Show Values'
  do (120k, 1.5M). The toggle fires `Element·Changed·ChartAxis`; the gating is Show Values'.
- **A second axis**: a line, area or scatter series marked `axis: "right"` is drawn against a scale of its own,
  worked out from the right-hand series alone, so a series in the thousands and one in the tens both read (signups
  against paid). With Show Axis on, the right side carries that scale's tick labels in the chart's text colour,
  the plot's right edge drawn in the first right-hand series' colour so the two read as one (labels in a light
  series' colour were too faint to read); the gridlines follow the left scale. A chart whose series are all on the right draws them on the left
  scale, as if none were. In the editor, the Chart category of a line chart with two or more series has **Right
  Axis**, a choice of None or one series, which moves that series to the right (one commit, `Element·Changed·
ChartAxis`); a series on the right shows "(right)" after its name in the Data summary. An Editor changes it.
- **A scatter series drawn as a line**: a series of a scatter chart marked `line: true` has its points joined by
  straight segments in order of x, its markers kept, as Excel's "Scatter with Straight Lines and Markers" draws it
  (a Pareto frontier among points); every other series stays points only. The line joins the series' present points
  only: no value breaks nothing on it, so a series whose values are mostly empty still draws one unbroken line
  through those it has. Points of equal x keep their rows' order; a scatter whose categories are not numbers (evenly
  spaced) joins them in category order. Its key in the legend is a short line through a dot, not a square. Line and
  Area draw every series as a line already, so the mark changes nothing on them and is kept for a change back to
  Scatter. In the editor, the Chart category of a scatter chart has **Lines**: a tile per series, pressed while it is
  drawn as a line, each press one commit (`Element·Changed·ChartLines`). An Editor changes it; a Participant and a
  Viewer see the lines.
- The **Animation** category carries the chart-specific animations
  (None / Grow / Pop / Spin / Pulse, with a **Speed** row + **Repeat** toggle)
  in place of the boxed-element animation set — a chart animates its marks, not
  the whole box. Grow / Pop play once (an entrance); Spin / Pulse loop.
- Mark colours default to **variants of the active theme** (`themeChartPalette`
  — each branch hue on multi-colour themes, accent tints/shades on single-accent
  themes), overridable per datum. So a chart reads as part of the theme out of
  the box.
- It's a normal boxed element otherwise (move / resize / select / lock),
  but the **Colours / Border** context-menu categories are hidden — a
  chart styles per-datum via its Data category, not as one filled box. Its
  **Presets** grid holds the chart palettes (see Chart palettes).

## Chart types

A **chart type** is how a chart draws its data, named as Google Sheets names it. Nine ship; each is a chart kind
(the stored `shape`) and, for all but the first of its kind, a `chartVariant`:

A chart is **named by its type** wherever the editor names an element: the selection badge says "Selected Column
Chart" and a screen reader hears "Column chart", as the palette's tile says, never the kind's "Bar Chart"
(`elementKindLabel`, `kindLabel`).

| Chart type   | Kind (`shape`) | `chartVariant` | Draws                                                                                         |
| ------------ | -------------- | -------------- | --------------------------------------------------------------------------------------------- |
| Column       | `bar-chart`    | (none)         | Upright bars from a baseline, one per datum; several series side by side (below)              |
| Bar          | `bar-chart`    | `horizontal`   | Bars to the right from a left baseline, one per datum, top to bottom; several series likewise |
| Line         | `line-chart`   | (none)         | A line with point markers per series                                                          |
| Area         | `line-chart`   | `area`         | Line's lines, each with the area between it and zero filled in its colour at 25%, overlapping |
| Scatter      | `line-chart`   | `scatter`      | A point per category per series, no lines, at x = the category read as a number (below)       |
| Stepped Area | `line-chart`   | `stepped-area` | Each series a flat step across each category's slot, filled to zero as Area's (below)         |
| Combo        | `line-chart`   | `combo`        | Each series as columns, a line, an area or a stepped area over one set of categories (below)  |
| Pie          | `pie-chart`    | (none)         | Wedges clockwise from twelve o'clock                                                          |
| Doughnut     | `pie-chart`    | `doughnut`     | Pie's wedges with the middle open: a ring whose hole is 55% of its radius                     |

- A chart with no `chartVariant`, or one its kind does not take, draws as its kind's first type, so every chart
  made before chart types draws as it did.
- **Below zero on a column or bar chart.** The value range runs from the smallest value or zero, whichever is less,
  to the largest or zero, whichever is more, and the baseline is drawn at zero: a column for a negative value hangs
  below it (a bar runs left of it), as standard charts draw them. Its value reads under the column's end (left of a
  bar's), and a column's name stays under the whole plot, never in among the hanging columns. Show Axis covers the
  negatives too: its ticks run from a round value under the smallest to one over the largest, zero always a tick.
  A chart with no negative value draws exactly as before (the baseline at the plot's foot). Only a pie reads below
  zero as zero.
- **Several series on a column or bar chart** (clustered, as Google Sheets and Excel draw them): a column or bar
  chart holding two or more series (`lineSeries` over `lineCategories`, as a line chart's) draws each category as a
  group of bars side by side, one per series in series order (top to bottom on a bar chart), each in its series'
  colour (its own, else the palette's by its place). The group takes 80% of the category's share and each bar an
  equal part of it, at most 48 px thick. Each category's name sits under its group (left of it on a bar chart),
  cut to its share; the legend names the series. A bar's readout reads `category · series: value`, and Show Values
  prints each bar's number past its end. The value range, the baseline at zero, Show Axis and gaps are a single
  series' (a series with no value at a category leaves its place in the group empty). A chart with one series
  draws as it always has (`pieSlices`, one colour each) (default, D281).
- **Stacking** (Google Sheets' Setup › Stacking: None, Standard, 100%): a column or bar chart of two or more
  series, or an area or stepped area chart, may stack its series (`chartStack`), drawing Stacked Column, Stacked Bar,
  Stacked Area and Stacked Stepped Area, or their 100% kinds.
  - **Standard** (`stacked`): each category's values one on another in series order, the first from zero. A column's
    values above zero stack up from it and those below down from it (a bar's right and left), each its own stack;
    an area's series each fill the band between the running total before it and after it, its line along the top.
  - **100%** (`percent`): each value is its share of its category's total (its size over the sum of the sizes),
    stacked as Standard, so each stack reaches 100% (−100% below zero); the value axis's ticks read percents.
  - A stacked column or bar is one per category, 80% of its share and at most 48 px thick, square-cornered, each
    series a segment in its colour. Show Values prints each segment's own value (not its share) in its middle, in the
    ink that reads on its colour, when the segment is long enough to hold it; an area prints it over its point.
    A segment's readout reads `category · series: value`, as a group's bar's does.
  - No value counts as zero in its stack and draws no mark: no segment; on an area no point, its band no thicker
    there and its line broken; on a stepped area no step, its band no thicker there. The value range runs over the stacks' ends, zero always in it. A series on the right
    axis stacks on the one axis.
  - A chart of one series draws as it does unstacked; a line, scatter, pie or doughnut chart ignores stacking and
    keeps it, so a change back to a column, bar, area or stepped area chart stacks again (default, D282).
- **Smooth Line** (Google Sheets' Customise › Chart Style › Smooth): a line chart may draw each series' stretches as
  curves through its points (`chartSmooth`). Between two neighbours the curve keeps within their values, rising or
  falling as they do (a monotone cubic), so it never invents a peak or a dip the data does not hold. A gap still breaks
  it; points, readouts, values and the range are the line's. An area, scatter, column, bar, pie or doughnut chart
  ignores it and keeps it for a change back to a line chart (default, D284).
- **Stepped Area** (Google Sheets' Stepped Area chart): a line chart's data, each series drawn as steps.
  - The categories are evenly spaced as a column chart's are: each a slot, its name under it. A value is a flat step
    across its whole slot, at its height, and neighbouring steps of a series meet in an upright riser on their shared
    edge, so the outline runs as a staircase; the area under it fills to zero at 25%, overlapping, as an area's does.
    A step carries no point marker; its readout and Show Values' number sit over its middle.
  - No value is a gap: its slot holds no step, the staircase breaking there; a value with no neighbour is a step alone.
  - Stacking (Standard, 100%) stacks the steps as Stacked Area stacks its areas, each series the band between the
    running total before it and after it, flat across each slot (Stacked Stepped Area, 100% Stacked Stepped Area).
  - Unstacked, a series on the right axis draws on a second scale of its own, as an area chart's does; Smooth Line is
    ignored and kept (default, D289).
- **Combo** (Google Sheets' Combo chart): a line chart's data (`lineSeries` over `lineCategories`), each series drawn
  as its own **series type**: Column, Line, Area or Stepped Area (`LineSeries.type`). A series with no type of its own takes the
  default: the first half of the series, rounded up, are columns and the rest lines, so two series are a column and a
  line, three are two columns and a line (Google's Clustered Column - Line) (default, D286).
  - The categories are evenly spaced as a column chart's are: each a slot, its name under it. The column series are
    clustered in each slot as a column chart's several series are (80% of the slot, an equal part each, at most 48 px
    thick); a line series' points and an area series' points sit at the slots' middles, and a stepped area series'
    steps span the slots, as a Stepped Area chart's do (default, D289).
  - One value axis, zero always in it, runs over every series; a series on the right axis (`axis: 'right'`) is drawn
    on a second scale of its own, columns too, when another series is on the left.
  - Areas and stepped areas are drawn first, then columns, then lines, so a line reads over the columns it describes;
    each fills to zero at 25%, as an area chart's does.
  - Gaps are each series type's own: no column, a broken line, a broken area.
  - The legend keys a column, area or stepped area series by a square and a line series by a line through a dot. A mark's readout
    reads `category · series: value`; Show Values prints a column's number past its end and a point's over it.
  - Smooth Line curves its line series; stacking is ignored and kept.
  - A series' type is kept by any other chart type, unused, so a change back to Combo draws it again (default, D286).
- **No value is a gap.** A datum may have no value: a Sheet cell that is empty or holds no number (text, an error),
  a value left empty in the data editor, a CSV field that is empty or not a number. A 0 is a value and draws as 0.
  A chart draws no value as Excel ("Show empty cells as: Gaps") and Google Sheets do by default:
  - **Line**: the line breaks there; each run of values is its own stretch of line, and a value with no neighbour
    on either side is its point alone.
  - **Area**: the area breaks with the line; each run fills down to zero on its own.
  - **Stepped Area**: no step in its slot; each run of steps fills down to zero on its own.
  - **Scatter**: no point for that series at that x.
  - **Column** and **Bar**: no column (bar) in its slot; the slot and a column's name under the plot stay.
  - **Pie** and **Doughnut**: no wedge; the others share the whole; the category stays in the legend.
  - Every type: no value draws no value label (Show Values) and no readout (there is no mark to hover), and
    takes no part in the value range or Show Axis's ticks. A series with no value at all keeps its place in the
    legend and draws nothing. Changing type carries no value across as no value.
- **Scatter's x**: when every category reads as a number (`12`, `-3.5`, `1,200`), each point sits at its number on
  an x-axis running from the least to the greatest (widened by 1 when they are all equal), labelled at five evenly
  spaced values; otherwise the categories are evenly spaced, as Line's are, and labelled as Line's. A category left
  empty has no x: its points are not drawn, and it does not stop the others reading as numbers. Its readout reads
  `x · series: y`.
- **Scatter's point names**: a scatter chart may name its points, one name per category (`linePointNames`); a named
  point's readout reads `name, y, x`, its name, its value and its x, whatever series it is in (operator,
  2026-11-26), so a point drawn on a line series (a frontier over the others) still says whose it is. A point with
  an empty name reads as an unnamed one.
- **Scatter's value range** fits its values, as Google Sheets' does: from a round value under the least to one over the
  greatest, with zero in it only when the values cross it, so points far from zero spread over the plot rather than
  sit squeezed at its top over an empty band. Values all equal widen by half a unit either way. Line, Area, Column
  and Bar keep zero in range: a line's rise and an area or bar's size read against it.
- **The Chart Type section** opens first in the chart's Tools flyout, closed until opened (as every section is): a
  grid of nine tiles, each the type's glyph over its name, the chart's own type pressed. Hovering a tile previews
  nothing; picking one changes the chart, one undo step, `Element · Changed · ChartType`.
- **Changing type** keeps the chart's size, style, palette, legend and animation. Within a kind it only sets
  `chartVariant`. Across kinds it moves the data: a pie or bar chart's slices become one series named **Series 1**
  over their labels (their colours dropped, so the series takes the palette's first), and a line chart's first
  series becomes the slices over its categories (below zero read as zero on a pie). Two or more series stay series
  between a line and a column or bar chart, drawn side by side on the column chart; a pie keeps the first. A chart drawn from a Sheet
  re-reads its range as the new type at once.
- Who may: as every other chart change, someone who may edit the canvas (an Editor); a Participant and a Viewer get
  no Chart Type section.

## Model

Each chart is a `ShapeKind` (`'pie-chart'` / `'bar-chart'` / `'line-chart'`),
not a new top-level type — so they inherit boxed-element behaviour. `isChartShape`
groups all three (they're all in `isSelfDrawingShape` too).

- `ShapeElement.chartSmooth?: boolean`: Smooth Line (Chart types); absent means straight. A spreadsheet's chart sets it;
  a Plan chart has no control for it yet.
- `ShapeElement.chartStack?: 'stacked' | 'percent'`: Stacking (Chart types); absent means none. A spreadsheet's chart
  sets it ([Charts](../029-sheets/charts.md#the-model)); a Plan chart has no control for it yet.
- A bar chart of two or more series also carries `lineCategories` and `lineSeries`, drawn side by side; with
  fewer it draws its `pieSlices`.
- Pie + bar: `ShapeElement.pieSlices?: PieSlice[]` (`{ label, value, color? }`), `value` a number or `null`
  (no value, Chart types "No value is a gap").
- `ShapeElement.chartValues?: boolean`: the numbers on the marks (Show Values); absent means off.
- `ShapeElement.chartAxis?: boolean`: the value axis, its tick labels and gridlines (Show Axis); absent means off.
  A `LineSeries` may carry `axis?: 'right'`, its own scale (a second axis), `line?: true`, a scatter series
  drawn as a line, and `type?: 'column' | 'line' | 'area'`, its series type on a Combo chart; any other value of each
  reads as absent (an agent's write drops it). The
  axes are laid out with the marks, from `axisScale` and `axisLabelRoom` (`packages/document/src/chart-axis.ts`) for both renderers.
- `ShapeElement.chartTitle?: string` and `chartAxisTitles?: { x?, y? }`: a title over the chart, and the horizontal and
  vertical axis titles of a column, bar, line, area or scatter chart (a pie has none); each takes a band of the box from
  the plot, drawn the same on the canvas and in exports; absent or blank, none. A spreadsheet's chart sets them
  ([Charts](../029-sheets/charts.md#the-model)); a Plan chart has no control for them yet.
- Line: `ShapeElement.lineCategories?: string[]` + `lineSeries?: LineSeries[]`
  (`{ name, color?, values: (number | null)[] }`), aligned to the categories — a 2-D
  dataset; `null` is no value (Chart types "No value is a gap"). `LINE_DEFAULT_CATEGORIES` / `LINE_DEFAULT_SERIES` seed a fresh chart.
- Scatter: `ShapeElement.linePointNames?: string[]`, one name per category (Scatter's point names), each text;
  absent when its points have none. Validation refuses a list that is not of text, as it does a category.
- **Rows on the way in**: validation refuses a slice that is not `{ label, ... }`, a series that is
  not `{ name, values, ... }` and a category that is not text. A row that arrives malformed anyway
  (stored before, a peer's op, a file) is settled as it enters (`settleChartRows`): a slice or series
  that is not an object is dropped; a label, name or category that is not text reads as its number or flag written out, else as empty, and a series' values that are not a list as none, so categories keep their places.
- **No value on the way in**: a value is a finite number or no value. Validation takes any value in a series' list or
  a slice, so data stored before stays valid; every renderer reads one that is not a finite number (`null`, absent,
  text) as no value (`chartValue`, `packages/document/src/data-shapes.ts`). An agent's write is tidied first
  (`normaliseElements`): a value written as text that reads as a number (`"3"`) is that number, anything else
  `null`, and a series shorter than its categories is padded with `null`.
- All three share `pieAnim?` / `pieAnimSpeed?` / `pieAnimRepeat?` / `chartLegend?` / `chartLegendPosition?` and
  `chartVariant?` (`'horizontal' | 'area' | 'scatter' | 'doughnut'`, Chart types above); `chartTypeOf(el)` and
  `chartShapeOf(type)` map between a chart and its type, `chartTypeChange(el, type)` gives the patch that changes it
  (`packages/document/src/chart-types.ts`), and `pieMarks` / `barMarks` / `lineMarks`
  (`packages/document/src/chart-marks.ts`) lay out every type's marks for both the canvas views and the exporter, so
  the two never draw a chart differently. An exported chart's (and Sankey's) text names the theme's font, else the
  export's sans default, never bare: a standalone viewer drew bare text in its serif default.
  The types + constants + `isPieShape` / `isBarShape` / `isLineShape` /
  `isChartShape` live in `@livedoc/document` (`src/data-shapes.ts`).
- Rendered by `PieChartView` / `BarChartView` / `LineChartView`: SVG marks in the
  default palette or a per-mark colour, with a `ChartLegend`; the mark group
  carries the `lvd-pie-*` animation (CSS in `apps/live/app/canvas-motion.css`,
  reduced-motion-safe), the axes / labels stay still. `element-variant.ts` gives
  them a borderless wrapper. The shared layout `chartFrame` lives in
  `packages/document/src/chart-frame.ts` (re-exported from `apps/live/lib/chart.ts`,
  which holds `chartAnim`); the frame, readout and legend are drawn by
  `ChartSurface`; hover wiring in `useChartHover` + `ChartReadout`.
- CSV import (line): `parseCsvLineData` in `apps/live/lib/csv.ts` (quoted-field
  aware) turns a pasted/uploaded CSV into categories + series; a field that is empty or not a number is no value.
- Setters in `useChartSetters.ts`, exposed through `useElementStyle.ts`: `setPieDataSelected(slices)` (pie / bar),
  `setLineDataSelected(categories, series)` (line), + `setChartLegendSelected` /
  `setChartLegendPositionSelected` / `setPieAnimSelected`, all gated to chart
  shapes.
- Telemetry ([Telemetry + public transparency dashboard](../017-telemetry/telemetry.md)): `track('Element', 'Added', 'Pie-chart' | 'Bar-chart' |
'Line-chart')` on create, `track('Element', 'Changed', 'ChartData' | 'LineData'
| 'ChartAnim' | 'ChartLegend' | 'ChartType')` on edits.

Follows the composite-component pattern ([Timeline rail](timeline-rail.md)): a dedicated
`ShapeKind` + small `ShapeElement` fields + a bespoke `*View` + a borderless variant + a
context-menu category. New chart kinds reuse it under the same Data palette category.

## Charts drawn from a sheet

A chart may carry `chartSource` (a sheet and a range of it): its data is then read live from that Sheet's cells and
the element's own data is the last read ([Sheet charts](../029-sheets/sheet.md#charts)). Its Data menu offers
**Unlink From Sheet** in place of the data editor. A Scatter chart from a Sheet whose first column holds numbers (so
the read numbers its categories `1, 2, …` and makes that column a series) takes that column as its x and the other
columns as its series, as a spreadsheet's scatter chart does. A Scatter chart from a Sheet whose first column holds
text (not dates) beside two or more columns of numbers names its points by that column and takes the next column as
its x, the rest as its series (operator, 2026-11-26). A Column or Bar chart from a Sheet reads every series: one
draws as its slices, two or more side by side (Chart types, "Several series"). Each read keeps what its series carry beyond their
data, by position: a colour, `axis: 'right'` and `line: true`, so Right Axis and Lines survive the cells changing.

### Lines set by an agent

- `change_sheet`'s `chart` op takes `lines`: the header names of the series to draw as lines (`["Pareto"]`, any
  case), on a scatter chart only. A name that is no series of the chart, or `lines` on another type, is refused and
  writes nothing, naming the series it has.
- An edit operation sets them on an existing chart: `set <chart> lines=["Pareto"]` (the `lines` alias, on a line
  chart) marks the series of those names and unmarks the rest; `lines=[]` unmarks every one. A name that is no series
  of the chart is refused, naming those it has. It changes nothing else of the series, so a chart from a Sheet keeps
  reading its cells.

## Chart palettes

Without a chart-level palette, saying "this chart is greys" would mean opening
the data editor and setting a colour on every row by hand, and a row added later
would still come out in the theme's colours.

`chartPalette` (a `ChartPaletteId` from `packages/document/src/chart-palettes.ts`)
slots in as the middle rung: **per-datum colour > the chart's palette > the tab
theme's > the built-in ramp**. Stored as an id, so it keeps applying as the data
grows, and it never touches the data, so a slice somebody coloured on purpose
keeps its colour.

Eight ship, eight colours each: **Vivid** (the built-in ramp, named so it can be
picked deliberately rather than only landed on), **Ocean**, **Forest**,
**Sunset**, **Berry**, **Earth**, **Grey** (for print, and for a chart whose
point is the shape of the data), **Contrast** (maximally separated hues, for the
chart read from the back of a room).

They are the chart's **Presets** grid ([Style presets](../010-palette/style-presets.md)): a chart styles per slice from
its Data category, so a "look" for it is the ramp, not a fill and a border. The
grid's reset clears the palette, which is the one preset grid with something
real to reset to: following the theme again.

## Legend

A `legend` shape: a card of colour-coded rows, a dot and a label each, in the
**Data** palette category. It is a KEY, not a chart, so it carries no values and
no geometry to argue about, and nothing on it is clickable: the colours and the
words are edited from the menu's **Legend** section, where every other data
shape's rows are edited.

`legendItems` is `{ label, color? }[]`, bounded in `validate.ts`. The colour is
**optional** and falls back to the chart palette by index, which is what makes a
legend dropped beside a chart already match it: first row, first slice. A row
added from the menu is created with no colour for the same reason, so it picks up
the next colour rather than leaving a blank swatch to go and fill in. Setting a
legend's own `chartPalette` re-colours every uncoloured row, so a legend and a
chart set to the same palette stay in step. It is set from the **Palette** tiles at
the foot of the Legend section (the same eight as a chart's Presets, with a reset
back to the theme's ramp); the legend's Presets grid keeps the card looks, which
colour the card itself.

The **Legend** section also carries **Text Size** (the same slider, without Scale), on
the same `legendFontPx` scale as a chart's key, so a Legend beside a chart can
match it. The dot and row pitch scale with it.

Self-drawing (`isSelfDrawingShape`), so no centred label editing, and its wrapper
paints no box; `LegendView` draws the card from the element's fill + stroke, and
`svgLegendShape` draws the same thing for exports and thumbnails.

## Element tour

The **Chart tour** is on the actions group's **Start Chart Tour** button while a data chart (any of the nine chart types) is selected, once its kind is opted in to (Settings › Tours › Show Me), for an Editor on an unlocked element, and walks through it on the element
itself ([Element tours](../007-editor/element-tours.md) "The Chart tour").

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D101** A chart with no data: Empty `pieSlices` (or line arrays) render the sample data (default).
- **D102** Minimum rows in the menu / dialog editors: Remove is disabled at one row (slices, categories, series,
  checklist rows) (default).
- **D106** Readout copy: `label: value` (blank label shows an em dash glyph); line `category · series: value` (default);
  a named scatter point `name, y, x` (operator, 2026-11-26).
- **D107** Key strip when too small: Not rendered below 48 px wide (side) or 18 px tall (band) (default).
- **D281** Several series on a column or bar chart: side by side in a group taking 80% of its category's share, each
  bar an equal part of it and at most 48 px thick, the category named under (beside) its group; one series draws as
  before (default).
- **D284** Smooth Line: a monotone cubic through each stretch of a line chart's points (no overshoot past neighbours'
  values); other types ignore and keep it (default).
- **D286** Combo: a series with no type of its own: the first half, rounded up, columns, the rest lines; columns
  clustered in slots as a column chart's, points at the slots' middles; areas, then columns, then lines; one series a
  column; a series' type kept unused by other types (default).
- **D289** Stepped Area: steps span their category's slot, risers on the shared edges, no markers, filled to zero at
  25%; stacked as Stacked Area; unstacked, the right axis as an area's; a Combo's stepped area series likewise
  (default).
- **D282** Stacking: a column's values above and below zero in stacks of their own, an area's as a running total;
  100% as each value's size over the sum of its category's sizes; no value zero in the stack and no mark; one series
  unstacked; values printed mid-segment when they fit; other types ignore and keep it (default).
