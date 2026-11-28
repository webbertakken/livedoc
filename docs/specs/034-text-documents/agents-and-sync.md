# Agents and sync

**Status: partly built.** Reading (the three views) is built; writing and sync are specified.

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
- **Verbs**: `text-document.view`, `text-document.edit` (the changeset), `text-document.download` (a format),
  `text-document.import`; CLI commands `livedoc doc view|edit|download|import` and MCP tools `read_text_document`,
  `edit_text_document`; previews of a page rendered through `render-png`.
- An agent's `create_document` with kind `text-document` makes one, born in ODF (fork C5).

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
