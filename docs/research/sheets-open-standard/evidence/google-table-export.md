# Google table export probe (2026-11-27)

`google-table-export-probe.ts`: a table `Sales` over A1:D4 (headers `Item`, `Amount`, a blank, `2024`; Text, Currency
and Dropdown columns), formulas in F1:F4 beside it; Drive export to XLSX and ODS.

## The sheet

- Adding the table writes `Column 1` into the blank header cell: Google's column name numbers blank headers from 1
  among the blanks, and the name is the cell's text.
- Formulas read back as typed: `=SUM(Sales[Amount])`, `=Sales[@Amount]*2`, `=ROWS(Sales)`, `=COUNTA(Sales[#ALL])`.

## xlsx

- `xl/tables/table1.xml`, content type `application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml`,
  linked from the worksheet's rels (type `.../relationships/table`) and `<tableParts count="1"><tablePart r:id=.../>`.
- `<table ref="A1:D4" displayName="Sales" name="Sales" id="1">`, no `headerRowCount` (default 1), no `autoFilter`;
  `tableColumn name` each header's text (`Column 1` for the blank one, `2024` for the number); `tableStyleInfo` a
  custom style of the file's own with `showRowStripes="1"`.
- No typed columns: the Currency column is its cells' number format, the Dropdown's options nowhere in the table part.
- Formulas: `SUM(Sales[Amount])`, `Sales[@Amount]*2` (Google's `@`, not Excel's `[#This Row]` file form),
  `ROWS(Sales[])` (the table alone as `Sales[]`), `COUNTA(Sales[#ALL])`.

## ods

- `<table:database-ranges><table:database-range table:name="Sales" table:target-range-address="'S'.A1:'S'.D4"/>`,
  no `contains-header` (ODF's default, true), no filter buttons.
- Formulas as plain absolute ranges with the sheet: `of:=SUM([$'S'.$B$2:.$B$4])`, `of:=ROWS([$'S'.$A$2:.$D$4])`;
  this row and `#ALL` were written as `#NAME?` (Google's export loses them).
