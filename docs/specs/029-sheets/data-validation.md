# Data validation

A [sheet](sheet.md)'s **validation rules** say what a range of cells may hold: one of a dropdown's options, a
checkbox's TRUE or FALSE, a number or date within limits, or text of a kind. A rule is the sheet's, seen by everyone,
and checked wherever a value is written: in the editor before it is sent, and by the api before it is stored.

## Domain language

| Term                | Means                                                                                                   | Never called                |
| ------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------- |
| **validation rule** | What a range of a sheet's cells may hold, and what happens to a value that breaks it                    | constraint, validator       |
| **dropdown**        | A rule whose cells hold one of a list of **options**; in the interface, **Dropdown**                    | select, picker, list cell   |
| **option**          | One value a dropdown offers: its text and, optionally, its colour                                       | item, choice (in this spec) |
| **chip**            | A dropdown cell drawn as its value on a rounded pill in the option's colour, with an arrow              | tag, badge, label           |
| **checkbox**        | A rule whose cells hold TRUE or FALSE, drawn as a box ticked for TRUE; in the interface, **Checkbox**   | tick box, toggle            |
| **invalid value**   | A value a rule does not allow, kept (a **Warn** rule, a formula's result, a value from before the rule) | error (a formula's)         |

- A Plan [card table](sheet.md#card-tables)'s column **Dropdowns** (a card field's set values) stay the card table's
  own; they are not validation rules and never stored as one. A validation rule on a card table's cells is checked
  as on any cell, before the row's Save checks the card.

## Rules

| Rule                      | Cells hold                                                                                                                       | Interface name          |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Dropdown**              | One of the rule's options, typed into the rule (up to 500)                                                                       | Dropdown                |
| **Dropdown from a Range** | One of the values of a range on this sheet or another the sheet's formulas can read (`A2:A20`, `Sheet2!A2:A20`), read as shown   | Dropdown (From a Range) |
| **Checkbox**              | TRUE or FALSE, or its **custom cell values**; an empty cell is unticked                                                          | Checkbox                |
| **Number**                | A number: between, not between, greater than, greater than or equal to, less than, less than or equal to, equal to, not equal to | Number                  |
| **Date**                  | A date: is a valid date, before, on or before, after, on or after, on, between, not between                                      | Date                    |
| **Text**                  | Text: contains, does not contain, is exactly, is a valid email, is a valid URL                                                   | Text                    |
| **Custom Formula Is**     | A value for which the rule's formula, written for the range's top-left cell and moved to each cell, answers TRUE                 | Custom Formula Is       |

Every rule also has:

- **If the Value Isn't Allowed**: **Reject the Value** (the default) or **Show a Warning**.
- **Help Text** (optional, up to 255 characters): shown when a value is refused, on hovering an invalid value, and in
  the rule's row; without it the rule's own line says what is allowed (below).
- A **range**: one rectangle of the sheet, by its corner cells' row and column ids, as a merge or a named range is, so
  it grows with rows and columns inserted inside it, shrinks with ones deleted, and follows its corner cells when they
  move. A rule whose cells are all deleted goes.

A **Dropdown from a Range**'s range is kept the same way, on its own sheet: rows and columns deleted there shrink it
in the same change (one undo puts it back), as a formula's reference into that sheet shrinks
([Formulas](formulas.md)); a rule whose range is all deleted goes. A range on a sheet that is deleted offers nothing:
the rule's line says "Choose one of the listed values" and its cells' values are marked invalid until the rule is
edited. The range field reads `A2:A20` on the rule's own sheet and `Sheet2!A2:A20` (or `'My Sheet'!A2:A20`) on
another; a sheet that is not there says "Type the range to take options from, like A2:A20".

A Checkbox may **Use Custom Cell Values**: a **ticked value** (1 to 255 characters) and, optionally, an **unticked
value** (without it, unticked is the empty cell), as Google Sheets' checkbox does. Its cells then hold those values,
never TRUE or FALSE; the two differ, case aside. A value that reads as a number (`1`, `-2.5`) is stored as that number,
any other as text.

A **Custom Formula Is** rule's formula is written for the range's top-left cell, its references moving to each cell as
a copied formula's do (a conditional format's Custom Formula Is moves the same way), up to 1,000 characters. A value is
allowed when the formula answers TRUE or a number other than 0; any other answer, an error included, refuses it.

