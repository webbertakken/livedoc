# Agents and sync

**Status: partly built.** Reading (the three views), writing (text changesets through the api, the editor's toast
with Undo), the CLI's `livedoc text` commands and the MCP tools are built; page previews are being built; repository
sync is specified and waits on [Native files](../027-repositories/native-files.md), which is not built yet.

How agents read and write a [text document](text-document.md) through the MCP server and the CLI, and how a
[repository link](../027-repositories/repository-link.md) syncs it as a native file. People with the document open see
an agent's writing arrive at once, as anyone's.

## Reading

Views of the kind in `@livedoc/document-views` ([Document views](../024-agents/document-views.md)), cheap to read:

| View        | Shows                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `outline`   | Document tabs and headings, each with its paragraph number and the paragraphs under it                             |
| `text`      | The body as Markdown, paragraph numbers on request (`--lines`), whole or a range; kept content as `[kept: <name>]` |
| `structure` | Paragraphs with their style, lists, tables with their size, objects, sections, comments and suggestions, by id     |

- **Paragraph numbers are the refs.** A paragraph has no id, so every view and operation names one as `¶<n>`, counted
  from 1 over a document tab's body in reading order, a table's paragraphs row by row (a table in a cell within its
  row) as the text view prints them. A table of contents' entries are drawn, not written, and are not counted.
  Comments and suggestions keep their ids.
- **`only`** names the document tab `text` and `structure` read, and the one `outline` marks: its id, else its
  name in any case; the first by default. A name no tab has is refused `invalid_value`.
- **`outline`** (the default): a header `text-document "<name>" · <odt|docx> · <n> document tabs · <p> paragraphs`,
  then each document tab, `◂` on the one read, with its headings two spaces in a level:
  `¶12 H2 "Actions" (6 paragraphs)`, the paragraphs under it to the next heading of its level or above. Headings are
  the outline panel's ([The outline](links-and-navigation.md#the-outline)). A tab without headings says
  `no headings`; one holding nothing, `empty`.
- **`text`**: a header `text-document tab "<name>" · <p> paragraphs`, then the tab's writing as its Markdown download
  writes it, but read as it stands: pending suggestions in CriticMarkup, `{++inserted++}` and `{--deleted--}`.
  `lines` puts `¶<n> ` before each paragraph, and a table's row the numbers of the paragraphs it holds
  (`¶7..¶8 | Who | What |`). `range` (`40..60`, or one number) reads part of it, refused `invalid_value` outside
  `1..<p>`. A budget stops on a whole paragraph and ends `… ¶41..¶60 left out: <how to read them>`.
- **`structure`**: the same header, then a line a paragraph (`¶3 "Normal" list l1:0 ✓ "We ship…"`: its style, its
  list and level, ticked or not, its first 40 characters), a line a table (`table ¶7..¶10 2×2`, its paragraphs two
  spaces in), a line an object under its paragraph (picture, drawing, equation, with its alt text or linear form),
  section breaks, contents and kept content; then `comments` and `suggestions` by id, each with its paragraph and
  its first 40 characters, `none` when there are none.
- Every view answers `X-State-Vector`, the state it read (base64), which a changeset may give back as its `base`.
- A Viewer reads the views as their copy holds the document: no comments, no authors. The element views (`graph`,
  `layout`, `show`, ...) are refused `invalid_value`, naming the three.

## Writing

A text document changeset ([Agent changesets](../024-agents/agent-changesets.md)) is atomic, sequenced by the room,
attributed to the token, and revertable. Its operations:

| Operation                    | Does                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `edit <old> <new>`           | Replaces the one occurrence of `old` in the body's text with `new` (Markdown inline marks) |
| `insert after\|before <old>` | Inserts Markdown paragraphs after or before the paragraph holding the one `old`            |
| `append` / `prepend`         | Adds Markdown at the end or start of a document tab                                        |
| `style <ref> <style>`        | Sets a paragraph's style                                                                   |
| `format <old> <marks>`       | Formats the one occurrence of `old`                                                        |
| `table <ref> <op>`           | Inserts or deletes rows and columns, sets a cell's text                                    |
| `comment <old> <text>`       | Comments on the one occurrence of `old`                                                    |
| `suggest <operation>`        | Any operation above, made as a suggestion                                                  |
| `replace`                    | The whole body from Markdown; strict: refused unless `base` is the current revision        |

