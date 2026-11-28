# LibreOffice filter proof (2026-11-27, slice b)

LibreOffice (headless `soffice --convert-to`) on files LiveDoc wrote: a filter over Data!A1:C6 keeping pen and cap in A,
B between 2 and 8, C containing "ap"; a filter view "Big counts".

- LiveDoc XLSX → LibreOffice ODS: `__Anonymous_Sheet_DB__0` with `=` + set items (pen, cap), `>=` 2, `<=` 8,
  `contains` ap in one `table:filter-and`; rows 3 and 5 `table:visibility="filter"`.
- LiveDoc ODS → LibreOffice XLSX: the same `autoFilter` (three `filterColumn`s), rows 3 and 5 `hidden`,
  `SUBTOTAL(103,A2:A6)` = 3 (the filter's rows left out).
- With `table:data-type="number"` on `>=`/`<=`, LibreOffice read the values as empty: LiveDoc writes none, as
  LibreOffice does.
- LibreOffice's own read of an XLSX filter whose kept values hold the blank keeps only that column (its or form);
  a nested `table:filter-or` inside `table:filter-and` is dropped: Is Not Between has no ODF form.
- A table's filter (D481): LiveDoc's ODS writes it in the table's own `table:database-range`; LibreOffice's XLSX then
  holds it in the table part's `autoFilter` (`filterColumn colId="1"` greaterThan 2), row 3 hidden. LiveDoc's XLSX
  table part `autoFilter` → LibreOffice ODS: the `Items` database range with its `table:filter`, the row hidden as
  `collapse` (LibreOffice's choice for a named range).

## Per-table filters (slice b2, 2026-11-27)

`twoTablesAndAFilter()` (`packages/sheets/src/testing/table-filters.ts`: Table1 A1:B4 keeping B=2 plus a fill
colour on A, Table2 D1:E4 keeping D=b, the sheet's filter H1:H4 keeping x) written by LiveDoc, converted by
LibreOffice headless, read back by LiveDoc:

- LiveDoc XLSX → LibreOffice ODS → LiveDoc: sheet `{H: eq x}`, Table1 `{B: eq 2}`, Table2 `{D: eq b}`, no losses,
  no rows hidden by hand. LibreOffice writes a one-value kept list as `=`, read back as Is Equal To.
- LiveDoc ODS → LibreOffice XLSX → LiveDoc: sheet `{H: values [x]}`, Table1 `{B: values [2]}`, Table2 `{D: values
[b]}`, no losses.
- The fill-colour condition has no standard form: LibreOffice drops LiveDoc's record, so it is gone, as specified.