A dropdown also has its **Display**: **Chip** (the default), **Arrow** (the value, and an arrow at the cell's right)
or **Plain Text** (the value alone; the arrow shows on the active cell only).

## In a spreadsheet

**Status: partly built.** The side panel, Insert › Checkbox, Insert › Dropdown, Use Custom Cell Values, Custom
Formula Is and a Dropdown from a Range on any sheet are built; the rest is specified.
The rules above carry into the [spreadsheet](spreadsheet.md), with these changes
([Data tools](data-tools.md#data-validation)):

- The Data Validation Rules **side panel** replaces the popover (an Editor's, as every side panel that writes):
  - It lists the open sheet's rules, each its short line and its range, pressed to edit it in the rule form, with a
    **Delete Rule** button; "No validation rules on this sheet yet." when there are none; **Add Rule** opens the form
    on a new rule over the selection (a Dropdown of the values in it, as the popover's).
  - The form is the popover's, in the panel's frame and under its title; Done, Cancel and Remove Rule return to the
    list, the panel still open.
  - **Data › Data Validation** and a context menu's **Data Validation** open it on the rule at the active cell, else
    on the list; **Insert › Dropdown** opens it on a new Dropdown over the selection; **Insert › Checkbox** makes a
    Checkbox rule over the selection at once, without the panel (one change, one undo step).
- **Dropdown from a Range** may read a range of **any sheet** of the workbook (`Sheet2!A2:A20`) ([Rules](#rules)); a
  Plan Sheet's, any sheet of its tab.
- **Checkbox** takes **Use Custom Cell Values** (a ticked and an unticked value), and the rules gain **Custom Formula
  Is** ([Rules](#rules)); both are the Plan Sheet's too, the rule form being one.
- A dropdown's options take **colours** (the one colour picker), drawn on its chips; **Allow Multiple Selections**
  holds several options in one cell, comma-separated.
- Both file formats keep every rule ([Standard mapping](standard-mapping.md)); a criterion a format lacks is kept for
  LiveDoc as unknown content and listed on conversion.

## Where values are checked

- Checked: a typed edit (the cell, the formula bar, **Ctrl+Enter** into every selected cell), a dropdown pick, a
  checkbox toggle, **Paste**, **Paste Values Only**, the fill handle, **Ctrl+D** and **Ctrl+R**, **Replace** and
  **Replace All**, and an agent's `set` ([Agents](#agents)).
- Not checked, written as they are (an invalid value is then marked): **Undo** and **Redo**, **Import CSV**, a card
  table's rows written from their cards, a sheet template's start, a copied sheet, and a formula (its result is shown
  and, if not allowed, marked).
- Clearing a cell (Delete, Backspace, Clear) is always allowed.
- A value is checked as stored: a typed `12%` is `0.12`, a typed date its day number. Text is compared case aside, and
  a dropdown option typed in another case is saved in the option's own spelling (`done` → `Done`).
- **Rejected in the editor**: the cell stays in edit, and the line under the editor says why, as for a formula that
  cannot be read ([Writing formulas](sheet.md#writing-formulas)). A paste, fill, Replace All or Ctrl+Enter that would
  write any value a Reject rule refuses writes nothing and says why in a toast, naming the first cell
  (`B4: Choose one of the dropdown's options`).
- **Warned**: the value is saved and its cell marked.
- **Rejected by the api**: a write the editor would have refused is refused by the api too, with `value_invalid` and
  the cell, so an agent or another client cannot store what a Reject rule refuses. The api checks Dropdown, Checkbox,
  Number, Date and Text rules; a **Dropdown from a Range**'s options and a **Custom Formula Is** rule's answer are
  worked out in the browser (they are formulas' results), so only the editor checks those. Undo and Redo (sent with
  `undo`) and the writes listed above as not checked (sent with `unchecked`) are stored as they are: the flag only skips the rule check, never the limits or
  the role check, and a person may already write any value into those cells by clearing the rule.

### What each rule allows, and its line

| Rule                  | Allows                                                                                         | Line when refused (no Help Text)                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Dropdown              | Text equal to an option, case aside; a number or true/false equal to an option's text as typed | Choose one of the dropdown's options: To Do, Doing, Done (the first 5, then "and 3 more")  |
| Dropdown from a Range | A value equal to one of the range's shown values (empty ones aside), case aside                | Choose one of the values in A2:A20 (Sheet2!A2:A20 on another sheet)                        |
| Checkbox              | TRUE or FALSE                                                                                  | This cell is a checkbox: type TRUE or FALSE                                                |
| Checkbox, custom      | Its ticked or unticked value, case aside                                                       | This cell is a checkbox: type Yes or No (no unticked value: "type Yes, or leave it empty") |
| Custom Formula Is     | A value the formula answers TRUE for, worked out with the cell read as that value              | Enter a value that meets the rule's formula                                                |
| Number                | A number meeting the condition                                                                 | Enter a number between 1 and 10 (greater than 5, ...)                                      |
| Date                  | A date (a number formatted, or read, as a date) meeting the condition                          | Enter a date after 01/10/2026 (in the person's locale)                                     |
| Text                  | Text meeting the condition (a number is read as it is shown)                                   | Enter text that contains “ref” / Enter an email address / Enter a web address              |

- An email is `something@something.something` with no spaces; a web address starts with one of Google's link
  schemes (`http://`, `https://`, `ftp://`, `gopher://`, `telnet://`, `news://`, `mailto:`, `aim:`), or is a domain with
  a dot (`docs.nu/help`).
- A Custom Formula Is rule checks a typed value by working the formula out with its cell read as the new value (the
  formula and every formula between it and the cell, as MULTIPLE.OPERATIONS does), the workbook untouched; a paste or
  fill checks each cell with only that cell read anew. The invalid mark works the formula out on the cell as it is.
- A Date rule's dates are stored as day numbers; `Is a Valid Date` allows any number from 1 (31 December 1899) to
  2,958,465 (31 December 9999).

## Drawing

- **Chip**: the value on a rounded pill (the text's line height and 6 px, 6 px in from the cell's left, as wide as the
  text and its arrow, never wider than the cell), in the option's colour, or the Sheet's quiet column tint when it has none; its ink black or white,
  whichever meets WCAG AA on the pill. An empty cell draws the arrow alone, quietly. A cell's own fill shows around the
  pill.
- **Arrow**: the value as the cell draws it, and a small down arrow inside the cell's right edge, in the room a
  dropdown column keeps (as a card table's does).
- **Plain Text**: the value alone; the active cell shows the arrow.
- **Checkbox**: a 14 px box centred in the cell (its alignment aside), ticked in the cell's text colour (else the
  Sheet's brand focus colour) for TRUE (or the ticked value), an empty outline for FALSE (or the unticked value) or
  empty. Any other value is drawn as a value, marked invalid.
- **Invalid value**: a small red triangle (6 px) in the cell's top-left corner. Hovering the cell shows the rule's
  Help Text, else its line ("Invalid: Choose one of the dropdown's options"), with the shared Tooltip.
- Exports, thumbnails, images and api or MCP renders draw a checkbox as ☑ or ☐, a chip as its text on the option's
  colour, and an arrow dropdown as its value.

## Using a dropdown

- A press on a chip, or on a dropdown's arrow, selects the cell and opens its **option list** under the cell: the
  shared option rows ([Option lists](../026-plan/plan-board.md#option-lists)), each option with its colour's dot, the
  cell's own ticked; over 8 options, a **Search options** field at the top filters them as typed. **Clear** at the
  foot empties the cell. Arrow keys move, Enter picks, Escape closes and hands the keys back to the grid.
- **Alt+Down** (⌥ Down) on the active cell opens its list, as in Google Sheets and Excel.
- Typing in a dropdown cell edits it as any cell; while the text matches options (starting with it first, then
  holding it), they show under the editor, the first highlighted; **Tab** or **Enter** saves the highlighted one, as
  formula autocomplete does; Escape there closes the list and keeps the typing.
- A pick writes the cell: one change, one undo step (`Sheet · Changed · Cell`).

## Using a checkbox

- A press on the box toggles it (empty or FALSE to TRUE, TRUE to FALSE); a press elsewhere in the cell selects it.
  With custom cell values, ticking writes the ticked value and unticking the unticked value, or empties the cell when
  there is none; each cell of a toggle takes its own rule's values.
- **Space** toggles every checkbox cell of the selection (any unticked: all ticked; all ticked: all unticked) as one
  change, one undo step; on a cell that is not a checkbox, Space types a space as before.
- With custom cell values, typing the ticked or unticked value (any case) saves it in the rule's own spelling; TRUE
  and FALSE are then values like any other.
- Typing `true` or `false` (any case), or `1` or `0`, saves TRUE or FALSE; anything else is refused (a Reject rule)
  or kept and marked (a Warn rule).
- A checkbox's value is TRUE or FALSE for formulas: `=COUNTIF(B2:B9,TRUE)` counts the ticked ones.

## Making and changing rules

- The toolbar's **Data** category gains **Dropdown**, **Checkbox** and **Data Validation** (after Sort and Filter,
  before the charts, with Conditional Formatting); the cell menu gains a **Data Validation** flyout with the same three rows and **Remove
  Validation** (when the selection touches a rule).
- **Checkbox** makes a Checkbox rule over the selection at once (one change, one undo step); its cells keep their
  values (TRUE and FALSE stay ticked and unticked; others are marked invalid).
- **Dropdown** opens the **rule editor** on a new Dropdown rule over the selection, its options filled from the
  distinct values already in the selection (up to 500, in the order first met), each given a colour from the
  soft Standard Colours in turn (so each chip reads apart); with none, two empty options.
- **Data Validation…** opens the rule editor on the rule at the active cell, else a new Dropdown rule.
- The **rule editor** is a popover anchored to the button or row that opened it (the shared popover, 22 rem wide,
  scrolling inside the window), titled **Data Validation**:
  - **Apply to Range**: an A1 range field, the selection to start; a range that cannot be read says so under it
    ("Type a range like B2:B20").
  - **Criteria**: the rule's kind as an option list (Dropdown, Dropdown (From a Range), Checkbox, Number, Date, Text,
    Custom Formula Is), then its fields: a Checkbox's **Use Custom Cell Values** (a tick box opening **Ticked Value**
    and **Unticked Value**, "Enter a ticked value" when the first is empty, "Ticked and unticked values must be
    different"); a Custom Formula Is's formula field (`=` to start, "That formula can't be read" when it cannot); a
    Dropdown's **options**, each a text field with its colour button (the one
    [colour picker](../004-interface-design/colour-picker.md) in its swatch skin, **No Colour** first) and a remove
    button, dragged by a grip to reorder, **Add Another Option** under them (Enter in an option's field adds one after
    it), and its **Display** (Chip, Arrow, Plain Text); a range's A1 field; a Number, Date or Text rule's condition
    (a select) and its one or two values (a date in the person's locale).
  - **Advanced**, a collapsed section: **If the Value Isn't Allowed** (Reject the Value, Show a Warning) and **Help
    Text**.
  - **Remove Rule** (an existing rule), **Cancel** and **Done** at the foot. Done writes the rule (one change, one undo
    step) and closes; a rule that cannot be made says why beside Done (an empty option list: "Add at least one
    option"; two options the same: "Each option must be different"; a missing value: "Enter a value").
- **A rule replaces the rules its range covers**: written over a range, the rule first takes that range out of every
  other validation rule (a rule partly covered keeps the rest of its cells, as up to four rules), as Google Sheets
  does. **Remove Validation** takes the selection out of every rule the same way.
- **Sheet Settings** gains a **Data Validation** section (after Named Ranges): each rule as a row (its kind's glyph,
  its range, its short line: "Dropdown: To Do, Doing, Done", "Checkbox", "Checkbox: Yes, No", "Number between 1 and
  10", "Custom Formula Is =B2>A2"), **Edit** (the rule editor, anchored to the row), **Go To** (selects its range) and **Remove**; "No validation rules yet. Select
  cells and choose Dropdown or Checkbox from the toolbar's Data menu." when there are none ("No validation rules."
  for a Participant or Viewer, who has no toolbar). Edit and Remove are an Editor's.
- Telemetry: `Sheet · Changed · Validation` for each rule change (made, edited, removed); never the options.

## Who may do what

| Role        | May                                                                                                                                                                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Editor      | Everything: make, edit and remove rules, and write cells (checked as below)                                                                                                                                                                                         |
| Participant | Write cells as before (checked by the rules): pick from dropdowns, tick checkboxes, type values. Never make, edit or remove a rule: no Dropdown, Checkbox or Data Validation in any menu, and the api refuses a rule change from a Participant as any layout change |
| Viewer      | See chips, checkboxes and invalid marks; a press on a chip or box selects the cell and changes nothing; no option list opens                                                                                                                                        |

- Rules are part of the sheet's layout, so a rule change is a layout write: an Editor's (the api's existing role
  check), never a Participant's.

## Copies, sort and the clipboard

- A copied sheet (duplicate, paste into another document, Duplicate Tab) keeps its rules, as it keeps its merges. A
  Dropdown from a Range reading another sheet keeps reading that sheet within the workbook; copied into another
  spreadsheet, it reads the sheet of that name there, if any (as a formula's reference by name does), else nothing.
- Sort moves values, never rules: a rule stays on its cells' rows by id, so sorting the rows inside a rule's range
  leaves it where it was. (A rule whose corner row is sorted elsewhere follows that corner, as a named range does.)
- Copy and paste carry inputs and formats, never rules; the fill handle fills values, checked by the rules of the
  cells it fills.
- **Clear Sheet** removes every rule.

## Agents

- `change_sheet` gains `validate` (a range and its rule: `{ type: "dropdown", options: ["To Do", "Doing", "Done"],
colors?, display? }`, `{ type: "dropdown_range", source: "A2:A20" }`, `{ type: "checkbox", checked?, unchecked? }`,
  `{ type: "formula", formula: "=B2>A2" }`, `{ type: "number" | "date" | "text", condition, value?, value2? }`, plus `reject` (default true) and `help`) and `clear_validation` (a
  range). A rule made by an agent replaces what its range covers, as the editor's does.
- `read_sheet` lists the sheet's rules (range, kind, options or condition) and marks invalid values.
- An agent's `set` that a Reject rule refuses is refused with the cell and the rule's line ("B4 holds one of: To Do,
  Doing, Done"), and nothing of that change is written.

## Limits

- At most **200** validation rules a sheet (`VALIDATION_RULES_MAX`); a change that would make more (a rule splitting
  others) is refused: "This sheet holds the most validation rules it can".
- A Dropdown holds 1 to **500** options (`DROPDOWN_OPTIONS_MAX`), each 1 to **255** characters
  (`DROPDOWN_OPTION_MAX`), distinct case aside; a Dropdown from a Range reads at most 500 distinct values.
- Help Text up to **255** characters (`VALIDATION_HELP_MAX`).

## Performance

- Drawing looks up each visible cell's rule through an index built once per layout (rules bucketed by column), so a
  scroll frame costs one bucket scan per visible cell, never a scan of every rule.
- Checking a write looks up only the written cells' rules; a Dropdown from a Range reads its range's shown values
  once per check.
- A sheet without rules pays nothing: no index is built and nothing is drawn.

## Defaults

Each default below was applied where this spec is silent or qualitative, and holds until a human confirms it.
The code cites each by its id.

- **D24** How a rule's leftover cells are kept when another rule covers part of it: Up to four rectangles (bands above,
  below, left, right), each a new rule with a new id (default).
- **D25** What a Dropdown from a Range reads: The range's distinct shown values, empty aside, the first 500 (default).
- **D26** How a colour scale blends: Linear in sRGB (default).
- **D27** Custom format codes in other locales: Drawn as `TEXT` writes them (en), the same for everyone (default).
