# Links and navigation

**Status: specified.** Nothing is built.

Links, bookmarks, heading links, the table of contents, the outline and document tabs' navigation in a
[text document](text-document.md). Smart chips are left out (fork C3, ruled): a chip in an arriving file is kept as
its shown text, with its data kept ([Standard mapping](standard-mapping.md#kept-content)).

## Links

- ⌘K (Insert > Link, the toolbar) opens the link editor under the selection: the text, and the address field, which
  also searches the person's LiveDoc documents and this document's headings and bookmarks as they type.
- Addresses kept: `http`, `https`, `mailto`, LiveDoc document addresses, and in-document targets (a heading, a
  bookmark); a bare domain becomes `https://`. Others are refused: "Use a web, email or LiveDoc address".
- **Automatically detect links** (Preferences) turns a typed address into a link.
- **Link details**: the caret on a link shows a card with its title (a LiveDoc document's name; a web page's address)
  and **Copy link**, **Edit link**, **Remove link**; Alt+Enter (⌥Enter) opens it.
- A LiveDoc document link opens in a new browser tab; a heading or bookmark link scrolls to its target.

## Bookmarks

Insert > Bookmark at the caret: a marker in the margin when shown; its card offers **Link**, **Copy link** (the
document's address with `#bookmark=<id>`), **Remove**. Navigating with ⌘⌥ N then B / P then B.

## Heading links

Every heading has an address (`#heading=<id>`): the context menu's **Copy heading link**; the outline's entries are
heading links too.

## Table of contents

Insert > Table of contents: **Plain text**, **Dotted** (page numbers with leaders), **With blue links**. It lists the
headings (Heading 1 to 6 by default), each a link; **Update** (the refresh button on it) rebuilds it; its options
(right panel): links or page numbers, which heading levels.

## The outline

- View > Show outline (or the outline button at the top left): a left panel listing the document tabs, and under the
  current tab, its headings, indented by level; a press scrolls there.
- The panel shows **Summary** (a free text the editor writes, as Google's) above the headings.
- Document tabs: **+** adds one, each has a menu (Rename, Add subtab, Duplicate, Delete, Copy link, Choose emoji) and
  can be dragged to reorder or nest (depth 3). Ctrl⇧Page Down / Up move between tabs.
- Hidden by a press on its close; personal and remembered.

## Keyboard navigation

Google's chords under ⌘⌥ (Ctrl+Alt on PC) N or P then: H (heading), 1 to 6 (heading of that level), G (graphic),
O (list), I (list item), L (link), B (bookmark), W (formatting change), C (comment), U (suggestion), F (footnote), R
(edit, in version history); and table navigation under ⌘⌥⇧T then S, D, I, K, B, V, J, L, M, G, E. Every one is a row of
the keyboard layer ([Editing surface](editing-surface.md#keyboard-shortcuts)).

## Share roles

Editors add and change links, bookmarks, the table of contents and document tabs; a Participant only as suggestions
(D7); everyone may follow links and use the outline.

## Telemetry

`Element · Added · TextDocumentLink`, `TextDocumentBookmark`, `TextDocumentTableOfContents`;
`Tab · Added · TextDocumentTab`; `UI · Toggled · TextDocumentOutline`. Never content.
