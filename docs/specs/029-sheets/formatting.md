# Formatting

**Status: specified.** Nothing is built.

How a [spreadsheet](spreadsheet.md)'s cells are drawn: number formats, text, colours, borders, alignment, merges,
themes, conditional formatting and alternating colours, as Google Sheets does. Its rows of the
[parity matrix](parity-matrix.md) name this page. Both file formats keep every rule below
([Standard mapping](standard-mapping.md)).

## Styles in the model

- A cell's format is a **style**: the workbook keeps each distinct style once and a cell holds its style's id, as
  both formats do (ODF's automatic cell styles, XLSX's `cellXfs`). Changing a cell's bold makes or reuses another
  style; nothing is copied per cell.
- A style's id is the workbook's own, made where the workbook is stored, in the order styles first appear
  (`s1`, `s2`, ...); two formats that mean the same, whatever order their parts came in, are one style (default).
- A style holds: number format (a format code), font family and size, bold, italic, underline, strikethrough, text
  colour, fill colour, the four borders (style, width, colour), horizontal and vertical alignment, wrapping,
  rotation, and indent where a file brought one.

## Number formats

- **Format › Number** and the toolbar's **More Formats**: Automatic, Plain Text, Number (`#,##0.00`), Percent
  (`0.00%`), Scientific (`0.00E+00`), Accounting, Financial, Currency, Currency Rounded, Date, Time, Date Time,
  Duration, then **Custom Currency**, **Custom Date and Time**, **Custom Number Format**, and the formats recently
  used in the workbook. Each shows an example of itself.
- Each item's example is drawn beside it in the workbook's locale, as the grid would draw 1000.12, 26 September
  2008 15:59:00 or 24:01:00: **Number** 1,000.12, **Financial** (1,000.12), **Currency Rounded** £1,000 (D190).
- **Financial** draws a negative in brackets, `#,##0.00;(#,##0.00)`; **Currency Rounded** is Currency with no
  decimals, and Currency is ticked only while the cell shows decimals.
- **Format as Currency**, **Format as Percent**, **Decrease** and **Increase Decimal Places** on the toolbar.
- **Custom Number Format** dialog: a field for a format code with a live preview and the list of Google's examples;
  codes follow the shared grammar (sections for positive, negative, zero and text; `0`, `#`, `?`, `,`, `%`, `E+`,
  `@`, `[Red]`-style colours, `[h]` durations, conditions such as `[<1000]`).
- **Custom Date and Time**: building blocks (Day, Month, Year, Hour, Minute, Second, AM/PM) each with its variants,
  arranged by the person.
- **Custom Currency**: a searchable list of currencies, each with its symbol placements.
- A code's **sections** are chosen as Google's are: with no condition, the first for a positive number, the second for
  a negative (its minus left to the code), the third for zero, the fourth for text. With a condition (`[<1000]`,
  `[>=0]`, `[=1]`, `[<>0]`), the first section whose condition holds draws the number, a section with none takes
  the rest, and the number keeps its minus; with no section left, it is drawn as Automatic (default, D191).
- A section's **colour** (`[Black]`, `[White]`, `[Red]`, `[Green]`, `[Blue]`, `[Yellow]`, `[Magenta]`, `[Cyan]`, any
  case) draws its text in that colour over the cell's own text colour; a met conditional format's colour draws over
  both (default, D192). `TEXT` takes the section, never the colour.
- A code that cannot be read is refused with why: "`[` is not closed", "`"` is not closed", "More than four
  sections", "`[Purple]` is not a colour or a condition", "Longer than 255 characters".
- Format codes map to ODF data styles and to XLSX `numFmts` both ways; this mapping is a shared piece used by
  plan 0019 too ("Charts, number and date formats, formulas in a table").
- Automatic shows a number as typed (`12%` stays a percent), as today ([Formulas](formulas.md#what-a-typed-input-becomes)).

## Text and colour

- **Font**: the document fonts (0019's shared catalogue), with **More Fonts** and the recently used; **Font Size** 6
  to 400 points, with minus and plus.
- **Bold** (Ctrl+B), **Italic** (Ctrl+I), **Underline** (Ctrl+U), **Strikethrough** (Alt+Shift+5).
- **Text Colour** and **Fill Colour**: the one colour picker, with the theme's colours, the standard grid,
  **Custom** and **Reset**.

## Borders

- **Borders**: All, Inner, Horizontal, Vertical, Outer, Left, Top, Right, Bottom, Clear; a colour; a style (thin,
  medium, thick, dashed, dotted, double). Shortcuts Alt+Shift+1 to 7 as the matrix lists.

## Alignment, wrapping, rotation

- Horizontal: Left, Centre, Right (Ctrl+Shift+L, E, R); vertical: Top, Middle, Bottom.
- Wrapping: Overflow, Wrap, Clip.
- Rotation: None, Tilt Up, Tilt Down, Stack Vertically, Rotate Up, Rotate Down, and **Custom Angle** (−90° to 90°).

## Merges

- **Merge All**, **Merge Vertically**, **Merge Horizontally**, **Unmerge**. Merging cells that hold more than one
  value asks first: "Merging cells will only preserve the top-leftmost value." **OK** or **Cancel**.

## Paint format and clearing

- **Paint Format**: a click copies the active cell's style to the next selection; a double-click keeps it for several.
- **Clear Formatting** (Ctrl+\\) resets the selection's style to the workbook's default.

## Themes

- **Format › Theme** opens a side panel of themes (each a font and six accent colours, a text and a background);
  picking one restyles the workbook's charts, tables, alternating colours and cells using theme colours.
  **Customise** edits the theme's font and colours. Themes are LiveDoc's own set, never Google's names.

## Conditional formatting

Iterated from today's spec ([Conditional formatting](conditional-formatting.md)) to Google's panel: **Single
Colour** (every condition of Google's list, including Custom Formula Is) and **Colour Scale** (min, mid, max points by
value, number, percent or percentile), rules in order, the first matching rule drawing a cell.

## Alternating colours

- **Format › Alternating Colours**: a side panel with Header and Footer switches, default styles and a custom one
  (header, colour 1, colour 2, footer, each from the colour picker), over a range. Writes as banding in both formats
  where they hold it, else as a format rule.

## Tables

Convert to Table is a data tool ([Data tools](data-tools.md#tables)); its look is themed here.

## Who may do what

- **Editor** only: every format change. A Participant's change of formats alone is refused, as today ("Only an
  editor can format a spreadsheet's cells").

## Errors and limits

- Up to 64,000 distinct styles in a workbook (XLSX's practical ceiling, assumed); past it a change reuses the
  nearest style and says so.
- A format code that cannot be read is refused in the dialog with why ([Number formats](#number-formats)).

## Defaults

- **D190** The Number menu's examples: 1000.12, 26 September 2008 15:59:00 and 24:01:00, drawn in the workbook's
  locale as the grid would (default).
- **D191** A code with conditions: The first section whose condition holds, else the first with none; the number
  keeps its minus; none left, Automatic (default).
- **D192** A code's colour: Over the cell's text colour, under a met conditional format's; never in `TEXT` (default).

## Telemetry

`Spreadsheet · Changed · <Kind>`: `Format`, `NumberFormat`, `Border`, `Merge`, `Theme`, `ConditionalFormat`,
`Banding`, `ClearFormat`.
