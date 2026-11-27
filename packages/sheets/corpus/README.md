# The corpus

Files other suites wrote, read and written back by `src/files/corpus.test.ts`
([Standard mapping](../../../docs/specs/029-sheets/standard-mapping.md#the-corpus), D119).
`losses.json` records every loss each file's read, write, second read and conversion names; the test fails on any
other. `CORPUS_UPDATE=1` writes it afresh, to be read in review.

| Folder         | Holds                                                                                                                                                                                                                                                                                                      | Made by                                                                    | Licence                                                                                                      |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `excel/`       | Workbooks from Apache POI's `test-data/spreadsheet`, at `POI_COMMIT`                                                                                                                                                                                                                                       | Microsoft Excel 2007 to 2016, Windows and macOS (their `docProps/app.xml`) | Apache License 2.0                                                                                           |
| `libreoffice/` | Each Excel workbook saved as `.ods`, some as `.xlsx` (`corpus-files.ts`)                                                                                                                                                                                                                                   | LibreOffice 26.8                                                           | Apache License 2.0, as their sources                                                                         |
| `google/`      | Some Excel workbooks, `google-functions` (`GOOGLE_FUNCTIONS`), `smart-chips` (a person and a file chip) and `pivot-tables` (`pivot-cases.ts`), exported as `.xlsx` and `.ods`; `pivot-answers.json`, each pivot table's output as Google works it out; `getpivotdata-answers.json`, GETPIVOTDATA's answers | Google Sheets, through the oracle's Drive                                  | Apache License 2.0 as their sources; `google-functions`, `smart-chips` and `pivot-*` MIT, as this repository |

- Made again by `pnpm --filter @livedoc/sheets corpus:make` with `CORPUS_SOURCE=excel`, `libreoffice` (`SOFFICE`
  names the LibreOffice) or `google` (the oracle's token, from `oracle:google:consent`), in that order; `google-chips` makes `smart-chips`
  the same way (Google's smart chips are made through the Sheets API, so no Excel file holds them), and `google-pivots`
  makes `pivot-tables`, `pivot-answers.json` (each case's pivot table through the Sheets API, its output read back,
  as an export leaves most pivot tables' cells empty) and `getpivotdata-answers.json` (each `GETPIVOTDATA_PROBES`
  formula's answer, typed on a sheet of its own).
- Apache POI's files are its test data, distributed under the Apache License 2.0
  (<https://www.apache.org/licenses/LICENSE-2.0>); see `NOTICE`.
