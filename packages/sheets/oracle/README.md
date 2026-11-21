# The oracle corpus

Cases and the answers each source gives them ([Formulas](../../../docs/specs/029-sheets/formulas.md#the-oracle)).
How to add a function: [Measure a function against the oracle](../../../docs/instructions/measure-a-function-against-the-oracle.md).

| Folder                 | Holds                                                 | Made by                                            | Licence                 |
| ---------------------- | ----------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| `cases/`               | One file per category: its fixture (`data`) and cases | hand, written for LiveDoc                          | MIT, as this repository |
| `answers/libreoffice/` | LibreOffice's answer to each case, by id              | `pnpm --filter @livedoc/sheets oracle:libreoffice` | MIT (data)              |
| `answers/google/`      | Google Sheets' answer to each case, by id             | `pnpm --filter @livedoc/sheets oracle:google`      | MIT (data)              |

- A category's workbook: sheet `Data` holds the fixture from A1; sheet `Cases` holds each case's id in column A and its
  formula in column B, blocks a blank row apart; an array case is written as an array formula over its block.
- A category may name its `locale` (`"locale": "de-DE"`; `en-US` otherwise): its formulas are typed in that locale's
  syntax, the engine works them out in it, and LibreOffice answers with it as its own locale (`Locale` is one).
- `oracle:libreoffice` writes each category as a flat ODF file, has LibreOffice work every formula out afresh
  (`@livedoc/office-packages/libreoffice`), and reads the values back. `SOFFICE` names another LibreOffice.
- Answers need LibreOffice 24.8 or later (its `FILTER`, `SORT`, `UNIQUE`, `XLOOKUP`, `LET`); each file records its
  version in `by`. A case naming a difference LibreOffice no longer has fails until the name goes.
- `oracle:google` works through Drive with the oracle's own token: per category it uploads the workbook as an `.xlsx`
  converted to a Google Sheet, sets its locale and UTC (Sheets API), exports it as `.xlsx`, reads the answers
  from it, and deletes the Drive file, also when it fails (Google's `.ods` export writes booleans as numbers and
  functions ODF lacks as `#NAME?`, so it is not read).
- Its token, once: `pnpm --filter @livedoc/sheets oracle:google:consent` prints Google's consent address, takes the
  redirect on `127.0.0.1`, and saves the refresh token to `~/.secrets/google-oracle-refresh-token` (mode 600).
  It needs the operator's Desktop app client at `~/.secrets/google-oracle-oauth-client.json` (scope `drive.file`,
  the Drive and Sheets APIs on). Neither file's content is ever printed.
- A Drive or Sheets call answering 429 or 5xx is tried again after 1, 4 and 16 seconds; any other failure stops the run
  and names the call and status.
- `ORACLE_CATEGORY=<Category>` makes one category's answers. Answers are written whole per category, only when every
  case is answered and none runs past its block.
- A value is a number, text, a boolean, `null` (empty) or `{ "e": "#N/A" }`; LibreOffice's own error texts
  (`Err:502`) match an error of any code.
