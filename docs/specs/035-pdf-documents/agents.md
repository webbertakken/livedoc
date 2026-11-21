# Agents

**Status: specified.** Nothing is built.

How agents read and change a [PDF document](pdf-document.md) through the MCP server and the CLI. People with the
document open see an agent's change arrive at once, as anyone's. An agent never receives a PDF's bytes to work out
for itself what a page says: it reads cheap text views, asks for a page's picture when it needs eyes, and writes
through operations the room sequences. The research is
[What the servers need](../../research/pdf-documents/servers.md).

## Reading

Views of the kind in `@livedoc/document-views` ([Document views](../024-agents/document-views.md)):

| View         | Shows                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| `overview`   | Pages, the PDF version, size, whether protected, signed, scanned; counts of marks, open threads, fields filled |
| `outline`    | The bookmarks, nested, each with its page                                                                      |
| `text`       | The text by page, whole or a page range (`--pages 3-7`), in reading order; recognised text marked as such      |
| `fields`     | Every field: its name, type, value, options, whether required or read-only, its page                           |
| `marks`      | Every mark: its ref, kind, page, the text it covers or its words, author, and its thread's state               |
| `comments`   | Threads in page order: the anchor's text, each comment with author and time, resolved or open                  |
| `signatures` | Each certificate signature: signer, time, what it covers, intact or not, what changed after it                 |
| `find`       | Every occurrence of a query, with its page and a line of context                                               |

- A page's text is labelled `## Page 3` (with its label where the file has one), so an agent quotes a page it read.
- A view never prints a password, a certificate, or the text of a protected PDF the server cannot read: such a view
  answers `pdf_protected`.
- **A page's picture** comes through `render-png`: the engine's own drawing of one page at a stated width, light
  paper always, marks included, Dark pages never.
- A view of a file past what the server holds answers `pdf_too_large_for_server`; the CLI then reads the file on the
  person's machine with the same engine and gives the same views.

## Changesets

A PDF document changeset ([Agent changesets](../024-agents/agent-changesets.md)) is atomic, sequenced by the room,
attributed to the token, and revertable. Its operations:

| Operation                                            | Does                                                                                        | Least level |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------- |
| `highlight <text>` (or `underline`, `strikethrough`) | Marks the one occurrence of `text`, on a page where given (`--page`)                        | participate |
| `note <text\|page x y> <words>`                      | A note on the one occurrence of `text`, or at a place on a page                             | participate |
| `comment <text\|ref> <words>`                        | Comments on the one occurrence of `text` (highlighting it), or replies on a mark's thread   | participate |
| `resolve <ref>` / `reopen <ref>`                     | A thread's state                                                                            | participate |
| `fill <field> <value>`                               | Sets a field's value, checked against its type, options and format                          | participate |
| `remove <ref>`                                       | Deletes a mark the token's own, or any mark at `edit`                                       | participate |
| `replace-text <old> <new>`                           | Replaces the one occurrence of `old` in a page's own text ([Editing text](editing-text.md)) | edit        |
| `pages <op>`                                         | `move`, `delete`, `rotate`, `insert-blank`, `insert-from <document>`, `extract`             | edit        |
| `bookmark <op>`                                      | Adds, renames, moves or deletes a bookmark                                                  | edit        |
| `properties <key> <value>`                           | Sets a property: title, author, subject, keywords                                           | edit        |
| `replace`                                            | The whole stored file from new bytes; strict: refused unless `base` is the current revision | edit        |

- Text matches against the PDF as the api reads it at that moment, so an agent that read minutes ago lands where the
  words are now, or is told why not.
- A changeset applies as one transaction on the live changes and merges with what people are doing; reverting one
  takes back exactly its changes.
- **An agent never signs.** A drawn or a certificate signature is a person's act; no operation places one, and a
  changeset touching a signature field's value is refused (`signature_is_a_persons`).
- **An agent never redacts, protects or removes hidden information**: those destroy content for good and are a
  person's, in the surface ([Redaction and protection](redaction-and-protection.md)).
- An `edit`-level operation on a file with certificate signatures is refused with `would_invalidate_signatures`
  unless the changeset says `--allow-invalidating-signatures`, as a person is asked first
  ([Signing](signing.md#changes-after-a-signature)).
- Named rejections, each writing nothing: `text_not_found`, `text_ambiguous` (with each occurrence's page and line),
  `page_not_found`, `field_not_found`, `field_value_invalid` (with why), `field_read_only`, `ref_not_found`,
  `not_a_pdf_document`, `stale_tab`, `stored_file_changed`, `pdf_protected`, `pdf_too_large_for_server`,
  `level_too_low`, `would_invalidate_signatures`, `signature_is_a_persons`, and the limits' own names.

## Verbs, tools and commands

| Verb           | CLI                          | MCP tool           | Does                                                                 |
| -------------- | ---------------------------- | ------------------ | -------------------------------------------------------------------- |
| `pdf.view`     | `livedoc pdf view <view>`    | `read_pdf`         | A view above                                                         |
| `pdf.edit`     | `livedoc pdf edit`           | `edit_pdf`         | A changeset                                                          |
| `pdf.preview`  | `livedoc pdf preview <page>` | `preview_pdf_page` | A page's picture                                                     |
| `pdf.download` | `livedoc pdf download`       | `download_pdf`     | A bake, or the stored file with `--stored`; a link for MCP           |
| `pdf.import`   | `livedoc pdf import <file>`  | `import_pdf`       | A PDF as a new PDF document, from bytes; an address is never fetched |

- Each verb has a guide in `@livedoc/agent-verbs`, as every verb has, with one worked example.
- `create_document` with kind `pdf` needs bytes: a PDF document is never made from nothing by an agent
  ([Starting and finding](starting-and-finding.md), fork F12).
- A download through the api is the server's bake where it can make one, else the stored file with a header naming
  how many changes it lacks; the CLI bakes on the person's machine.

## Share roles

An agent acts with its token's level: `edit` for every operation, `participate` for marks, comments, threads and
fields, `view` for views, previews and downloads. The room checks what a changeset touches, as it checks a person's
update ([Live editing and storage](live-editing-and-storage.md#the-rooms-op-kinds)).

## Limits

| Constant                       | Value  | Why                                                            |
| ------------------------------ | ------ | -------------------------------------------------------------- |
| `PDF_VIEW_MAX_CHARS`           | 60,000 | `(default)` One view's answer; more is asked for by page range |
| `PDF_PREVIEW_MAX_PX`           | 2,000  | `(default)` A preview's longer side                            |
| `PDF_CHANGESET_MAX_OPERATIONS` | 500    | `(default)` One changeset; a larger job is several             |

## Telemetry and observability

- `Cli · Used · Pdf<Verb>`, `Mcp · Used · Pdf<Tool>`, `Agent · Viewed · Pdf<View>`, and the changeset events agents
  already have (`Agent · Applied`, `Conflicted`, `Reverted`). Never text.
- Fingerprints: `[pdf] changeset applied operations=<n>`, `[pdf] changeset refused name=<name>`,
  `[pdf] view name=<view> pages=<n> chars=<n>`.

## Tests

- Each view on each corpus group prints what the surface shows; measured for cost with
  [Evaluate MCP output](../../instructions/evaluate-mcp-output.md).
- Each operation applies, merges with a person's concurrent change, and reverts; each rejection is raised by a test
  and writes nothing.
