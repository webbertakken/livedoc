# Imports from the web

`IMPORTDATA`, `IMPORTFEED`, `IMPORTHTML` and `IMPORTXML` read a page of the web into a spreadsheet, as Google Sheets';
`IMAGE` shows a picture of the web in its cell ([below](#image)).
The api Worker fetches the page, never the viewer's browser, so no third party learns who looks (S4, ruled 2026-11-18).
The formula language around them is [Formulas](formulas.md); the security cases are
[security research](../../research/sheets-open-standard/security.md) ("Fetches to private addresses").

## The functions

| Function     | Syntax (Google's)                                  | Answers                                                     |
| ------------ | -------------------------------------------------- | ----------------------------------------------------------- |
| `IMPORTDATA` | `IMPORTDATA(url)`                                  | The rows of a comma- or tab-separated file                  |
| `IMPORTFEED` | `IMPORTFEED(url, [query], [headers], [num_items])` | An RSS or Atom feed: its items, or the feed itself          |
| `IMPORTHTML` | `IMPORTHTML(url, query, index)`                    | The `index`th `"table"` or `"list"` of an HTML page, from 1 |
| `IMPORTXML`  | `IMPORTXML(url, xpath_query, [locale])`            | What an XPath 1.0 query selects in an XML or HTML page      |

- `url` is text, `http://` or `https://`; an address without a scheme is read with `http://` (default, D61).
- An address of any other scheme, or one that is no address, is `#N/A` "Url not found: …" (default, D61).
- A file is tab-separated when its type is `text/tab-separated-values` or its path ends `.tsv`, else comma-separated.
- `IMPORTFEED`'s `query` is `"items"` (default), `"items <type>"` (title, summary, url, created), `"feed"` or
  `"feed <type>"` (title, description, author, url) (verified: Google's help and its items' columns).
- Its items table is Title, Author, URL, Date Created, Summary, newest first as the feed lists them; `headers` TRUE
  adds those words as a first row; `num_items` keeps the first that many items; `"feed"` is one row of title,
  description and url (column titles and the summary's text without markup: default, D62).
- `IMPORTHTML` counts tables (every `<table>`, nested ones too) and lists (`<ul>` and `<ol>` together) apart, each in
  the order the page opens them (verified: "The indices for lists and tables are maintained separately").
- A table is its rows (`<tr>` of the table, not of a table inside it) of cells (`<th>` and `<td>`); a list is its
  items (`<li>`), one a row; a cell spanning more holds its text in its first cell, the rest empty (default, D62).
- `IMPORTXML` reads XML when the page says it is XML (its type, or `<?xml` first), else HTML read as a browser would.
- Each node selected is a row: an attribute or text its text; an element with child elements one column for each
  child, else its text; a query answering a number, text or boolean is that one value (default, D62).
- Text is joined as the page shows it: blocks apart, runs of white space one space, trimmed; each text at most 10,000
  characters, and a span at most 1,000 cells.
- A query that would visit more than 5,000,000 nodes of a page is `#N/A` "The query is too costly for this page".
- Each value arriving is read as a typed input is, in the locale (`IMPORTXML`'s `locale`, else the spreadsheet's):
  a number or a boolean becomes one, anything else stays text (a date stays text; default, D63).

## IMAGE

`IMAGE(url, [mode], [height], [width])` shows the picture at `url` in its cell, as Google Sheets' does.
Its fetch goes through the api, as the imports' do, behind the same Allow Access.

- `url` is read as the imports read theirs (D61); `mode` is 1 (default), 2, 3 or 4 (verified: Google's help).
- **1** fits the picture inside the cell, in proportion; **2** stretches it to fill the cell; **3** shows it at its own
  size, cut at the cell's edges; **4** at `height` by `width` pixels, cut at the cell's edges (verified: Google's help).
- The cell never grows to fit the picture (verified: "no mode causes the cell to be resized to fit the image").
- The picture sits in the middle of the cell; in mode 4 a size left out follows the other in proportion, and both left
  out are the picture's own size; `height` and `width` are read only in mode 4 (default, D72).
- A mode other than 1 to 4, or a `height` or `width` not above 0, is `#VALUE!` (verified: third-party guides).
- **Its value** is empty text, as `SPARKLINE`'s is ([Charts](charts.md#sparklines)): a formula reading the cell
  reads `""`, and nothing overflows into it (default, D72).
- The picture is drawn when the cell's formula works an `IMAGE` out and its value is that empty text, so
  `=IF(B2, IMAGE(C2), "")` draws only where `B2` is true.
- In an array context it is worked out for each address, and each picture is drawn in its place of the spill
  (verified: `ARRAYFORMULA(IMAGE(… & SEQUENCE(4)))` shows four, third-party guides).
- A formula whose answer is a reference to one cell holding a picture shows that picture (`=B2`, `INDEX`,
  `OFFSET`, `IF` of references); so does a `VLOOKUP`, `HLOOKUP` or `XLOOKUP` whose answer is such a cell of a
  range (verified: third-party guides look pictures up). At most 8 cells are followed (default, D72).
- A picture not fetched, or not a picture, leaves the cell empty, with no error (verified: third-party guides).
- SVG is not shown, nor a picture kept on `drive.google.com` (verified: Google's help); a picture is PNG, JPEG, GIF,
  WebP, AVIF, BMP or an icon, known by its first bytes, never by the type the server names (default, D73).
- A `url` reading `NOW`, `RAND`, `RANDARRAY` or `RANDBETWEEN` anywhere is `#ERROR!` as an import's is.
  Google refuses them only in the address before its query; LiveDoc cannot tell the parts apart (default, D72).
- Until an Editor allows access the cell is `#REF!` "Allow access to fetch data from the web", and the bar shows.
- Where no editor fetches (the api, MCP and CLI reading values, a Plan Sheet, files) the value is still empty text
  and no picture is drawn; renders made without the page (Plan art, previews) leave the cell empty (default, D72).
- The page fetches each address once while the spreadsheet is open, 4 at once, and keeps at most 200 pictures,
  the least recently drawn let go first; pictures are not asked again hourly, as Google's list of the hourly
  imports leaves `IMAGE` out (default, D72).
- A picture is shown as an image named "Image from <host>" to assistive technology (default, D72).

## Errors

- A wrong argument is `#VALUE!`: `IMPORTHTML`'s query not `"table"` or `"list"`, an index below 1, an unknown feed
  query, `num_items` below 1, an XPath the engine cannot read (or one past 1,000 characters).
- A formula whose arguments read `NOW`, `RAND`, `RANDARRAY` or `RANDBETWEEN`, directly or through other cells, is
  `#ERROR!` "This function is not allowed to reference a cell with NOW(), RAND(), RANDARRAY(), or RANDBETWEEN()";
  `TODAY` is allowed (verified: Google's help, "Learn more about Import functions").
- While the page is fetched the cell shows Loading… (`#N/A`, pending, as a Plan card before the cards arrive).
- A page not fetched is `#N/A` "Could not fetch url: …"; a table, list or node not there `#N/A` "Imported content is
  empty."; an answer past 100,000 values (D3) `#N/A` "Result too large" (Google's words; default, D64).
- A spreadsheet not yet allowed to fetch is `#REF!` "Allow access to fetch data from the web" (verified, below).
- A server that does not fetch is `#N/A` "This server does not fetch from the web" (S4: optional when self-hosted).
- Where no editor fetches for the engine (the api, MCP and CLI reading values, a Plan Sheet), each import is `#N/A`
  "Imports are fetched while the spreadsheet is open" (default, D65).

## Allow access

Google asks once per spreadsheet before its imports send and receive data from the web (verified: Google's help,
"Learn more about Import functions", and third-party reports that the formula shows `#REF!` until allowed).
`IMAGE` asks the same (verified: the help lists it with the four imports).

- A spreadsheet holding an import that is not yet allowed shows a bar above the grid: "Some formulas are trying to send
  and receive data from external parties." with **Allow Access** for Editors; everyone else sees the bar alone.
- Until an Editor allows, every import in the spreadsheet is `#REF!` and nothing is fetched.
- Allowing is for the spreadsheet, for everyone, for good: it is kept with the workbook, a copy starts without it,
  and it is never taken back (verified: Google's API refuses to set it back to false).
- An Editor allows with `POST /api/documents/<id>/workbook/imports`, sent to everyone as a `workbook` op.
- The api refuses to fetch for a spreadsheet not allowed, whatever the page asks.

### A spreadsheet in This Browser

A spreadsheet saved only in this browser has nothing on a server to fetch for, as Share has nothing to share: it is
offered **Sync Document** first, as [Offline mode](../006-document/offline-mode.md#sharing-a-document-in-this-browser)
offers it for every server-only feature.

- Its bar reads "This spreadsheet is saved only in this browser. Fetching data from the web needs it on LiveDoc."
  with **Sync Document**, which runs the document's own Sync Document, in place; never a second way to upload.
- The button waits for the reader to be known, shows **Syncing…** while it runs, and a failure says why
  (`syncFailureMessage`) and leaves it to try again, as the Share dialog's does.
- **Allow Access** appears only once the spreadsheet is on LiveDoc: the bar turns into the bar above.
- Until then every import and `IMAGE` is `#REF!` "This spreadsheet is saved only in this browser: sync it to fetch
  data from the web"; nothing is fetched and the api is never asked (default, D74).
- Taking a spreadsheet offline keeps its Allow Access with the workbook; its imports wait again until it is synced.

## Fetching

- The editor's engine asks the page for each distinct import (its arguments, as text) once; the page asks the api,
  at most 4 at once, and hands the answer back to the engine, which works out the cells reading it again.
- When the spreadsheet's rate is spent the page asks again a minute later, the cell Loading… meanwhile.
- The same import in many cells, and in every open copy of the page, is fetched once: the api keeps each answer for
  an hour, shared by everyone, as Google's imports refresh (verified: "automatically check for updates every hour
  while the document is open"; opening the spreadsheet again does not refresh).
- While the spreadsheet is open, each import still read is asked again every hour; the old values stay until the new
  ones arrive, and an answer like the last changes nothing.
- Typing an import into its cell again asks it afresh, past the api's hour, when the cell read an import before
  (verified: "overwrite the cells with the same formula, it triggers a refresh").

## The api's guards

`GET /api/documents/<id>/workbook/imports` fetches one import for a spreadsheet the caller may read
([API](../015-api/api.md)).

- It answers only where the deployment turns it on (`SHEET_IMPORTS=on`); without it, the refusal above.
- It answers only for a spreadsheet whose imports are allowed, else `imports_not_allowed`.
- Only `http` and `https` on their own ports (80, 443) are fetched (default, D66).
- The host is refused when it is, or resolves to, a loopback, private, link-local, metadata, shared (CGNAT),
  multicast or reserved address, an IPv6 unique-local, link-local or NAT64 one, or a `.local` or `localhost` name.
- The host is resolved over DNS over HTTPS before the fetch; a name that does not resolve is not fetched.
- Redirects are followed by hand, at most 5, each one checked as the first address was.
- A fetch takes at most 10 seconds and reads at most 5 MB, sends no cookie and no credential of the caller, and names
  itself `livedoc-import/1.0 (+https://docs.nu)` (default, D66).
- Each spreadsheet may make 60 fetches a minute (`SHEET_IMPORT_RATE_LIMITER`, keyed by document); answers from the
  hour's cache do not count (default, D66).
- A picture (`kind=image`) is answered as its bytes, at most 10 MB, with the type its first bytes show, `nosniff`
  and a policy that runs nothing; anything else, `not_an_image` (default, D73).
- Every refusal and failure is logged with its reason, the document and the host, never the whole address.

## Who may do what

- Imports are worked out for everyone who opens the spreadsheet: an Editor, a Participant and a Viewer alike see them.
- Allow Access: Editors only.
- Sync Document in the bar: whoever has the document in this browser (a This Browser document has no other reader).

## Telemetry

`Spreadsheet · Unlocked · ImportAccess` when an Editor allows access, sent before the change is saved.

## Defaults

- **D61** An address without a scheme: Read with `http://`; any other scheme, `#N/A` "Url not found" (default).
- **D62** IMPORTFEED's column titles and summary, IMPORTHTML's spans, IMPORTXML's elements: As written above (default).
- **D63** How imported text becomes values: Numbers and booleans as typed in the locale; dates stay text (default).
- **D64** The errors of a failed import: `#N/A` with Google's words (default).
- **D65** Imports where no editor fetches: `#N/A` "Imports are fetched while the spreadsheet is open" (default).
- **D66** The fetch's ports, time, size, name and rate: 80 and 443; 10 s; 5 MB; `livedoc-import/1.0`; 60 a minute
  per spreadsheet (default).
- **D72** IMAGE's unstated choices: Centred; mode 4's missing size in proportion; value empty text; 8 cells
  followed; every volatile read refused; nothing drawn without the page; 200 kept, not refreshed (default).
- **D73** The pictures IMAGE shows: PNG, JPEG, GIF, WebP, AVIF, BMP, icons, known by their first bytes; at most 10 MB
  (default).
- **D74** Imports and IMAGE in a This Browser spreadsheet: `#REF!` naming the reason, until Sync Document (default).
