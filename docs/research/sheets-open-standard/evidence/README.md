# Evidence

Follow the references below only as needed; never upfront.

What the data tools' specs ([Data tools](../../../specs/029-sheets/data-tools.md),
[Standard mapping](../../../specs/029-sheets/standard-mapping.md)) cite as measured: the outputs of probes run against
Google Sheets through its API (2026-11-27), the shapes of files Google wrote, and LibreOffice reading LiveDoc's files.
The probes themselves stay outside the repository (they read an account's credentials); each output holds what the
claim needs, the throwaway spreadsheets' Drive ids replaced by `<drive file id>`.

- ./google-cleanup-probe.out.txt - when checking Remove Duplicates, Trim Whitespace, Split Text to Columns or Randomise Range against Google
- ./google-find-replace-probe.out.txt - when checking Find and Replace against Google (regular expressions, formulas, links, notes)
- ./google-table-paste-probe.out.txt - when checking which pastes make a table (D451, D454)
- ./google-table-view-probe.out.txt - when checking tables' filters and views through the API (D482, D491)
- ./google-slicer-probe.out.txt - when checking slicers' model in the API and Google's XLSX of one (D475)
- ./google-slicer-subtotal-probe.out.txt - when checking SUBTOTAL under a filter, a filter view and a slicer (D469)
- ./google-filter-view-export.md - when checking how Google writes filter views to XLSX
- ./google-protection-export.md - when checking how Google writes protected ranges to XLSX and ODS
- ./google-table-export.md - when checking how Google writes tables to XLSX and ODS
- ./google-validation-export.md - when checking how Google writes data validation to XLSX and ODS
- ./libreoffice-filter-proof.md - when checking LibreOffice's reading and writing of LiveDoc's filters
