# The corpus

Files other suites wrote, read and written back by `src/files/corpus.test.ts`
([Standard mapping](../../../docs/specs/029-sheets/standard-mapping.md#the-corpus), D119).
`losses.json` records every loss each file's read, write, second read and conversion names; the test fails on any
other. `CORPUS_UPDATE=1` writes it afresh, to be read in review.

| Folder         | Holds                                                                                            | Made by                                                                    | Licence                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `excel/`       | Workbooks from Apache POI's `test-data/spreadsheet`, at `POI_COMMIT`                             | Microsoft Excel 2007 to 2016, Windows and macOS (their `docProps/app.xml`) | Apache License 2.0                                                              |
| `libreoffice/` | Each Excel workbook saved as `.ods`, some as `.xlsx` (`corpus-files.ts`)                         | LibreOffice 26.8                                                           | Apache License 2.0, as their sources                                            |
| `google/`      | Some Excel workbooks and `google-functions` (`GOOGLE_FUNCTIONS`), exported as `.xlsx` and `.ods` | Google Sheets, through the oracle's Drive                                  | Apache License 2.0 as their sources; `google-functions` MIT, as this repository |

- Made again by `pnpm --filter @livedoc/sheets corpus:make` with `CORPUS_SOURCE=excel`, `libreoffice` (`SOFFICE`
  names the LibreOffice) or `google` (the oracle's token, from `oracle:google:consent`), in that order.
- Apache POI's files are its test data, distributed under the Apache License 2.0
  (<https://www.apache.org/licenses/LICENSE-2.0>); see `NOTICE`.
