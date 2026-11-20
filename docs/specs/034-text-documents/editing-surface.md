# Editing surface

**Status: partly built.** The menu bar (every menu and item, those not yet built dimmed) and the tool finder are
built; the rest is specified.

What a person sees and works with on a [text document](text-document.md): Google Docs' layout, control for control,
built on the shared [Office shell](../004-interface-design/office-shell.md). How literal the look is (Google's metrics
and colours, or LiveDoc's tokens on Google's layout) is fork D2, open; this spec fixes the layout, order, copy and
behaviour, which hold either way. Each control's row is in the [parity matrix](parity-matrix.md).

## Layout, top to bottom

1. **Title row** (64 px): the LiveDoc mark (home, the Explorer), the name and its format, star, move, save status;
   on the right, comment history, the editing mode switch, Share, presence.
2. **Menu bar** (under the name, in the title row's second line as Google has it): File, Edit, View, Insert, Format,
   Tools, Extensions, Help.
3. **Toolbar** (40 px), a rounded bar across the window.
4. **Ruler** (when shown), across the page's width, aligned to it.
5. **The canvas of pages**: the pages centred on a grey ground, scrolling vertically; the outline panel at its left
   edge, side panels at its right.
6. **No status bar**, as Google has none; the word count shows in a floating box at the bottom left when chosen.

The document's canvas chrome (palette, mode switch, minimap, zoom controls) is never mounted
([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md)).

## The title row

- **The LiveDoc mark** goes to the Explorer, as Google's Docs icon goes to the Docs home. Its tooltip: **Explorer**.
- **Name**: the document's name in a field that looks like text until hovered (outlined) or focused (editable);
  Enter or blur renames, Escape puts it back. Empty is refused ("Give the document a name"). The format sits after it
  in a small grey pill, `.DOCX` or `.ODT`, with the tooltip "Word format" or "OpenDocument format"; a pill press
  opens File > Convert.
- **Star** ("Star", "Starred"): LiveDoc's favourites. **Move** (a folder glyph, "Move"): the folder picker.
- **Save status** (a cloud glyph): "Saving…", "All changes saved", "Saved in This Browser", "Offline: changes are kept
  in this browser" and, on failure, "Can't save: we keep trying" in the error colour. A press opens the details.
- **Last edit**: none in the title row (Google moved it into File > Version history); a press on the save status
  shows "Last edit was <time> by <name>", which opens version history.
- **Comment history** (a speech bubble glyph, "Open comment history", ⌘⌥⇧A): the comments panel.
- **Editing mode switch**: a pill with the mode's glyph and name, "Editing" (pencil), "Suggesting" (pencil with a
  plus), "Viewing" (eye); its menu lists the three with their one-line descriptions ([Review](review.md#editing-modes)).
- **Share**: a filled pill, "Share", with a lock glyph when the document is private; opens LiveDoc's share dialog.
- **Presence**: up to four avatars, then "+n"; a press on one follows that person's caret into view.

## The menu bar

- Each menu opens on press, on hover once another is open, and from the keyboard (Alt+F, Alt+E, Alt+V, Alt+I, Alt+O,
  Alt+T, Alt+H in Chrome, Alt+Shift+letter in other browsers, Ctrl+Option+letter on a Mac).
- Items follow the [inventory](../../research/docs-open-standard/google-docs-inventory.md#menus) in Google's order,
  less the rows the matrix leaves out (they are not shown, never dimmed), plus LiveDoc's own (File > Convert, File >
  Download > OpenDocument flat file).
- **Not yet built** items show dimmed, with "Coming soon" where the shortcut would be, until their phase lands;
  none remain once the matrix is done.
- **Extensions** holds **Agents**: how to reach this document from the MCP server and the CLI, with the document's id
  to copy ([Agents and sync](agents-and-sync.md)).
- **Help** holds: Search the menus (the tool finder), Help (the help centre's text document articles), Training (the help centre's guides), Updates
  (LiveDoc's changelog), Help improve LiveDoc (Report a Bug), Privacy policy, Terms of service, Keyboard shortcuts.
- Each item names its shortcut on the right, in the platform's notation (⌘ on a Mac, Ctrl elsewhere).
- A Viewer's menus hold only what a Viewer may do: File (Make a copy, Download, Print, Details), Edit (Copy, Select
  all, Find), View, Tools (Word count, Dictionary), Help. A Participant's add Insert > Comment and, under D7, the
  Suggesting mode.

## The toolbar

Left to right, as Google has it, with a divider between groups:

| Group     | Controls                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Find      | Tool finder (a magnifier, "Search the menus (⌥/)")                                                                                                               |
| History   | Undo, Redo, Print, Spelling and grammar check, Paint format                                                                                                      |
| Zoom      | Zoom menu: Fit, 50%, 75%, 90%, 100%, 125%, 150%, 200%; typed values from 50 to 200                                                                               |
| Style     | Styles menu (Normal text, Title, Subtitle, Heading 1 to 6, Options)                                                                                              |
| Font      | Font menu (the catalogue, More fonts, recent), the size field with − and + (1 to 400 pt)                                                                         |
| Text      | Bold, Italic, Underline, Text colour, Highlight colour                                                                                                           |
| Insert    | Insert link, Add comment, Insert image (menu)                                                                                                                    |
| Paragraph | Align (menu), Line and paragraph spacing (menu), Checklist, Bulleted list, Numbered list (each a toggle with a menu of styles), Decrease indent, Increase indent |
| Clear     | Clear formatting                                                                                                                                                 |
| Right     | The editing mode switch (when the title row is hidden in compact mode), Hide the menus (chevron)                                                                 |

- **Every control** has a tooltip naming it and its shortcut, shows its pressed state (`aria-pressed`) and its mixed
  state over a mixed selection (bold over partly bold text shows unpressed, as Google does).
- **Overflow**: controls that do not fit move, from the right, into a ⋮ menu that opens a second row of them; the
  order never changes.
- **The style, font and size** show the value at the caret, blank over a mixed selection.
- A Viewer sees no toolbar but Zoom and the mode switch; a Participant adds Add comment.

## The ruler

- Across the page at the page's scale, in centimetres or inches (by the browser's locale, per person in Preferences).
- Shows the margins (the grey ends), the left indent, first-line indent and right indent markers, and tab stops.
- Dragging a margin changes the section's margins; an indent marker, the selected paragraphs' indents; a press on the
  ruler adds a left tab stop, dragging one off removes it; right-press offers left, centre, right and decimal tabs.
- While dragging, a vertical guide runs down the page and a tooltip shows the value.
- Each marker is a keyboard stop (arrow keys move it by an eighth of the unit, Shift by a whole unit).

## Zoom

Per person, per document, remembered in this browser. Fit fits the page width to the window. ⌘+, ⌘− and ⌘0 are the
browser's own (Google leaves them to the browser); pinch zoom on touch screens zooms the pages.

## Compact and full screen

- **Hide the menus** (Ctrl⇧F, the chevron): the title row and menu bar fold away, the toolbar stays.
- **Full screen** (View): menus, toolbar and ruler fold away until Escape.
- Both are personal and remembered per browser.

## Context menus

On text, as the inventory lists: Cut, Copy, Paste, Paste without formatting, Delete; Comment, Suggest edits; Insert
link; Format options; Clear formatting; Select all matching text. On a table, a picture, a link: their area's menu
([Tables](tables.md#context-menu), [Objects](objects.md#pictures), [Links and navigation](links-and-navigation.md#links)).
Shift with the right button shows the browser's own menu. ⌘⇧\ and Shift+F10 open it at the caret.

## Tool finder

⌥/ (Alt+/ elsewhere) opens a field over the menu bar: typing lists every menu item (and setting) whose name or keyword
matches, with its menu path; Up and Down move, Enter runs it, Escape closes. Dimmed items list with "Coming soon".

## Keyboard shortcuts

- ⌘/ opens the Keyboard shortcuts dialog: a search field and every shortcut by group, as Google's.
- Every shortcut of Google's list, for each platform, is a row of [Keyboard shortcuts](keyboard-shortcuts.md), read by the
  menus, the tooltips and the dialog. The browser's own shortcuts are never taken where Google does not take them.

## Phone and tablet

- **Phone** (under 600 px): the title row holds back, the name, the mode switch (as a pencil or eye) and ⋮; the menus
  live in ⋮; the toolbar is a single scrolling row docked above the on-screen keyboard while editing; pages are fitted
  to the width, or pageless at the width when chosen.
- **Tablet** (600 to 1024 px): the desktop layout with the toolbar's overflow taking what does not fit.

## Share roles

What each role sees is stated with each control above; the server refuses every write a role may not make
([Live editing and storage](live-editing-and-storage.md#share-roles)).

## Accessibility

- Landmarks: the title row is a `banner`, the menu bar a `menubar` (Left, Right, Up, Down, Home, End, typeahead), the
  toolbar a `toolbar` (one tab stop, arrows within), the pages a `main` holding one `textbox` with `aria-multiline`,
  the side panels `complementary`.
- Every control reaches 44 px on touch and 24 px with a pointer, meets 3:1 for its outline and 4.5:1 for its text in
  both schemes, and shows a focus ring.
- Reduced motion: menus and panels appear without sliding.

## Telemetry

`UI · Opened · TextDocumentMenu<Name>` (a menu opened), `UI · Used · TextDocumentToolFinder`,
`UI · Toggled · TextDocumentCompact`, `UI · Toggled · TextDocumentRuler`. Never text.
