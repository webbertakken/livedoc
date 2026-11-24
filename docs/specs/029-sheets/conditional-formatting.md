# Conditional formatting

A [sheet](sheet.md)'s **format rules** draw cells by their values: a cell meeting a rule's condition takes the rule's
style (bold, a colour, a fill), or a **colour scale** shades a range's numbers from one colour to another. A rule is
the sheet's, seen by everyone, and worked out in every browser that shows it, as values are.

## Domain language

| Term             | Means                                                                                                  | Never called                       |
| ---------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| **format rule**  | A range of a sheet, and a condition with the style its cells take when they meet it, or a colour scale | conditional format, highlight rule |
| **condition**    | What a cell's value must meet: the filter's conditions, or a custom formula                            | criterion, test                    |
| **style**        | What a met condition draws: bold, italic, underline, strikethrough, text colour, fill colour           | format (a cell's own)              |
| **colour scale** | A rule shading each number in its range between two or three colours by where it sits                  | gradient, heat map                 |

- A cell's **format** stays its own: a format rule draws over it while the condition holds and never changes what is
  stored. Clear Formatting clears the cell's format, never a format rule.

## Rules

- A **range**: one rectangle, by its corner cells' row and column ids, as a [validation rule](data-validation.md)'s,
  so it grows with insertions inside it, shrinks with deletions and goes when every cell does.
  - A range may be **several rectangles**, typed with commas (`A1:A10,C1:C10`), at most `FORMAT_RULE_RANGES_MAX`.
  - The first is the rule's **anchor**: a custom formula is written for its top-left cell.
  - Each rectangle shrinks on its own; one whose cells all went is dropped, and the rule goes with the last one.
  - When the anchor goes, the next rectangle becomes the anchor and a custom formula moves to its top-left cell.
  - A cell in two of a rule's rectangles is that rule's once: drawn once, and counted once in a colour scale.
  - Several ranges and the formula's reach below hold for every sheet, a Plan Sheet's too (default, D214).
- **Single Colour**: a condition and a style.
  - The conditions are the [filter](sheet.md#filter)'s, worded as in Google Sheets: **Is Empty**, **Is Not Empty**,
    **Text Contains**, **Text Does Not Contain**, **Text Starts With**, **Text Ends With**, **Text Is Exactly**,
    **Date Is Before**, **Date Is After**, **Date Is**, **Greater Than**, **Greater Than or Equal To**, **Less Than**,
    **Less Than or Equal To**, **Is Between**, **Is Equal To**, **Is Not Equal To**, and **Custom Formula Is**. Each
    reads the cell's value as the filter does (text case aside, as shown).
  - **Custom Formula Is**: a formula written for the range's top-left cell (`=$C2>100`, `=ISODD(ROW())`), read for
    every other cell with its relative references moved by that cell's offset (up or left of it in a later rectangle
    of several), as a fill moves them; the cell meets
    the condition when the formula's value is TRUE or a number other than 0. A formula that cannot be read is not
    saved: the editor says why under its field. An error meets nothing. Deleting the range's top row or left column
    moves the formula to the new top-left cell: its relative references on the sheet keep their offsets from that
    cell, as in Google Sheets (`=$C2>100` on A2:A10 with row 2 deleted is `=$C2>100` on A2:A9, reading the old C3).
    The formula may read the workbook's other sheets (`=Totals!$B$1>0`, which no deletion here moves) and its named
    ranges (`=A1>Limit`).
  - The style: any of **Bold**, **Italic**, **Underline**, **Strikethrough**, **Text Colour**, **Fill Colour** (the
    one [colour picker](../004-interface-design/colour-picker.md)). A new rule starts with a light green fill
    (`#b7e1cd`) and dark green text (`#137333`), as Google Sheets' does; six **preset styles** sit above the controls (**Green Fill**, **Red Fill**, **Yellow Fill**, **Blue Fill**, **Bold Text**
    and **Struck Through Text**, each a small "123" swatch drawn in it).
