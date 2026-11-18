# Sheets

Follow the references below only as needed; never upfront.

A **spreadsheet** is a document type of its own: a workbook of sheets, native to both OpenDocument and Office Open
XML, looking and working as Google Sheets does. It is specified and being built (plan 0020); until it ships, the
**Plan Sheet** (a Sheet element filling a Plan tab, its cells in the document's sheet store) is what LiveDoc has.

## The spreadsheet

- ./spreadsheet.md - when working on the spreadsheet document: what it is and holds, its domain language, the workbook shape, sheets in the sheet bar, roles, limits
- ./standard-mapping.md - when working on reading or writing `.ods`, `.fods` or `.xlsx`: the model's mapping to each format, formula syntax, unknown content, conformance
- ./parity-matrix.md - when checking what a Google Sheets menu item, button, panel, dialog or shortcut does here, and its status
- ./formulas.md - when working on the formula language: values, references, operators, arrays, the function catalogue, other workbooks, the oracle, recalculation
- ./sheet-store.md - when working on the sheet store: what is stored, writes, rows and columns by id, access, live sync, undo, offline documents, copies, agents, limits
- ./data-validation.md - when working on validation rules: dropdowns, checkboxes, number, date and text rules, where values are checked, the rule editor
- ./conditional-formatting.md - when working on format rules: conditions and styles, colour scales, which rule draws a cell, the Conditional Formatting popover

## The Plan Sheet (until retired)

- ./sheet.md - when working on the Plan Sheet element: placing it, its header, toolbar, formula bar and grid, selection, editing, keyboard, clipboard, fill, rows and columns, formatting, freeze, sort, filter, find, maximise, presence, other modes, exports, CSV
