# Google protection export probe (2026-11-27)

`google-protection-probe.ts`: sheet 1 protected (owner only) but A2:A3; sheet "Second" B1:C2 protected (owner only)
and A5 protected with a warning; Drive export to XLSX and ODS.

## xlsx

- No `sheetProtection`, no `protectedRanges` in either worksheet; no `workbookProtection`; no `protection` in
  `styles.xml` (`cellXfs` all locked by default).

## ods

- No `table:protected`, no `table:protection-key`, no `style:cell-protect` in `content.xml`.

Google Sheets writes no protection to either format: the mapping is LiveDoc's own, after Excel's and LibreOffice's.
