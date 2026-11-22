# PDF document

**Status: specified; a first slice is built.** Built: the tab kind `pdf` and its surface, a PDF dropped on the Explorer
becoming a PDF document, its stored file in the blob store, its pages read and drawn, a highlight, and Download as
PDF. Everything else here is specified, not built.

A **PDF document** is a tab of the `pdf` [tab kind](../006-document/document.md#domain-language): one PDF, read,
reviewed and really edited by people together, live, and **always a PDF**. The file that leaves LiveDoc is a PDF any
reader opens, holding every change; a PDF opened and left alone leaves byte for byte as it came (ruling C1). It is
worked on in three [editing modes](editing-modes.md): Viewing, Reviewing and Editing (ruling C2). Every function is
accounted for in the [parity matrix](parity-matrix.md). The research is in `docs/research/pdf-documents/`.

A PDF document is a document with a single PDF tab: its tab strip is hidden and the tab holds the data, so a second
tab can join it later without changing what the document is, as a [text document](../034-text-documents/text-document.md)
is a document with one text document tab.

## Why a tab kind

A new kind is added only when no mode can serve the use
([Domain language](../003-system-architecture/domain-language.md#kind)). None can here:

- A [file tab](../006-document/file-tab.md) holds a file's bytes and changes them whole, the later replace winning.
  Two people highlighting one contract would lose one of the highlights
  ([The live model](../../research/pdf-documents/live-model.md)).
- A text document or a canvas holds a model of LiveDoc's own. Reading a PDF into one is a conversion: what the model
  does not hold is gone, the file's signatures break, and it never leaves as the same file.
- A PDF's own functions (marks on a page, fields, signatures over byte ranges, a page's drawing operators, passwords)
  belong to the format, not to elements on a canvas.

So a PDF document holds **the file itself**, never altered, and **what people changed since**, live; every view of it
and every file handed out is made from those two ([Saving](saving.md)).

## Domain language

| Term                      | Means                                                                                                                  | Never called                                                           |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **PDF document**          | A tab of kind `pdf`; also, in copy, the document whose single tab it is                                                | file document (that is the file tab's), PDF file (that is what leaves) |
| **PDF page**              | One page of a PDF document. Inside a PDF document's surface and specs, "page" alone means this                         | sheet, slide; page alone where a markdown page could be meant          |
| **stored file**           | The PDF's bytes as LiveDoc holds them: exact, never altered, named by their SHA-256                                    | base (that is a sync's), original, source (that is a diagram's text)   |
| **live changes**          | Everything changed since the stored file, held in the room and seen by everyone at once                                | layer (see PDF layer), changeset (that is an agent's write), draft     |
| **bake**                  | Writing a PDF from the stored file and its live changes; the result is a **baked file**                                | export, save, render                                                   |
| **page content**          | What a PDF page's author drew on it: its text, pictures and shapes                                                     | body (that is a text document's), elements (those are a canvas's)      |
| **object**                | One piece of page content: a text box, a picture or a shape                                                            | element, block                                                         |
| **text box**              | Lines and paragraphs of a page's text, grouped so they are edited as writing                                           | text block, paragraph (a PDF holds none), text mark                    |
| **mark**                  | Something placed on top of a PDF page that leaves its page content alone: a highlight, a note, a drawing, a stamp      | annotation (the file's own word), markup, comment, marker              |
| **comment**               | A thread on a mark, with replies, mentions, reactions and an optional assignee                                         | annotation, note (a note is a mark)                                    |
| **field**                 | One input a PDF carries: a text field, tick box, radio group, dropdown, list, button or signature field                | form field, form (that is a Form tab), widget (the file's own word)    |
| **field value**           | What a field holds                                                                                                     | answer, response (those are a Form tab's)                              |
| **drawn signature**       | A picture of a signature, placed on a page or in a signature field; it proves nothing by itself                        | e-signature, signature alone                                           |
| **certificate signature** | A cryptographic signature over the file's bytes, made with a person's certificate file                                 | digital signature, digital ID (in copy)                                |
| **certificate file**      | A person's `.p12` or `.pfx`: their certificate and its private key, read in the browser and never uploaded             | digital ID, key file                                                   |
| **stamp**                 | A mark that is a ready-made word or picture ("Approved", a tick, a company seal)                                       | sticker (that is a canvas's), badge                                    |
| **redaction**             | Content removed from the file for good: marked first (a **redaction mark**), then applied                              | blackout, hiding, censoring                                            |
| **flatten**               | Writing marks or fields into the page content, so they are no longer marks or fields                                   | bake, merge, burn in                                                   |
| **bookmark**              | One entry of a PDF document's outline: a title and the place it opens                                                  | heading (a PDF holds none), destination (the file's own word)          |
| **embedded file**         | A file a PDF carries inside it                                                                                         | attachment (that is a badge's hold on an element)                      |
| **PDF layer**             | A named group of page content its author made switchable                                                               | layer alone in specs and code (that is a canvas tab's)                 |
| **protection**            | A PDF's **open password** and **permissions password**, and what the permissions ask of a reader                       | security, lock, user and owner password (the file's own words)         |
| **scanned page**          | A PDF page that is a picture of a page, with no text of its own                                                        | image page, photo                                                      |
| **text recognition**      | Reading the words of a scanned page                                                                                    | OCR (in copy)                                                          |
| **Dark pages**            | One person's view of the pages shown dark; never part of the file ([Dark pages](dark-pages.md))                        | dark mode (that is the scheme), night mode, invert                     |
| **editing mode**          | How one person works on the PDF document right now: Viewing, Reviewing or Editing                                      | mode (that is the canvas tab's), role, tool                            |
| **refusal**               | A named reason a PDF is not opened or a change is not made, with its own copy ([Opening](opening.md#refusals))         | error, failure (in copy)                                               |
| **previous version**      | A stored file LiveDoc held before the current one, kept as the [file tab](../006-document/file-tab.md#changing-it) has | backup, base                                                           |

- "Document" alone keeps its meaning, the container. Copy says **PDF document** where the kind matters ("Open as a
  PDF document") and **document** where it does not ("Share this document"). The file handed out is "the PDF" or "this
  file".
- An **editing mode** is one person's, never the tab's: switching it changes no content and nobody else follows, so it
  is not an [editor mode](../007-editor/editor-modes.md). A PDF document has no editor mode at all.
- A mark is never called an annotation outside the mapping onto the file ([Marks](marks.md#in-the-file)), and a field
  is never called a form: a **Form** is a Form tab ([Forms](../030-forms/forms.md)), and a PDF's fields are "the
  fields of this PDF".
- A text box here is page content in Editing. Sketch mode's [text box](../023-draw-mode/draw-mode.md) is a canvas
  element; the two never meet, since a PDF tab holds no elements.

### Words tested against the taken ones

Each word above was tested against [Domain language](../003-system-architecture/domain-language.md) and the specs of
the other kinds before any spec here used it:

| Word wanted | Taken by                                                                                     | So a PDF document says                               |
| ----------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| page        | A document with one markdown tab, as people speak of it; Pages mode                          | **PDF page**; "page" alone only inside the kind      |
| base        | The snapshot a local change was made from; a merge's common ancestor                         | **stored file**                                      |
| layer       | A canvas tab's layers; and a PDF's own switchable content                                    | **live changes** for the one, **PDF layer** the file |
| attachment  | A badge or step number held on a host element                                                | **embedded file**                                    |
| form        | A Form tab                                                                                   | **fields**                                           |
| annotation  | Nothing in LiveDoc's language; a comment is "never called annotation"                        | **mark**, with **comment** for its thread            |
| outline     | The document's tab outline; a text document's headings panel; an agent's view                | The panel is the **outline**, its entries bookmarks  |
| mode        | An editor mode, the tab's                                                                    | **editing mode**, one person's                       |
| version     | A saved state seen and restored ([Review surfaces](../012-collaboration/review-surfaces.md)) | The same, unchanged                                  |
| suggestion  | A text document's tracked change; an agent's proposed note                                   | Not used: a PDF has no suggestions                   |
| mark        | No term; a file tab's `marks` field says why a text file is held as a file                   | **mark**, the term; the field is not reused          |

## What it holds

| Field        | Holds                                                                                                                               |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | `'pdf'`                                                                                                                             |
| `name`       | The tab's name, as every tab has; in a single-tab document it is never shown                                                        |
| `blob`       | The key of the stored file in the blob store: its SHA-256, as a [file tab](../006-document/file-tab.md)'s is                        |
| `size`       | The stored file's byte count                                                                                                        |
| live changes | Marks, field values, drawn signatures, page operations, object edits, recognised text ([Live editing](live-editing-and-storage.md)) |
| comments     | Comment threads, each on a mark ([Comments](comments.md))                                                                           |
| merge state  | What the live merge needs to keep concurrent changes apart ([Live editing](live-editing-and-storage.md))                            |

A PDF tab has **no elements, layers, theme, background, finish or editor mode**; `elements` alone stays, always
empty, as the tab shape every reader shares holds it. Nothing that reads a tab mistakes a PDF document for an empty
diagram:

- the tab validator refuses a PDF tab holding any element, or a `blob` that is not a SHA-256 in lower-case hex;
- no mode is written onto it and the mode switch of a canvas is never offered;
- whether it has content, its counts and its search text come from its digest
  ([Live editing and storage](live-editing-and-storage.md#the-digest)), never from `elements`.

## What becomes a PDF document

- **A file whose bytes are a PDF** becomes a PDF document, by every way a file arrives: a drop, a paste, an import, a
  sync, the Drive mirror, an agent ([Files, print and sync](files-print-and-sync.md#opening)). Bytes are a PDF when
  `%PDF-` is found in their first `PDF_SNIFF_BYTES` (1,024), as readers look for it; the name's extension decides
  nothing.
- A file named `.pdf` whose bytes are not a PDF is a [file document](../006-document/file-tab.md).
- **A PDF LiveDoc cannot read is still a PDF document.** Its stored file is kept exactly, its surface shows the
  [refusal](opening.md#refusals) with **Download**, and it syncs out byte for byte. Only a file too large to hold, or a
  server with no file storage, keeps a PDF out.
- **None is opened by converting it.** Opening a PDF as a text document is another kind's import, a copy
  ([Files and print](../034-text-documents/files-and-print.md#opening)).

## The single-tab document

- **A PDF arriving** makes a document with one PDF tab, named as the file is without its extension.
- **Its name is the document's.** The title row's name field renames the document; the tab's name follows it while the
  document has one tab.
- **The tab strip is hidden** while the document has one tab, and the canvas's chrome is not mounted
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md)).
- **Adding a tab of another kind** to it shows the tab strip, as in any document with two tabs.
- **A PDF tab in another document**: a PDF dropped on an open document's canvas or tab strip joins it as a PDF tab,
  for whoever may add tabs `(default)`; the add menu offers **PDF from a file**.
- A spreadsheet takes no PDF tab: a document holding sheets holds only sheets
  ([Spreadsheet](../029-sheets/spreadsheet.md)).

## Limits

| Constant             | Value                | Why                                                                                                           |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FILE_TAB_MAX_BYTES` | 100,000,000 (100 MB) | The file tab's own cap, shared (F6, ruled; [Bytes](../../research/pdf-documents/bytes.md#the-numbers-for-f6)) |
| `PDF_SNIFF_BYTES`    | 1,024                | Where readers look for `%PDF-`: a file with leading junk still opens                                          |
| `PDF_MAX_MARKS`      | 20,000               | `(default)` Marks in one PDF document: far past use, and a bound on what one open replays                     |
| `PDF_MAX_PAGES`      | 100,000              | `(default)` A ceiling on inserted pages; a file arriving with more opens and takes no insert                  |

A change that would pass a limit is refused as a whole, with the limit named
([Live editing and storage](live-editing-and-storage.md#limits)).

## Share roles

A Participant does **all of Reviewing**: marks, comments, fills fields, and signs with drawn and certificate
signatures (F7, ruled). What Reviewing does sits on top of a page; what Editing does changes the pages, so it is an
Editor's.

| Role            | With a PDF document                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| **Editor**      | Everything: all of Reviewing, and Editing's page content, pages and document tools; restores versions; renames |
| **Participant** | Reads; all of Reviewing: marks, comments, fills fields, signs; never changes page content or pages             |
| **Viewer**      | Reads, finds and copies text, sees marks and comments, downloads and prints unless the owner turned that off   |

Each is gated on the session's `can`, never on read-only alone
([Gate a feature by share role](../../instructions/gate-a-feature-by-share-role.md)); each area's spec carries its own
role line.

## Telemetry and observability

- A PDF document's events share one category, `Pdf`, with the actions telemetry already has
  ([Telemetry](../017-telemetry/telemetry.md)); each area's spec lists its own. Here: `Pdf · Imported · <Way>` (a PDF
  arriving: `Drop`, `Paste`, `Explorer`, `Tab`, `Sync`, `Drive`, `Agent`) and `Pdf · Exported · <As>` (a
  download, `As` one of [Downloading](files-print-and-sync.md#downloading)'s).
- Comments keep the comment category (`Comment · Added · Pdf`), the office shell its own menu and tool finder events
  ([Office shell](../004-interface-design/office-shell.md#telemetry)), and an open is the editor's own
  `Document · Loaded`, counted once.
- A type is a preset token: never a name, a password, a field value or any text of the file.
- Fingerprints, each with the document and tab ids and never content or names: `[pdf] arrived` (bytes, whether
  they were held already), `[pdf] opened` (pages, bytes, whether read by range, how long the read and the engine
  took), `[pdf] surface` (each state the surface shows, a refusal with its name), `[pdf] refused` (with the
  refusal's name), `[pdf] limit-refused` (with the limit's name), `[pdf] drop failed` (a drop the Explorer could not
  open).

## Non-goals

- **A PDF on the canvas.** A PDF document is never drawn as elements on a canvas tab. A canvas embeds a link to it, as
  to any document; placing a PDF page on a canvas as a picture is the image element's own import.
- **Scripts.** No script a file carries ever runs ([Security](security.md#scripts)).
- **Sending a document out for signature**, and certificates issued by LiveDoc (ruling C4: left out).
- **Suggestions.** A PDF has no tracked changes; Reviewing's marks are how a change is proposed.
- **Being Acrobat.** The functions are measured against Acrobat's ([Parity matrix](parity-matrix.md)); its name, logos
  and artwork never appear, and the surface is LiveDoc's own office shell.
