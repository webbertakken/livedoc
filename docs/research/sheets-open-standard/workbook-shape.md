# Workbook shape (S1)

Follow the references below only as needed; never upfront.

Where the sheets of a spreadsheet live in a LiveDoc document. Researched 2026-11-18.

## The two designs

- **A. Each sheet a tab of the document.** A spreadsheet is a document whose tabs are of kind `sheet`; the document's
  tab strip is drawn as the sheet bar at the foot of the grid.
- **B. One tab holds the workbook.** A spreadsheet is a document with one tab of a new kind (a workbook), holding
  every sheet; the tab draws its own sheet bar. A document with one tab hides its tab strip, so a person sees only
  the sheet bar, as in Google Sheets.

## Judged

| Concern                     | A: a sheet per tab                                                                                                                                          | B: a workbook per tab                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The pattern in place        | New: no kind today spreads one file over several tabs                                                                                                       | Matches it: "every file is a document", a markdown or file document is one tab of its kind, and a document with one tab hides its strip (`006-document/document.md`, verified)            |
| References across sheets    | Across tabs: the sheet store today scopes a sheet to its tab (`sheet-store.md`, `tabId` for life; verified), so it widens to the document                   | Inside the tab: as today's store already scopes them, unchanged (inferred)                                                                                                                |
| The file round trip         | A `.ods` is the whole document; a document mixing a diagram tab and sheet tabs has no one file                                                              | A `.ods` is the workbook tab; a mixed document writes one `.ods` per workbook tab beside its other tabs, as native files do per native tab (`027-repositories/native-files.md`, verified) |
| Mixed documents             | Sheet tabs interleave with other tabs, one sheet bar for none of them                                                                                       | A workbook tab sits beside a diagram tab; inside it, its own sheets                                                                                                                       |
| Sharing                     | A tab-scoped link shows one sheet, while its formulas read others the visitor may not see (a leak to guard, inferred)                                       | A tab-scoped link shows the whole workbook, as a `.ods` is shared whole (inferred)                                                                                                        |
| Sheet operations Google has | Hide, protect, colour, copy to another spreadsheet, move: some fit the tab strip (rename, order, duplicate, delete), others are new to tabs (hide, protect) | All in the workbook's own sheet bar, none bending the document's tab strip (inferred)                                                                                                     |
| Limits                      | 200 sheets per document already (`limits.ts`); tabs count against the document's tab caps                                                                   | The workbook's own sheet cap, under the document's cell caps                                                                                                                              |
| Agents                      | `add_tab` makes a sheet; tabs and sheets blur                                                                                                               | A workbook verb set over one tab; tab verbs unchanged                                                                                                                                     |
| Branches, offline, copies   | Tab machinery handles each sheet (inferred)                                                                                                                 | The workbook's sheets move with its tab, as today's sheet store moves with the document                                                                                                   |

## Recommendation

**B**: one tab holds the workbook. It is the shape every file document already has, it maps one tab to one file both
ways, and it keeps references, sharing and sheet operations inside one boundary. A has the one appeal of reusing
the tab strip, which is drawn at the wrong edge and lacks half of Google's sheet operations anyway.
