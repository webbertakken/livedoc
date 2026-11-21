# Imports from the web

`IMPORTDATA`, `IMPORTFEED`, `IMPORTHTML` and `IMPORTXML` read a page of the web into a spreadsheet, as Google Sheets'.
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

- A spreadsheet holding an import that is not yet allowed shows a bar above the grid: "Some formulas are trying to send
  and receive data from external parties." with **Allow Access** for Editors; everyone else sees the bar alone.
- Until an Editor allows, every import in the spreadsheet is `#REF!` and nothing is fetched.
- Allowing is for the spreadsheet, for everyone, for good: it is kept with the workbook, a copy starts without it,
  and it is never taken back (verified: Google's API refuses to set it back to false).
- An Editor allows with `POST /api/documents/<id>/workbook/imports-allowed`, sent to everyone as a `workbook` op.
- The api refuses to fetch for a spreadsheet not allowed, whatever the page asks.

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
- Every refusal and failure is logged with its reason, the document and the host, never the whole address.

## Who may do what

- Imports are worked out for everyone who opens the spreadsheet: an Editor, a Participant and a Viewer alike see them.
- Allow Access: Editors only.

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
