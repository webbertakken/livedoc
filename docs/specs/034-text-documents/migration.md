# Migration from Pages mode

**Status: specified.** Nothing is built.

Pages mode is removed whole (fork C2, ruled): the mode and its five page kinds, article, slide, infographic, logo and
wireframe, with everything only they use. This spec says what becomes of the content stored in them, and what a person
sees. Production held, on 2026-11-18, 113 documents not in the Trash, 2 of them made in Pages, and no article added
through the editor since telemetry began (`Tab · Changed · ArticleAdded` 0); agents wrote articles 7 times
(`Cli · Used · ArticleSet`) (verified: read-only D1 queries, plan 0019's blueprint).

## Articles (fork D4)

`(default)`: each article is **migrated once** into a new text document, with no compatibility layer:

- One text document per article, in the article's document's folder, named after the article's title (else the
  document's name and "Article"), born in ODF 1.4.
- Blocks map: paragraph styles body, title, subtitle, h1 to h3 and quote to Normal text, Title, Subtitle, Heading 1
  to 3 and a Quote paragraph style; lists to lists (to-do to checklist); code to a monospaced paragraph style; divider
  to a horizontal line; page break to a page break; runs' marks to formatting, links kept; margin notes' comment
  threads and actions to comments on the same text.
- **Zones**: an object zone's element is drawn to a picture (SVG with a PNG fallback) placed in line or wrapped as the
  zone was; a drawing zone becomes a drawing ([Objects](objects.md#drawings)) holding its elements, so it opens again.
- The article's style maps to the document's styles: body and heading fonts, text size, line and paragraph spacing,
  accent colour on headings when on, margins, page numbers.
- **In the source document**, the article's pages are removed and a link to the new text document is placed where the
  article's first page was (a Link card element with its name), so nobody loses their way.
- **Verified one by one**: the migration compares each article's plain text and block count with its text document's,
  and stops at the first difference, changing nothing for that article.
- **A way back**: the source tab's state before the migration is kept as a snapshot for 90 days, restorable by an
  operator.

## Slides, infographics, logos and wireframes (fork D8)

`(default)`: **no stored content is deleted**: each page's elements stay on the tab's canvas where they are, as leaving
Pages already does ([Editor modes](../007-editor/editor-modes.md) "Leaving Pages"); the pages' sheets, backgrounds and
labels go, and the tab opens in Structured. Asked of Webber with the evidence before the removal runs.

## What a person sees

- A document that held an article opens with a one-time notice: "Your article '<title>' is now a text document" and
  **Open it**.
- A document that held other pages opens with: "Pages mode has been retired. Your pages' content is still here on
  the canvas."
- Help articles on Pages mode redirect to the text document's help ([Help app](../018-help/help-app.md)).

## Running it

A one-shot operator script through the api: **dry run** (counts per document: articles, blocks, zones, pages of each
kind), then **run** on preview, then on production only with Webber's yes, recording the counts. Each document is
migrated in its room, in one transaction; a failure leaves that document untouched and is reported.

## Observability

`[migrate-pages] dry-run` (counts), `[migrate-pages] article-migrated` (document, article, new document, blocks),
`[migrate-pages] article-refused` (the difference found), `[migrate-pages] pages-retired` (document, pages by kind).