- **Colour Scale**: a **Minpoint**, an optional **Midpoint** and a **Maxpoint**, each a colour and where it sits:
  **Min Value** (the range's smallest number; the Minpoint only), **Max Value** (the largest; the Maxpoint only),
  **Number**, **Percent** (of the way from the smallest to the largest) or **Percentile** (of the range's numbers).
  A number at or below the Minpoint takes its colour, at or above the Maxpoint its colour, and between them a blend in
  sRGB by where it sits. Only numbers are shaded; empty cells, text and errors are not. Seven **preset scales** sit
  above the points (white to green, green to white, white to red, red to white, green-yellow-red, red-yellow-green,
  white to blue). A new scale starts white to green (`#ffffff`, `#57bb8a`).

### Which rule draws a cell

- Rules are in a **list order**, first to last. For each cell, the first rule (in list order) whose range covers it
  and whose condition it meets draws it (a colour scale meets every number it covers); later rules do not, as in
  Google Sheets.
- A met rule's style keys draw over the cell's own (a rule with only a fill keeps the cell's bold), and a colour
  scale sets the fill alone. The drawn colours go through [Readable cells](sheet.md#readable-cells) as a cell's own do.
- Format rules draw everywhere the grid is drawn: on the canvas, maximised, filling a tab, in a Dashboard slot, and in
  exports, images and api or MCP renders (the static render works them out from the same engine).

## In a spreadsheet

**Status: in progress.** The side panel, several ranges, other sheets in a formula and XLSX files are built;
ODF files are not.
The rules above carry into the [spreadsheet](spreadsheet.md), with these changes
([Formatting](formatting.md#conditional-formatting)):

- The **Conditional Format Rules** side panel replaces the popover: the office shell's right panel
  ([Side panels](../004-interface-design/office-shell.md#side-panels)), opened by **Format › Conditional Formatting**,
  an on/off check, an Editor's alone. Its body is the popover's: the rule list for the selection (or every rule),
  Move Up, Move Down and Delete Rule, **Add Another Rule**, and the rule form drawing its preview.
  - It follows the selection while it stays open: a new selection lists the rules touching it (default, D213).
  - Done in the form returns to the list and keeps the panel open; Escape or × closes it and the keys go back to the
    grid.
- A rule's range may be several ranges (`A1:A10,C1:C10`), as on every sheet ([Rules](#rules)).
- **Custom Formula Is** may read other sheets of the workbook, and named ranges ([Rules](#rules)).
- ODF keeps rules as `calcext:conditional-formats`, XLSX as `conditionalFormatting`
  ([Format rules in the file](standard-mapping.md#format-rules-in-the-file)).

## Making and changing rules

- The toolbar's **Data** category gains **Conditional Formatting** (after Data Validation, with the rules); the cell
  menu gains **Conditional Formatting…** in its formatting group.
- It opens the **Conditional Formatting** popover (the shared popover, 24 rem wide, anchored to what opened it, the
  height of the window at most and scrolling inside):
  - The **rule list**: the rules whose range touches the selection (**Show All Rules** shows every rule on the sheet,
    a switch at the top), each a row with a swatch drawn in its style ("123" in the style, or the scale's gradient), its
    line ("Greater Than 100", "Custom Formula Is =$C2>100", "Colour Scale") and its range; a press opens it in the
    rule form; **Move Up** and **Move Down** (icon buttons with tooltips) reorder it in the list; **Delete Rule** (a bin)
    removes it. "No format rules on these cells yet." when there are none.
  - **Add Another Rule** at the foot opens the rule form on a new Single Colour rule over the selection, placed last.
  - The **rule form**: **Apply to Range** (an A1 range field), a **Single Colour** / **Colour Scale** switch, then
    the condition (a select, and its one or two values, or the formula field) and the style, or the scale's points;
    **Cancel** and **Done** at the foot (Done writes the rule, one change, one undo step, and returns to the list).
  - While the form is open, the rule as it stands draws on the grid for the person editing it alone (a preview,
    never sent); Cancel takes it away.
- **Sheet Settings** gains a **Conditional Formatting** section (after Data Validation): every rule as a row (its
  swatch, line and range), **Edit** (the popover's rule form, anchored to the row), **Go To** and **Remove**; "No format
  rules yet. Select cells and choose Conditional Formatting from the toolbar's Data menu." when there are none ("No
  format rules." for a Participant or Viewer, who has no toolbar). Edit and Remove are an Editor's.
- Telemetry: `Sheet · Changed · ConditionalFormat` for each rule change (made, edited, reordered, removed); never the
  condition's values.

## Who may do what

| Role        | May                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Editor      | Make, edit, reorder and remove format rules                                                                                    |
| Participant | See the rules draw, as their cells change; never make or change one (no menu offers it, and the api refuses the layout change) |
| Viewer      | See the rules draw                                                                                                             |

## Copies and the clipboard

- A copied sheet keeps its format rules. Copy and paste carry the cells' own formats, never a rule's style; sort moves
  values under the rules, which stay where their ranges are.
- **Clear Sheet** removes every rule.

## Agents

- `change_sheet` gains `conditional_format` (a range and either `when: { condition, value?, value2?, formula? }` with
  a `style` (the `format` op's bold, italic, underline, strikethrough, color and background), or `scale: { min, mid?,
max }`, each point `{ color, type: "min" | "max" | "number" | "percent" | "percentile", value? }`), added last, and
  `clear_conditional_formats` (every rule touching a range, or all with no range).
  A range may be several, with commas (`A1:A10,C1:C10`).
- `read_sheet` lists the format rules in order (range, condition or scale, style), several ranges with commas.

## Limits

- At most **100** format rules a sheet (`FORMAT_RULES_MAX`), each of at most **100** rectangles
  (`FORMAT_RULE_RANGES_MAX`, default, D214); a custom formula up to 1,000 characters
  (`FORMAT_RULE_FORMULA_MAX`); a condition's values up to 255 characters each.

## Performance

- Drawing looks up each visible cell's rules through an index built once per layout (rules bucketed by column), in
  list order.
- A colour scale's smallest and largest numbers (and its percentiles) are worked out once per recalculation (the
  workbook's version), never per cell or per frame.
- A custom formula is moved for a cell once per offset and kept until the next recalculation; its value is worked out
  for visible cells only, through the engine's budget, and never kept in the workbook's values or its dependencies.
- A sheet without format rules pays nothing.
