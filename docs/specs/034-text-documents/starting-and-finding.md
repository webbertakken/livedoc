# Starting and finding

**Status: being built.** New Document offers a text document; the rest is specified.

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

Google's gallery sections, each template written as a text document with a preview: **Letters** (letter, formal
letter), **Resumes** (two), **Personal** (essay, report, notes), **Work** (project proposal, brochure, meeting notes,
newsletter), **Education** (lesson plan, report). Each preview is drawn from the template's first page, in light and
dark ([Templates](../007-editor/templates-by-mode.md)). The Project Brief template of Pages mode moves here (fork D4).

## Finding it

- The Explorer's **Kind** chip has **Text document**; its default folder key is `kind:text-document`
  ([Default folders](../013-workspace/default-folders.md)): a text document records it as its creation intent when it
  is made, however it is made. One made before reads as unknown and matches no Kind value.
- Content search finds text in its body, headers, footers and footnotes; never in its comments, which a Viewer must
  not find it by ([What a Viewer receives](review.md#what-a-viewer-receives)) (following box 6's ruling, 2026-11-27).
- Its row shows the first page as a thumbnail and its format in the Details view.

## Telemetry

`Document · Created · TextDocument` with the path as the type's suffix (Blank, Template, Import, Agent, Tab).
