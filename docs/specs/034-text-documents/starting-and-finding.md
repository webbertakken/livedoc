# Starting and finding

**Status: being built.** New Document offers a text document; the Explorer finds one; the template gallery is
being built.

How a person starts a [text document](text-document.md) and finds it again.

## Starting one

- **New Document** (the Explorer's menu, fourth, and the `/new` wizard's Text document card) offers **Text document**
  beside the other kinds, with its glyph; it makes a blank text document in the current folder and opens it, the caret
  at the start ([New Document menu](../013-workspace/new-document-menu.md#the-blanks)).
- **`/new?kind=text-document`** does the same; `/new?template=<id>` with a text document template makes one from it.
- **File > New > Document** (in a text document) opens a blank one in a new browser tab; **From a template** opens the
  gallery filtered to text documents.
- **Adding a tab** to any document offers Text document.
- A blank text document is born in ODF 1.4 (fork C5), with the person's default styles and page setup.

## The template gallery's text documents

Google's gallery sections, each template written as a text document with a preview. The Project Brief template of
Pages mode moves here (fork D4), into Work. In this order, each with its id:

| Section   | Templates                                                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Letters   | Letter (`text-letter`), Formal letter (`text-formal-letter`)                                                                                                                       |
| Resumes   | Classic resume (`text-classic-resume`), Modern resume (`text-modern-resume`)                                                                                                       |
| Personal  | Essay (`text-essay`), Report (`text-report`), Notes (`text-notes`)                                                                                                                 |
| Work      | Project proposal (`text-project-proposal`), Project brief (`text-project-brief`), Brochure (`text-brochure`), Meeting notes (`text-meeting-notes`), Newsletter (`text-newsletter`) |
| Education | Lesson plan (`text-lesson-plan`), Class report (`text-class-report`)                                                                                                               |

- **A template is a finished example.** Each is written in its own look (its fonts, colours, headings and spacing, as
  Google's are) with sample writing a person replaces, so the page shows what the document is for. Its styles are its
  own, not the person's defaults: the look is the point of choosing it.
- **Ids** start `text-`, so none can be read as a canvas template's kind.
- **The paper** is US Letter with one-inch margins, as Google's templates are (default); a template may set its own
  margins. The Project brief keeps the writing of Pages's Project Brief.
- **What it makes**: a document of one text document tab holding the template's writing, born in ODF (fork C5), named
  after the template ("Project proposal"), as Google names one, and placed where a blank text document goes.
- **The preview** is the template's first page, drawn by the [page previews](agents-and-sync.md#page-previews) engine
  without its "Approximate preview" label: on white paper in the light scheme, and on dark paper in the dark scheme
  with its inks drawn as the editor draws them there
  ([The page in the dark scheme](editing-surface.md#the-page-in-the-dark-scheme)). It is drawn in the browser when the
  gallery first shows, so it always matches the template.

### Where the gallery shows

- **The Explorer's New Document menu**: Text document's pane lists the sections, each template a card showing the top
  of its first page and its name ([New Document menu](../013-workspace/new-document-menu.md#the-blanks)); the row
  itself still makes a blank. A card makes its template through `/new?template=<id>` with the Explorer's place: the
  writing is stored before the editor opens it, so a template opens once made rather than at once (default).
- **`/new?gallery=text-document`** is the gallery as a page: a Blank document card, then the sections, each card the
  whole first page and its name. Choosing one makes it as the wizard makes any document.
- **`/new?template=<id>`** with a text document template's id makes one from it, as `?kind=text-document` makes a
  blank.
- **File > New** in a text document: **Document** opens `/new?kind=text-document` and **From template gallery** opens
  `/new?gallery=text-document`, each in a new browser tab, as Google's do.

## Finding it

- The Explorer's **Kind** chip has **Text document**; its default folder key is `kind:text-document`
  ([Default folders](../013-workspace/default-folders.md)).
- Content search finds text in its body, headers, footers and footnotes; never in its comments, which a Viewer must
  not find it by ([What a Viewer receives](review.md#what-a-viewer-receives)) (following box 6's ruling, 2026-11-27).
- Its row shows the first page as a thumbnail and its format in the Details view.

## Telemetry

`Document · Created · TextDocument` with the path as the type's suffix (Blank, Template, Import, Agent, Tab): a
template's is `TextDocumentTemplate`, beside `Template · Used · <Id>` as every template's.