- **The grammar.** One operation a line, as [Edit operations](../024-agents/edit-operations.md) are written. Text is a
  JSON string (`"…"`, `\n` for a new line); a **target** is a quoted text that occurs once in the document tab, or a
  paragraph number `¶12` (`p12` too, for keyboards without ¶). `<markdown>` is a JSON string of Markdown, read as
  [Markdown is opened](files-and-print.md#opening): headings, paragraphs, lists, checklists, code blocks, pipe tables,
  bold, italic, strikethrough and links. `edit`'s new text takes the inline marks only.
  - `edit "old" "new"`; `insert after|before <target> <markdown>`; `append <markdown>`; `prepend <markdown>`.
  - `style <target> "<style>"`: a paragraph style by its name (`"Heading 2"`), or a role: `title`, `subtitle`,
    `normal`, `heading1` to `heading6`.
  - `format "old" <mark>…`: `bold`, `italic`, `underline`, `strike`, each `-bold` to take it off, and `link=<url>`
    or `-link`.
  - `table <target> add-row <n>` (after row `n`, 0 for first), `delete-row <n>`, `add-column <n>`, `delete-column
<n>`, `set <row>,<column> "text"`: the table holding the target paragraph, rows and columns counted from 1.
  - `comment "old" "text"`: a thread on the occurrence, by the token's owner.
  - `suggest` before `edit`, `insert`, `append`, `prepend` and `format` makes it a suggestion by the token's owner,
    as Suggesting mode would (`review.md`); before any other operation it is refused `invalid_operation` `(default)`.
  - `replace <markdown>`: the whole document tab, alone in its changeset, strict: refused `stale_tab` unless `base`
    is the state read.
- **The changeset** names its document tab (`documentTab`, an id or a name; the first by default), its `summary`, and
  optionally its `base`: the state vector the agent read, which every text document view answers as `X-State-Vector`
  (base64). Without `replace`, a base behind the document is no refusal: text matches the document as it is now.
- Text matches against the document as the api applies it, so an agent that read minutes ago lands where the words are
  now, or is told why not. A match lies within one paragraph and is exact, case and all. Operations apply in order,
  each against the writing the ones before it left, as one CRDT transaction that merges with live typing.
- Each operation prints a result line: `edited ¶12`, `inserted ¶13..¶15`, `appended ¶40..¶41`, `styled ¶4 "Heading 2"`,
  `formatted ¶7 bold`, `table ¶20 add-row 3`, `commented ¶3 <thread id>`, `suggested ¶9 <suggestion id>`,
  `replaced ¶1..¶30`.
- Named rejections, each writing nothing and naming the operation by its line: `invalid_operation` (what the grammar
  wanted), `text_not_found`, `text_ambiguous` (with each occurrence's paragraph), `ref_not_found` (a paragraph number
  past the tab, a document tab or style the document lacks, a target outside a table), `document_too_large`,
  `stale_tab`, `not_a_text_document` (a text operation to another kind or an element operation to this one).
- **How the writing lands** `(default)`:
  - A match lies within one run of text: a picture, a field, a note or another object between words breaks it.
  - Markdown's paragraphs take the document's own styles: a heading its heading style of that level, a code block its
    language's code style (added when the document lacks it), a list item a new list of the document's.
  - An inserted table is as wide as the text, its columns equal; `table … add-column` keeps the table's width, every
    column narrowed in proportion to make room for a column of the average width; `delete-column` narrows the table.
  - A merged cell across a row or column added grows by it; one across a row or column deleted shrinks by it.
    Deleting a table's last row or last column deletes the table.
  - `set` writes a cell's text as one paragraph in the style of the cell's first; a merged cell is set at any of its
    places.
  - `suggest` makes one suggestion of each operation: an `edit` is a deletion and an insertion under one id, inserted
    paragraphs carry it on their breaks and their text, an inserted table as a whole.
- **Verbs**: `text-document.view`, `text-document.edit` (the changeset), `text-document.download` (a format),
  `text-document.import`; MCP tools `read_text_document`, `edit_text_document`; previews of a page rendered through
  `render-png`.
- **CLI**: the kind is its own resource, `text-document` (alias `text`), as a spreadsheet is (`doc` names documents):
  - `livedoc text view <doc> [--as outline|text|structure] [--only <document tab>] [--range a..b] [--lines]`.
  - `livedoc text edit <doc> [ops…] [--file <f>|-] [--summary <s>] [--document-tab <t>] [--base <b>] [--dry-run]`: the
    words are one operation; a file (or stdin) holds one a line. It prints the result lines and the changeset.
  - `livedoc text download <doc> [--format odt|fodt|docx|txt|md|html|epub|rtf] [--to <path>]`: its own format by
    default, written under its name here.
  - `livedoc text import <file> [--name <n>]`: opened as File › Open opens it.
  - `<doc>` names a document holding a text document tab; `--tab` picks one by name or id when it holds several.
- **MCP** ([MCP server §4.9g](../015-api/mcp-server.md#49g-the-text-document-tools)): `read_text_document` answers a
  view and its `stateVector`; `edit_text_document` sends `ops` as one changeset and answers the result lines and
  the changeset, or a tool error naming the refused line. Both find the text document tab as `--tab` does.
- An agent's `create_document` with kind `text-document` makes one, born in ODF (fork C5), its body optionally from
  Markdown (`markdown`). A document an agent makes or opens (the MCP or `livedoc text import`) is tagged with its
  maker (`source`), as every agent-made document is.

## Page previews

An agent sees a page of a text document as a picture, **approximately**: the pages are laid out by the editor's own
arithmetic ([Laying out](page-layout.md#laying-out)), its lines broken from the advance widths of the font the
previews bundle (Inter) rather than measured in a browser, so a line may break a word earlier or later than the
editor's and a page start a paragraph apart. Every preview says so.

- **The route**: `GET /api/documents/:id/tabs/:tabId/page-previews?pages=<a..b>&only=<document tab>` lays out the
  document tab (`only` as the views take it; the first by default) and answers
  `{ pages: [{ number, width, height, svg }], pageCount, approximate: true }`: each page asked as SVG, in CSS pixels,
  and how many pages it has. `pages` is one number or a range, `1` by default, at most
  `TEXT_PREVIEW_PAGES_MAX` (3) pages a call. A page past the end is refused `page_not_found` naming how many there
  are; a tab that is no text document `not_a_text_document`; a document tab past the layout's size
  (`TEXT_PREVIEW_BLOCKS_MAX`, 5,000 blocks laid out) `document_too_large`. Read as the views are: a Viewer through
  their copy.
- **What is drawn** `(default)`: each page a sheet of its section's size and margins, white, its paragraphs in Inter
  at their size, weight, slant and colour, aligned and indented as styled, a list's marker before its first line;
  tables as their rows and columns with grid lines, a row moving whole; inline pictures as grey boxes of their size
  with their alt text; page, column and section breaks and a section's columns as the editor lays them. Headers,
  footers, footnotes, line numbers, floating pictures and drawings are not drawn. Every page carries
  `Approximate preview` small in its bottom margin.
- **Lines** `(default)`: words break at spaces and after hyphens, a word wider than the line by character, by the
  advance widths of the face the editor draws the run's font in (Arimo for Arial, Tinos for Times New Roman, Cousine
  for Courier New, Carlito for Calibri, Caladea for Cambria, and Roboto) and Inter's for any other; every face is drawn
  in Inter, bold from weight 600, each run fitted to the width its own face takes. A line's height is its largest size
  times the paragraph's line spacing (an exact or at-least height as given; 1.2 when it gives none). A cell's padding
  is the cell's own, none when it gives none, as the editor draws it.
- **The MCP**: `read_text_document` with `image` attaches the pages asked (`pages`, `1` by default) as PNGs through
  `render-png`, within the previews' size and memory budgets, and its answer's `preview` says which pages were drawn,
  how many pages there are and that they are approximate. `read_document`'s `image` on a text document tab draws its
  first page the same way.
- **The agreement measure**: a corpus of fixtures is laid out in the editor (an e2e fixture records each page's
  first paragraph) and by the previews; the share of page starts on the same paragraph is recorded in
  `packages/text-documents/corpus/page-starts.json` and a test holds it, never a widened tolerance. Measured: 21 of 24 pages start on the same block (88%); the
  rest differ by a table row or a list item, as the editor draws table guides and repeats header rows and the previews do
  not.

## Repository sync

- A text document is a **native file** ([Native files](../027-repositories/native-files.md)): an ODF one is written as
  its flat file `.fodt` (so diffs and `rg` read it), or as `.odt` when the link asks for packages
  (`[text-documents] form = "package"`); an OOXML one as its `.docx`.
- **Folding a file back**: a changed `.fodt` or `.odt` is read into a model, diffed against the nearest base by
  paragraph and character, and sent as a changeset that merges with live typing; a changed `.docx` the same way. A
  file that does not read is reported and left, never applied.
- The sync record holds each text document's revision and the hash of the bytes it wrote, as for pages.

## Share roles

An agent acts with its token's level: `edit` for every operation, `participate` for `comment` and `suggest` only (D7),
`view` for views and downloads.

## Telemetry

`Cli · Used · TextDocument<Verb>`, `Mcp · Used · TextDocument<Tool>` as the CLI's and MCP's telemetry already count
verbs. Never text.
