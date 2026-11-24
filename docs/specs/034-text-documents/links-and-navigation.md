# Links and navigation

**Status: partly built.** The outline's headings, links, bookmarks and heading links are built; the rest is specified.

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
  (when changed) and links to the address; at a bare caret, Text (Link as typed when empty) is put in, linked.
  An empty Link removes the link.
- Addresses kept: `http`, `https`, `mailto`, LiveDoc document addresses, and in-document targets (a heading, a
  bookmark); a bare domain becomes `https://`, a bare email address `mailto:` `(default)`. Others are refused under
  the field: "Use a web, email or LiveDoc address"; past 2,048 characters `(default)`: "Use a shorter address".
- A LiveDoc document address is the document's own address in full (on docs.nu `https://docs.nu/document/<id>`), so it
  opens from Word or LibreOffice too.
- **Automatically detect links** (Preferences) turns a typed address into a link.
- A new link (applied, detected or typed as Markdown) takes the link look as its own formatting, so every program
  draws it alike: colour `#1155cc`, underlined `(default)`. What is typed after it takes neither; an edited link keeps
  its own formatting; Remove link takes the look off where the text still has it exactly.
- **Link details** (while Preferences > **Show link details** is on, as it is by default): the caret, with nothing
  selected, in a link shows a card under it: its title (a LiveDoc document's name when it is one of the person's;
  else its address), a press on which opens it, then **Copy link**, **Edit link** and **Remove link**.
  Escape hides it until the caret moves; it never takes the focus from the writing.
- **Remove link** takes the address off the link's whole stretch; its text stays. **Copy link** copies the address.
- Alt+Enter (⌥Enter) opens the link at the caret, whether the card shows or not.
- Opening: a web, email or LiveDoc address opens in a new browser tab with no opener and no referrer; a heading or
  bookmark link scrolls to its target. An address of any other scheme, from a file, never opens.
- The context menu on a link `(default)`: **Edit link** in place of Insert link, then **Copy link** and **Remove link**.

## Bookmarks

- A **bookmark** is a named place in the writing, a point between two characters. Insert > Bookmark puts one at the
  caret, at the start of a selection `(default)`, in the body only.
- Its name is made once: 12 lowercase letters and digits, the first a letter, a name both formats accept. A file's
  bookmarks keep the names they arrive with.
- It takes no room in the text; a small blue ribbon in the left margin beside its line shows it, never printed.
  The caret beside it, with nothing selected, shows its card: **Bookmark**, **Copy link** and **Remove**
  (Remove for whoever may edit) `(default)`.
- **Copy link** copies the document's address with `#bookmark=<name>`; opening that address scrolls the bookmark
  into view once the document is drawn, the caret at it.
- The link editor's list offers this document's bookmarks under the documents, each named by the text after it (its
  first 40 characters, "Bookmark" when none), those holding every typed word, at most 8. A link to one is `#<name>`;
  opening it scrolls the bookmark into view, the caret at it. A link to a bookmark that is gone opens nothing.
- Remove on its card takes it away; so does deleting the text around it, as one character would.
- A hidden bookmark (its name starting with `_`, as Word and Google hide theirs, headings' among them) is a bookmark
  of the writing with no ribbon, no card and no place in the link editor's Bookmarks; a bookmark that spans text (a
  start and an end apart) is kept as the file has it, never drawn `(default)`.
- Navigating with ⌘⌥ N then B / P then B.

## Heading links

- A heading's **id** is the first hidden bookmark at its start, before its text, as Google writes one per heading
  (ODF `_heading=h.<id>`, OOXML `_<id>`). A heading without one gains one when a link first needs it: `_` and 12
  lowercase letters and digits, as Google names them in Word files, never one the writing holds `(default)`.
  Gaining one is no step of its own to undo.
- The context menu on a heading (the caret in it, nothing selected) offers **Copy heading link** `(default)`: it
  copies the document's address with `#heading=<id>`; a session that may not edit offers it only for a heading that
  has an id. Opening that address scrolls the heading into view once the document is drawn, the caret at its start.
