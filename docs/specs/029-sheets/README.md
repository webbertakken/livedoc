# Sheets

Follow the references below only as needed; never upfront.

A **spreadsheet** is a document type of its own: a workbook of sheets, native to both OpenDocument and Office Open
XML, looking and working as Google Sheets does. It is specified and being built (plan 0020); until it ships, the
**Plan Sheet** (a Sheet element filling a Plan tab, its cells in the document's sheet store) is what LiveDoc has.

## The spreadsheet

- ./spreadsheet.md - when working on the spreadsheet document: what it is and holds, its domain language, the workbook shape, sheets in the sheet bar, roles, limits
- ./standard-mapping.md - when working on reading or writing `.ods`, `.fods` or `.xlsx`: the model's mapping to each format, formula syntax, unknown content, conformance
- ./parity-matrix.md - when checking what a Google Sheets menu item, button, panel, dialog or shortcut does here, and its status
- ./surface.md - when working on the screen of a workbook: layout, menu bar, toolbar, formula bar, sheet bar, side panels, phone
- ./keyboard-shortcuts.md - when working on a spreadsheet's keyboard shortcuts: every one of Google's, per platform, and its status
- ./grid-and-editing.md - when working on the grid, selection, moving around, editing, formulas as typed, fill, clipboard, rows and columns
- ./formatting.md - when working on styles, number formats, fonts, colours, borders, alignment, merges, themes, alternating colours
- ./data-tools.md - when working on sort, filters, filter views, slicers, validation, named ranges and functions, protection, tables, clean-up, find and replace
- ./inserted-objects.md - when working on images, drawings, links, tick boxes, dropdowns, emoji, the timeline view, smart chips (left out)
- ./charts.md - when working on a spreadsheet's charts, the chart editor or sparklines
- ./pivot-tables.md - when working on pivot tables and their editor
- ./review.md - when working on notes, comments, version history or a cell's edit history in a spreadsheet
- ./files-and-print.md - when working on import, the import report, import security, download, converting between formats, print, copies, publishing, repositories
- ./settings.md - when working on spreadsheet settings (locale, time zone, recalculation, iteration), Tools and View
- ./plan-links.md - when working on what Plan reads from or writes to a spreadsheet: dashboards, form responses, card tables
- ./templates.md - when working on spreadsheet templates
- ./migration.md - when working on migrating stored Plan Sheets into spreadsheets
- ./performance.md - when measuring or budgeting a spreadsheet's load, typing, scrolling, recalculation, memory or bundle
- ./imports.md - when working on IMPORTDATA, IMPORTFEED, IMPORTHTML or IMPORTXML: fetching, Allow Access, the api's guards
- ./formulas.md - when working on the formula language: values, references, operators, arrays, the function catalogue, other workbooks, the oracle, recalculation
- ./sheet-store.md - when working on the sheet store: what is stored, writes, rows and columns by id, access, live sync, undo, offline documents, copies, agents, limits
- ./data-validation.md - when working on validation rules: dropdowns, checkboxes, number, date and text rules, where values are checked, the rule editor
- ./conditional-formatting.md - when working on format rules: conditions and styles, colour scales, which rule draws a cell, the Conditional Formatting popover

## The Plan Sheet (until retired)

- ./sheet.md - when working on the Plan Sheet element: placing it, its header, toolbar, formula bar and grid, selection, editing, keyboard, clipboard, fill, rows and columns, formatting, freeze, sort, filter, find, maximise, presence, other modes, exports, CSV
