# The standard: ODF spreadsheets or OOXML SpreadsheetML

Follow the references below only as needed; never upfront.

Which ISO spreadsheet format a LiveDoc spreadsheet is native to (fork C1). Researched 2026-11-18.

## The two candidates

|                                 | ODF 1.4 spreadsheet (`.ods`, flat `.fods`) with OpenFormula                                                                                                                                                                                                                                                                                                                                                 | OOXML SpreadsheetML (`.xlsx`)                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Standard                        | OASIS Standard since 3 December 2025 ([OASIS](https://www.oasis-open.org/2025/12/03/oasis-approves-open-document-format-odf-v1-4-standard-marking-20-years-of-interoperable-document-innovation/), verified); ODF 1.2 is ISO/IEC 26300:2015 (assumed: the ISO track trails OASIS by years)                                                                                                                  | ISO/IEC 29500:2016, Strict and Transitional (assumed: from the ISO catalogue as commonly cited); Excel writes Transitional                 |
| Governance                      | OASIS Open Document TC, royalty-free; parts: 1 Introduction, 2 Packages, 3 Schema (RELAX NG), 4 OpenFormula ([ODF 1.4 parts](https://en.wikipedia.org/wiki/OpenDocument_standardization), verified)                                                                                                                                                                                                         | Ecma TC45 and ISO SC34; the format follows Excel's behaviour                                                                               |
| Formula language                | **OpenFormula** (Part 4): its own syntax (`of:=SUM([.A1:.B2])`), types, coercion, errors and 391 functions in Small (108), Medium (+162) and Large (+116) groups, each a conformance class ([Part 4 §2.3](https://docs.oasis-open.org/office/OpenDocument/v1.4/OpenDocument-v1.4-part4-formula.html), verified, parsed)                                                                                     | Formulas as Excel writes them (`SUM(A1:B2)`), with `_xlfn.` prefixes for functions newer than 2007; the function semantics are Excel's own |
| Newer functions                 | Not in OpenFormula: dynamic arrays (`FILTER`, `SORT`, `UNIQUE`, `SEQUENCE`), `XLOOKUP`, `LET`, `LAMBDA`, `IFS`, `SWITCH`, `TEXTJOIN`, `MAXIFS` (verified: absent from Part 4's headings). LibreOffice writes them in ODF files under `COM.MICROSOFT.*` and its own under `ORG.LIBREOFFICE.*` ([core_resource.hrc](https://github.com/LibreOffice/core/blob/master/formula/inc/core_resource.hrc), verified) | Written as Excel names them; Excel defines them                                                                                            |
| Who writes it                   | LibreOffice natively; Excel (Microsoft 365 and Office LTSC 2024 save ODF 1.4 by default, [Microsoft](https://techcommunity.microsoft.com/blog/microsoft365insiderblog/microsoft-365-apps-now-support-opendocument-format-1-4/4226735), verified); Google Sheets downloads and opens `.ods` (assumed: File > Download lists it, [inventory](google-sheets-inventory.md))                                     | Excel natively; LibreOffice and Google Sheets read and write it                                                                            |
| A flat XML form                 | **Yes**: a flat ODF document (`.fods`), one XML file with every part inline (Part 2 and Part 3, assumed: `office:document` root); LibreOffice opens and saves it (verified by use in Phase 4's tracer)                                                                                                                                                                                                      | No flat form that Excel opens: Flat OPC exists for Word and PowerPoint (assumed: Excel does not open a Flat OPC workbook)                  |
| Diffs in git, `rg`              | A `.fods` is text: one cell a `table:table-cell` element; a value change is a one-line diff when written one cell a line (inferred)                                                                                                                                                                                                                                                                         | Zip of parts: binary to git; text only after unzipping, with shared strings indirecting every text cell (inferred)                         |
| Charts                          | Embedded chart objects (`draw:object` holding an ODF chart document, inline in `.fods`)                                                                                                                                                                                                                                                                                                                     | DrawingML charts (`xl/charts/chartN.xml`)                                                                                                  |
| Pivot tables                    | Data pilots (`table:data-pilot-table`)                                                                                                                                                                                                                                                                                                                                                                      | Pivot caches and tables                                                                                                                    |
| Styles                          | Automatic and named cell styles; number formats as data styles (`number:number-style`, ...)                                                                                                                                                                                                                                                                                                                 | A styles part with indexed fonts, fills, borders and number format codes                                                                   |
| Conditional formats, validation | `calcext:` extensions for most of what LibreOffice does past ODF 1.2 (assumed: LibreOffice's extended namespace)                                                                                                                                                                                                                                                                                            | Native                                                                                                                                     |

## How each serves the request

- "Open sheets standard" names ODF most directly: OpenDocument is the standard the open-source suites are built on,
  developed in the open by OASIS, with a formula language of its own written down to the function (inferred from
  the above).
- OOXML holds every Excel feature and is what Google Sheets users exchange most, but its formula semantics are "what
  Excel does", and it has no single-file text form for git.
- Both are needed in the end: the definition of done asks for files that open in LibreOffice, Excel and Google
  Sheets, and theirs to open here. The fork is which one the **model** follows, and which is the **round trip**
  without loss.

## Recommendation, and the ruling

The research recommended ODF as the one native format with XLSX in and out. **Webber ruled C1 otherwise
(2026-11-18): both are native, and a file keeps the format it arrived in.** What follows is the research read in the
light of that ruling.

- **One live model**, which both formats map onto; each format's mapping is its own, neither an export of the
  other. What a format holds that the model does not is kept with the workbook and written back to that format.
- **A workbook remembers its format** (`.ods`, `.fods` or `.xlsx`): it leaves as it arrived until a person
  converts it, and conversion lists its losses before it runs. The format a spreadsheet made in LiveDoc is born in is
  C5 (default ODF 1.4).
- **Formulas in the file's own syntax**: OpenFormula in an ODF file (`of:=SUM([.A1:.B2])`), Excel's grammar in an
  XLSX file (`SUM(A1:B2)`, `_xlfn.` before functions newer than 2007, assumed from Excel's files). The stored
  formula in the room is neither: it is the model's own, by row and column ids, as today.
- **Functions one format lacks**: in ODF, as LibreOffice writes them (`COM.MICROSOFT.*`, `ORG.LIBREOFFICE.*`); in
  XLSX, as Excel names them. Google-only functions (52 with no ODFF name, [catalogue](function-catalogue.md#google-only-with-no-odff-name))
  need a convention in **each** format (S5): Google's own XLSX downloads wrap such a formula as
  `IFERROR(__xludf.DUMMYFUNCTION("…"), <cached value>)` (assumed: widely observed in its downloads; checked against
  the corpus in Phase 7), which Google Sheets turns back into the formula on import; ODF has no such convention on
  record, so a LiveDoc namespace (`ORG.LIVEDOC.*`) with the cached value is proposed there.
- **Which meaning wins** (S6): where Google Sheets and OpenFormula, or Google Sheets and Excel, differ on a function,
  Google's meaning holds in the grid, and each file writes the name whose meaning matches in its own format.
- **Schema validation** of every written file against its own format: ODF 1.4's RELAX NG schema, and the ECMA-376
  Transitional schemas for XLSX.
- **Repositories**: `.fods` stays the text form for an ODF workbook; an XLSX workbook syncs as its `.xlsx` bytes.
