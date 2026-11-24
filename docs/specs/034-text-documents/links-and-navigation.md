# Links and navigation

**Status: partly built.** The outline's headings, the link editor and the link card are built; the rest is specified.

Links, bookmarks, heading links, the table of contents, the outline and document tabs' navigation in a
[text document](text-document.md). Smart chips are left out (fork C3, ruled): a chip in an arriving file is kept as
its shown text, with its data kept ([Standard mapping](standard-mapping.md#kept-content)).

## Links

- ⌘K, Insert > Link, the toolbar's **Insert link** and the context menu open the **link editor** under the selection,
  in whichever writing has the caret (the body, a header, a footer, a footnote).
- The editor holds **Text** (the selection's text; the whole link's when the caret is in one; empty at a bare caret),
  **Link** (placeholder "Search or paste a link", the link's address when there is one) and **Apply**.
  Enter in either field applies, Escape closes; the writing has the focus back either way.
- As Link is typed in, a list under it offers the person's LiveDoc documents whose names hold every typed word, at
  most 8, newest first `(default)`, and this document's headings and bookmarks; Up and Down move, Enter takes one.
  A document taken fills Link with its address and an empty Text with its name.
- Applying is one undo step. In a link, its text and address change; over a selection, the selection becomes Text
  (when changed) and links to the address; at a bare caret, Text (the address when empty) is put in, linked.
  An empty Link removes the link.
- Addresses kept: `http`, `https`, `mailto`, LiveDoc document addresses, and in-document targets (a heading, a
  bookmark); a bare domain becomes `https://`, a bare email address `mailto:` `(default)`. Others are refused under
  the field: "Use a web, email or LiveDoc address"; past 2,048 characters `(default)`: "Use a shorter address".
- A LiveDoc document address is the document's own address in full (on docs.nu `https://docs.nu/document/<id>`), so it
  opens from Word or LibreOffice too.
- **Automatically detect links** (Preferences) turns a typed address into a link.
- **Link details** (while Preferences > **Show link details** is on, as it is by default): the caret, with nothing
  selected, in a link shows a card under it: its title (a LiveDoc document's name when it is one of the person's;
  else its address), a press on which opens it, then **Copy link**, **Edit link** and **Remove link**.
  Escape or the caret leaving the link hides it; it never takes the focus from the writing.
- **Remove link** takes the address off the link's whole stretch; its text stays. **Copy link** copies the address.
- Alt+Enter (⌥Enter) opens the link at the caret, whether the card shows or not.
- Opening: a web, email or LiveDoc address opens in a new browser tab with no opener and no referrer; a heading or
  bookmark link scrolls to its target. An address of any other scheme, from a file, never opens.
- The context menu on a link `(default)`: **Edit link** in place of Insert link, then **Copy link** and **Remove link**.

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

- View > Show outline (⌘⌥A then H, holding the modifiers) or the outline button at the top left opens the outline,
  the shell's [left panel](../004-interface-design/office-shell.md#side-panels), titled **Outline**: the document tabs,
  and under the current tab, its headings, indented by level. A press on a heading puts the caret at its start and
  scrolls it into view.
- A **heading** is a paragraph with an outline level from 1 to 6, its own or its paragraph style's (through the
  style's parents); it shows its text, or **Untitled heading** while it has none `(default)`. The list follows the
  writing as it changes, everyone's edits included.
- With no heading it reads: **Headings you add to the document will appear here.**
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
(D7); everyone may follow links and use the outline. The link card of a session that may not edit offers only
Copy link.

## Telemetry

`Element · Added · TextDocumentLink`, `TextDocumentBookmark`, `TextDocumentTableOfContents`;
`Element · Changed · TextDocumentLink` (an edited link), `Element · Removed · TextDocumentLink` (Remove link);
`UI · Used · TextDocumentLinkOpened` (Alt+Enter or the card's title);
`Tab · Added · TextDocumentTab`; `UI · Opened · TextDocumentPanelOutline` (the shell's panel telemetry). Never
content.