- The link editor's list offers this document's headings under **Headings**, after the documents and before the
  bookmarks `(default)`, each by its text (its first 40 characters, **Untitled heading** when empty), those holding
  every typed word, at most 8, in the order they are written. Taking one links to `#<id>`, the heading gaining its id
  as the link is applied.
- A link to a heading reads and opens as a bookmark link does: the card's title is the heading's text, and opening it
  scrolls the heading into view. A link to `#heading=h.<id>`, as Google writes one in an ODF file, leads to the
  bookmark `_heading=h.<id>` `(default)`.
- The outline's entries go to their headings ([The outline](#the-outline)).
- Spanning heading bookmarks (Word's `_Toc` ones around a heading's text) stay kept; a link to one opens nothing.

## Table of contents

- A **table of contents** is one block of the body: its **look**, the heading **levels** it lists (1 up to a level
  from 1 to 6, 6 by default) and its **entries**, one paragraph per heading, in the order written.
- Looks: **Plain text** (each entry its heading's text, its page number at the right margin), **Dotted** (the same,
  dots leading to the page number) and **With blue links** (no page numbers, each entry in the link look).
  Every entry links to its heading (`#<id>`, the heading gaining its id as in [Heading links](#heading-links)).
- Entry paragraphs take the paragraph styles **Contents 1** to **Contents 6** (ODF `Contents_20_N`, OOXML `TOCN`),
  each indented 0.5 cm a level `(default)`, made when a table of contents first needs them, a file's own kept.
- It is read only: the caret steps over it, a press selects it whole; Backspace after it or Delete before it takes it
  whole.
  Copied and pasted, it stays one.
- Selected, a press on one of its entries goes to that entry's heading, the caret at the heading's start, scrolled
  into view `(default)`; where the writing is read only, one press goes there `(default)`.
- Insert > Table of contents offers the three looks, each a small picture of it with its name; one goes in at the
  caret, in the body, splitting the caret's paragraph, built from the headings as Update builds it, as one undo
  step, and is selected.
  The submenu is dimmed while the caret is in a table, a header or footer, or a note `(default)`.
- Selected, it shows above its top-left corner **Update table of contents** (a refresh button) and **Table of contents
  options** `(default)`. Update rebuilds the entries from the headings and the pages as drawn, as one undo step; it
  never updates by itself. A heading with no text is left out `(default)`.
- Its headings are [the outline's](#the-outline) whose level is within its levels, a table's left out `(default)`;
  each gains an id as Copy heading link gives one, in the same undo step.
- An entry is its heading's text, then for Plain text and Dotted a tab and the number of the page the heading
  starts on as the page shows it; With blue links, its text alone, in the link look.
- Options open the right side panel **Table of contents**: the three looks as a choice, and **Levels** (1 to N, a
  choice from 1 to 6); a change rebuilds it at once, as one undo step.
- Pageless, no page has a number: Update writes Plain text and Dotted entries with no tab or page number, and the
  file holds none until it is updated with pages `(default)`.
- On a screen that draws no pages (a phone), an entry keeps the page number its heading had, a new one has none
  `(default)`.
- A file's table of contents is read as one: ODF `text:table-of-content`, OOXML a `TOC` field in a `w:sdt` of the
  `Table of Contents` gallery ([Standard mapping](standard-mapping.md#tables-of-contents)). Its look reads as With
  blue links without page numbers, Dotted when a dot leads to them, Plain text otherwise; its entries as written.
- Editors insert, update and change one; everyone may follow its links.

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
`Element · Changed · TextDocumentTableOfContents` (Update, or a look or levels chosen in its panel);
`UI · Used · TextDocumentTableOfContentsFollowed` (a press on an entry);
`Element · Removed · TextDocumentBookmark` (Remove on its card);
`Element · Changed · TextDocumentLink` (an edited link), `Element · Removed · TextDocumentLink` (Remove link);
`UI · Used · TextDocumentLinkOpened` (Alt+Enter or the card's title);
`UI · Used · TextDocumentHeadingLinkCopied` (Copy heading link);
`Tab · Added · TextDocumentTab`; `UI · Opened · TextDocumentPanelOutline` (the shell's panel telemetry). Never
content.
