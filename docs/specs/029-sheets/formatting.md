# Formatting

**Status: partly built.** Number formats, Font Size, Text Colour and Fill Colour are built.

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
  Duration, then the formats recently used, then **Custom Currency**, **Custom Date and Time**, **Custom Number
  Format**. Each shows an example of itself.
- The **recently used** are the Custom codes the open sheet's cells hold, up to five, the most cells first, each item
  its code with its example of 1000.12 beside it; one picked formats the selection with it, ticked while the active
  cell holds it. A sheet with none shows none, and no separator for them (default, D194).
- Each item's example is drawn beside it in the workbook's locale, as the grid would draw 1000.12, 26 September
  2008 15:59:00 or 24:01:00: **Number** 1,000.12, **Financial** (1,000.12), **Currency Rounded** £1,000 (D190).
- **Financial** draws a negative in brackets, `#,##0.00;(#,##0.00)`; **Currency Rounded** is Currency with no
  decimals, and Currency is ticked only while the cell shows decimals.
- **Format as Currency**, **Format as Percent**, **Decrease** and **Increase Decimal Places** on the toolbar.
- **Custom Number Format** dialog: a field for a format code with a live preview and the list of Google's examples;
  codes follow the shared grammar (sections for positive, negative, zero and text; `0`, `#`, `?`, `,`, `%`, `E+`,
  `@`, `[Red]`-style colours, `[h]` durations, conditions such as `[<1000]`).
  - The dialog is the shell's, titled **Custom Number Formats**; the field starts as the active cell's code (its
    format's code when it is not Custom), else `#,##0.00`.
  - The preview draws the active cell's value in the code, its colour included, else 1234.5; a code that cannot be
    read shows why in its place, announced politely, and **Apply** is dimmed.
  - The examples list (D193) shows each code with its preview of 1234.5; a press puts it in the field, never
    applies it.
  - **Apply** formats the selection with the code, one undo step; Cancel, Escape and × change nothing.
- **Custom Date and Time**: building blocks (Day, Month, Year, Hour, Minute, Second, AM/PM) each with its variants,
  arranged by the person.
  - The dialog is the shell's, titled **Custom Date and Time Formats**: the format as a row of parts, each block a
    choice of its variants and each piece of text between them a field; a part goes with its ×, and **Add** puts a
    block at the end.
  - Variants (D197): Day `d` 5, `dd` 05, `ddd` Tue, `dddd` Tuesday; Month `m` 8, `mm` 08, `mmm` Aug, `mmmm` August,
    `mmmmm` A; Year `yy` 30, `yyyy` 1930; Hour `h`, `hh`; Minute `m`, `mm`; Second `s`, `ss`; AM/PM `AM/PM`, `A/P`.
  - It starts from the active cell's format when that draws a date or a time, else from Date's; the presets (D198)
    replace the row with theirs.
  - The preview draws the active cell's value, else 26 September 2008 15:59:00, in the code the row makes. A Minute
    reads as a Month unless it follows an Hour or comes before a Second, as in every format code; the preview shows
    it as it will be drawn.
  - **Apply** formats the selection with the code as Custom, one undo step; an empty row dims it.
- **Custom Currency**: a searchable list of currencies, each with its symbol placements.
  - The dialog is the shell's, titled **Custom Currencies**: a search field, the currencies the browser knows (each
    its name in the workbook's locale, its ISO code and its symbol), sorted by name, matched by any of the three.
  - Picking one shows its formats, each with its preview of 1000.12: the symbol before or after, with two decimals
    or none (`"€"#,##0.00`, `"€"#,##0`, `#,##0.00"€"`, `#,##0"€"`) (default, D195).
  - **Apply** formats the selection with the format's code as Custom, one undo step; nothing is picked as it opens,
    and Apply is dimmed until a currency and a format are (default, D196).
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

- **Font**: the toolbar's Font control, the office kinds' ([Fonts](../004-interface-design/fonts.md#the-font-menu)):
  **More Fonts**, the families recently chosen, then My Fonts, each in its own face.
  - A spreadsheet cell's font is a family by name, as files write it (`Roboto Mono`); a Plan Sheet's stays an editor
    font by id ([Sheet](sheet.md#formatting)). One key holds either: a name shaped as an editor font's id (lower case,
    digits and hyphens) is read as one, any other name as a family.
  - A cell with none draws in the spreadsheet's default family, Arial, Google Sheets' own, and the control shows
    "Arial"; choosing Arial stores none (default, D201).
  - A family draws through its stack ([Substitution](../004-interface-design/fonts.md#substitution)): a served family
    in LiveDoc's faces, a named one in itself then its stand-in, any other from Google Fonts where reachable, else as
    Arial.
  - Lines break by the family's own widths, as every cell's do ([Row height](sheet.md#row-height)): a served family
    by its own, a named one by its stand-in's, any other family by Arial's stand-in's, Arimo (default, D202).
  - Choosing one sets the selection's font, one undo step; an Editor's, as every format is.
- **Font Size**: any whole size from 6 to 400 points, 10 by default, Plan Sheets' cells alike (one engine).
  - The toolbar's field shows the active cell's size; a size typed is rounded whole and kept within 6 to 400.
  - Its minus and plus take one point off or on (D128); Format › Font Size lists Google's sizes.
  - A Plan Sheet's stepper steps through its presets, then by ten points from 80 to 400 (default, D200).
- **Bold** (Ctrl+B), **Italic** (Ctrl+I), **Underline** (Ctrl+U), **Strikethrough** (Alt+Shift+5).
- **Text Colour** and **Fill Colour**: the one colour picker, with the theme's colours, the standard grid,
  **Custom** and **Reset**.
  - Each is the toolbar's colour control: its glyph over a bar in the active cell's colour (Text Colour's bar black
    for a cell with none, Fill Colour's empty), opening the picker in its swatch skin; a pick colours the selection,
    one undo step, and **Reset** takes the cell's own colour away. An Editor's, as every format is.
  - Until [Themes](#themes) are built the picker has no theme row: Reset, the standard Light and Dark rows, then
    Custom Colours, as the office kinds' is (default, D199).

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
- **D193** The Custom Number Formats dialog's examples: `0.00`, `#,##0`, `#,##0.00`, `0%`, `0.00%`, `0.00E+00`,
  `£#,##0.00`, `#,##0.00;[Red]-#,##0.00`, `#,##0.00;(#,##0.00)`, `[<1000]0;[<1000000]0.0,"K";0.0,,"M"`,
  `dd/mm/yyyy`, `hh:mm`, `[h]:mm:ss`, `"Total: "@` (default).
- **D194** The Number menu's recently used: The Custom codes the open sheet's cells hold, up to five, the most cells
  first; nothing new is saved for them (default).
- **D195** Custom Currencies' formats: The symbol before or after, with two decimals or none (default).
- **D196** Custom Currencies as it opens: Nothing picked, the first format ready once a currency is; Apply dimmed
  until then (default).
- **D197** Custom Date and Time's blocks: Day, Month, Year, Hour, Minute, Second, AM/PM, with the variants listed
  (default).
- **D198** Custom Date and Time's presets: `dd/mm/yyyy`, `d mmmm yyyy`, `dddd, d mmmm yyyy`, `mmmm yyyy`, `yyyy-mm-dd`,
  `hh:mm`, `hh:mm:ss`, `h:mm AM/PM`, `dd/mm/yyyy hh:mm:ss` (default).
- **D199** Text Colour and Fill Colour before Themes: Reset, the standard Light and Dark rows and Custom Colours, the
  office kinds' picker (default).
- **D200** A Plan Sheet's Font Size stepper past its last preset (72): by ten points, 80, 90, ... 400, as Word's grow
  steps (default).
- **D201** A spreadsheet cell's font when it sets none: Arial, Google Sheets' default and the family its files write
  (default).
- **D202** The widths a family outside the served ones breaks lines by: its stand-in's, else Arimo's, Arial's
  stand-in (default).

## Telemetry

`Spreadsheet · Changed · <Kind>`: `Format`, `NumberFormat`, `Border`, `Merge`, `Theme`, `ConditionalFormat`,
`Banding`, `ClearFormat`.
