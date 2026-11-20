# Text document

**Status: specified; the kind, its format, opening and downloading a file are built.**

A **text document** is a tab of the `text-document` [tab kind](../006-document/document.md#domain-language): pages of
writing, edited together live, held in one model that both open standards for word processing map onto, and leaving
LiveDoc in the **format it arrived in**: an `.odt` or `.fodt` file as ODF 1.4, a `.docx` file as OOXML, each one any
office suite opens (fork C1, ruled: both native). It is worked on as Google Docs is: the same title row, menus, toolbar, ruler,
pages, side panels, dialogs and shortcuts ([Editing surface](editing-surface.md)), every function accounted for in the
[parity matrix](parity-matrix.md). (The name is fork D1, ruled 2026-11-18.)

A text document is a document with a single text document tab: its tab strip is hidden, and the tab holds the data,
so a second tab can join it later without changing what the document is, as a [page](../031-markdown/markdown-tab.md)
is a document with one markdown tab.

## Why a tab kind

A new kind is added only when no mode can serve the use
([Domain language](../003-system-architecture/domain-language.md#kind)). None can here:

- Writing that people send as files (letters, reports, proposals, minutes) has to leave as a file other suites open
  as it looks here, and come back from them. A canvas tab's pages hold elements laid out in canvas pixels, and an
  [article](../007-editor/article-pages.md) holds blocks a canvas lays out; neither is a word-processing document, so
  every file round trip would be a conversion with losses.
- Google Docs' functions (sections, headers and footers, footnotes, columns, tables across pages, suggestions kept as
  tracked changes, version history) belong to a document model, not to elements on a canvas.
- Two people typing in one paragraph must both keep every character, offline and on branches
  ([Live editing](live-editing-and-storage.md)), which the article's block-by-block sync cannot promise.

So the text document holds **one document model both standards map onto**, and every view of it, the editor included, is drawn
from that model.

## Domain language

| Term                | Means                                                                                                                            | Never called                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **text document**   | A tab of kind `text-document`; also, in copy, the document whose single tab it is                                                | doc, article (that is Pages'), page, note, writing |
| **body**            | The text document's main flow: its paragraphs, headings, lists, tables and objects, in order                                     | content, text (that is the markdown tab's)         |
| **paragraph**       | One block of the body with one paragraph style; a heading is a paragraph with a heading style                                    | block (that is the article's), line                |
| **run**             | A stretch of a paragraph's characters with the same formatting                                                                   | span (that is the file's element)                  |
| **paragraph style** | A named set of paragraph and text formatting: Normal text, Title, Subtitle, Heading 1 to 6                                       | look (that is the article's), theme                |
| **section**         | A stretch of the body with its own page setup, columns, headers and footers                                                      | chapter, part                                      |
| **page setup**      | Paper size, orientation, margins and page colour of a section, or of the whole document                                          | page style (that is the file's element), layout    |
| **pageless**        | The text document shown as one continuous column with no pages, breaks or headers                                                | web layout, continuous mode                        |
| **document tab**    | One of the text document's own named parts, each with its own body, listed in the outline                                        | tab (that is the document's), page, section        |
| **object**          | A picture, drawing, chart, equation or horizontal line placed in the body                                                        | element (that is the canvas's), zone, embed        |
| **comment**         | A thread on a stretch of the body, with replies, mentions, reactions and an optional assignee                                    | margin note (that is the article's), annotation    |
| **suggestion**      | One proposed change (insertion, deletion, formatting) shown in place, kept as its format's tracked change                        | revision, tracked change (in copy), proposal       |
| **editing mode**    | How one person works on the text document right now: Editing, Suggesting or Viewing                                              | mode (that is the canvas tab's), role              |
| **version**         | A saved state of the text document, named or automatic, that can be seen and restored                                            | snapshot (that is the repository's), revision      |
| **format**          | Which standard a text document is held in: **ODF** (ODF 1.4 part 3, `office:text`) or **OOXML** (ISO/IEC 29500 WordprocessingML) | file type (in copy), native format                 |
| **conversion**      | A person's choice to change a text document's format, its losses listed before it runs                                           | export, save as                                    |
| **flat file**       | ODF's single-XML form of a text document, `.fodt`                                                                                | XML export, source                                 |

- An **editing mode** is one person's, never the tab's: switching it changes no content and nobody else follows, so it
  is not an [editor mode](../007-editor/editor-modes.md), which the tab holds for everyone. A text document has no
  editor mode at all.
- "Document" alone keeps its meaning, the container. Copy says **text document** where the kind matters ("New text
  document", "Download this text document as") and **document** where it does not ("Share this document").
- A text document's **document tabs** live inside its one tab; the document's own tab strip stays hidden. The two are
  never called by each other's name ([Tabs inside one text document](#tabs-inside-one-text-document)).

## What it holds

| Field        | Holds                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `kind`       | `'text-document'`                                                                                                                     |
| `name`       | The tab's name, as every tab has; in a single-tab document it is never shown                                                          |
| `format`     | `odf` or `ooxml`: the format it arrived in, or was born in ([Born in](#the-format-it-is-in))                                          |
| model        | The text document: its document tabs, each with a body; styles; page setups and sections; lists; fields                               |
| comments     | Comment threads, each anchored to a stretch of the body ([Review](review.md))                                                         |
| suggestions  | Tracked changes, each attributed and dated ([Review](review.md))                                                                      |
| kept content | What a file brought that the model does not hold, kept to write back untouched ([Standard mapping](standard-mapping.md#kept-content)) |
| merge state  | What the live merge needs to keep concurrent edits apart ([Live editing and storage](live-editing-and-storage.md))                    |

A text document tab has **no elements, layers, theme, background, finish or editor mode**. Tab settings that only make
sense on a canvas are absent; `elements` alone stays, always empty, as the tab shape every reader shares holds it
(default). Nothing that reads a tab mistakes a text document for an empty diagram:

- the tab validator refuses a text document tab holding any element, or a `format` outside `odf` and `ooxml`;
- no mode is written onto it and the mode switch is never offered;
- whether it has content, its counts and its search text come from its live state
  ([Live editing and storage](live-editing-and-storage.md#the-digest)), never from `elements`.

Pictures, drawings and charts placed in it are its objects, held in its model and its package, never canvas elements
([Objects](objects.md)).

## The format it is in

- **Both formats are native** (fork C1, ruled). Neither is an export of the other: a text document opened from a
  `.docx` is held as OOXML and leaves as `.docx`; one opened from an `.odt` or `.fodt` is held as ODF and leaves as
  `.odt` (or `.fodt` where a repository link asks for diffs).
- **One model.** Both formats map onto the same model ([Standard mapping](standard-mapping.md)); what a format holds
  that the model does not is kept and written back in that format, untouched.
- **Born in.** A text document made in LiveDoc (blank, template, agent) is born in **ODF 1.4**, as
  an `.odt` (fork C5, ruled). It is no setting: conversion is how one becomes OOXML.
- **Converting** is a person's choice, never a side effect: File > Convert to Word format (or to OpenDocument format)
  lists what the other format cannot hold before it runs, then changes `format` as one undo step. Downloading in the
  other format writes a converted copy and leaves the document as it is ([Files and print](files-and-print.md#downloading)).
- **Shown, not hidden.** The title row names the format beside the name, as Google Docs names an Office file
  (`.DOCX`, `.ODT`) ([Editing surface](editing-surface.md#the-title-row)).

## The single-tab document

- **Creating** a text document (the Explorer's New, `/new?kind=text-document`, a template, an import, an agent) makes
  a document with one text document tab, named as the document is.
- **Its name is the document's.** The title row's name field renames the document; the tab's name follows it while the
  document has one tab ([Editing surface](editing-surface.md#the-title-row)).
- **The tab strip is hidden** while the document has one tab, and the editor's canvas chrome (mode switch, palette,
  toolbar strip, minimap, zoom controls, the canvas itself) is not mounted ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md)).
- **Adding a tab of another kind** to it (a diagram beside the writing) shows the tab strip, as in any document with two
  tabs; the text document tab keeps its own surface when selected.
- **A text document tab in a canvas document**: a person adding a tab to any document may choose Text document; the
  tab opens on its own surface.

## Tabs inside one text document

Google Docs' **document tabs** split one text document into named parts, each with its own body, listed in the outline
panel with their headings; they nest three levels deep (assumed, from the product as known; confirmed with the
[captures](../../research/docs-open-standard/reference-captures.md)).

- A text document holds at least one document tab, named **Tab 1** until renamed; the outline lists them.
- Each document tab has a body, and may have child document tabs, to a depth of 3 (`TEXT_DOCUMENT_TAB_DEPTH`).
- Styles, page setups, comments and suggestions belong to the whole text document; a section belongs to one document
  tab's body.
- In the file, a text document with one document tab is an ordinary text document. With more, each document tab is a
  `text:section` at the body's top level, carrying its name and nesting in the `livedoc:` extension, so any suite
  shows every tab's writing one after another ([Standard mapping](standard-mapping.md#extensions)).

## Limits

| Constant                    | Value     | Why                                                                                    |
| --------------------------- | --------- | -------------------------------------------------------------------------------------- |
| `TEXT_DOCUMENT_MAX_CHARS`   | 1,020,000 | Google Docs' own limit, 1.02 million characters (verified in the research's inventory) |
| `TEXT_DOCUMENT_TAB_DEPTH`   | 3         | Google Docs' nesting depth (assumed, to confirm with the captures)                     |
| `TEXT_DOCUMENT_MAX_TABS`    | 100       | (default) A ceiling far past use; each document tab is a body the outline lists        |
| `TEXT_DOCUMENT_MAX_OBJECTS` | 2,000     | (default) Pictures and drawings per text document, each a package entry                |

An edit that would pass a limit is refused as a whole, with the limit named
([Live editing and storage](live-editing-and-storage.md#limits)).

## Share roles

| Role            | With a text document                                                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Editor**      | Everything: edits, formats, sets up pages, inserts, accepts and rejects suggestions, restores versions, renames              |
| **Participant** | Reads; comments, replies, resolves, reacts; makes suggestions in Suggesting mode (fork D7, ruled: as Google's Commenter may) |
| **Viewer**      | Reads, comments visible, finds text, counts words, downloads and prints unless the owner turned that off; changes nothing    |

Each is gated on the session's `can`, never on read-only alone
([Gate a feature by share role](../../instructions/gate-a-feature-by-share-role.md)); each area's spec carries its own
role line.

## Telemetry and observability

- `Document · Created · TextDocument` (any create path), `Tab · Created · TextDocument` (a text document tab added to a
  document by the add menu), `Tab · Imported · Odt` or `Docx` (a file opened as a text document),
  `Document · Exported · TextDocumentOdt`, `TextDocumentFodt` or `TextDocumentDocx` (a download), and the office
  shell's menu and tool finder events ([Office shell](../004-interface-design/office-shell.md#telemetry)).
  An open is the editor's own `Document · Loaded`, counted once. Never text.
- Fingerprints, each with the document and tab ids and never text: `[text-document] created`,
  `[text-document] opened`, `[text-document] limit-refused` (with the limit's name).

## Non-goals

- **A text document on the canvas.** A text document is never drawn as elements on a canvas tab, and a canvas tab's
  pages never hold one. A canvas embeds a link to it, as to any document.
- **Macros and scripts.** Neither a file's macros nor Google's Apps Script and add-ons run in a text document
  ([Parity matrix](parity-matrix.md), fork C3, ruled: left out).
- **Smart chips and an assistant** (fork C3, ruled: left out). A chip in an arriving file is kept as its text.
