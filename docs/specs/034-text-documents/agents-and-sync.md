# Agents and sync

**Status: specified.** Nothing is built.

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
  from 1 over a document tab's body in reading order, a table's paragraphs row by row as the text view prints them.
  Comments and suggestions keep their ids.
- **`outline`** (the default): a header `text-document "<name>" · <odt|docx> · <n> document tabs · <p> paragraphs`,
  then each document tab, `◂` on the one read, with its headings two spaces in a level:
  `¶12 H2 Actions (6 paragraphs)`. A tab without headings says `no headings`; an empty body, `empty`.
- **`text`**: the tab's body as its Markdown download writes it; `lines` puts `¶<n> ` before each paragraph; `range`
  (`40..60`, or one number) reads part of it, refused `invalid_value` outside `1..<count>`.
- **`structure`**: a line a paragraph (its style, its list and level, ticked or not), a line a table (its first and
  last paragraph, rows × columns), a line an object (picture, drawing, equation, with its alt text), section breaks;
  then the comments and the suggestions by id, each with its paragraph and its first 40 characters.
- A Viewer reads the views as their copy holds the document: no comments, no authors. A link to one document tab reads
  that tab. The element views (`graph`, `layout`, `show`, ...) are refused `invalid_value`, naming the three.

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

- Text matches against the document as the api applies it, so an agent that read minutes ago lands where the words are
  now, or is told why not. Edits apply as one CRDT transaction and merge with live typing.
- Named rejections, each writing nothing: `text_not_found`, `text_ambiguous` (with each occurrence's paragraph),
  `document_too_large`, `stale_tab`, `not_a_text_document` (a text operation to another kind or an element operation
  to this one), `ref_not_found`.
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
