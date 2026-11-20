# Editing surface

**Status: partly built.** The menu bar (every menu and item, those not yet built dimmed), the tool finder, the
title row (but its comment history), the toolbar's built controls and the keyboard shortcuts dialog are built; the
rest is specified.

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
  In a workbench frame it goes where the editor's back does ([Toolbar layout](../007-editor/toolbar-layout.md)).
- **Name**: the document's name in a field that looks like text until hovered (outlined) or focused (editable);
  Enter or blur renames, Escape puts it back. Empty is refused ("Give the document a name") and the name put back.
  Its accessible name is **Rename**. For a session that may not rename the document (a Viewer, a Participant, a
  visitor scoped to one tab) it is text. File > Rename puts the focus in it with the name selected.
- The format sits after the name in a small grey pill, `.DOCX` or `.ODT`, with the tooltip "Microsoft Word format"
  or "OpenDocument format"; once conversion is built a pill press opens File > Convert.
- **Star** ("Star", "Starred", `aria-pressed`): LiveDoc's favourites, for everyone the document opens for.
- **Move** (a folder glyph, "Move"): the shared folder picker over My Documents and the person's teams, for whoever
  files the document (its owner or a member of its team); File > Move opens it too.
- **Save status**: one glyph and its words, for whoever may edit the writing (a Viewer saves nothing, so sees none):

  | Status       | When                                             | Glyph       | Words                                       |
  | ------------ | ------------------------------------------------ | ----------- | ------------------------------------------- |
  | Saving       | an edit made here is not yet confirmed           | cloud-sync  | "Saving…"                                   |
  | Saved        | the room holds every edit made here              | cloud-check | "All changes saved"                         |
  | This Browser | in This Browser, every edit written there        | app-window  | "Saved in This Browser"                     |
  | Offline      | the room is not open                             | cloud-off   | "Offline: changes are kept in this browser" |
  | Failed       | an edit refused, or one this browser cannot keep | cloud-alert | "Can't save: we keep trying"                |

  Failed wins over every other status; a text document in This Browser is Saving while a write is due. The words show
  beside the glyph while the status is Saving, Offline or Failed (Failed in the error colour), and are the glyph's
  tooltip and accessible name always `(default)`. Offline and Failed are announced politely as they begin.
  A press opens the details: the words again and one sentence of what it means (the copy is in the code).
  A text document in This Browser retries a failed write every `TEXT_DOCUMENT_SAVE_RETRY_MS` (5 s) `(default)`;
  one in a room is retried by its catch-up when the room opens again.

- **Last edit**: none in the title row (Google moved it into File > Version history); once version history is built,
  the save status's details show "Last edit was <time> by <name>", which opens it.
- **Comment history** (a speech bubble glyph, "Open comment history", ⌘⌥⇧A): the comments panel. Not drawn until
  comments are built ([Review](review.md)), never a dead button.
- **Editing mode switch**: a pill with the mode's glyph and name, "Editing" (pencil), "Suggesting" (pencil with a
  plus), "Viewing" (eye); its menu lists the three with their one-line descriptions ([Review](review.md#editing-modes)).
  It sits after Settings, before Share. Descriptions: "Edit document directly", "Edits become suggestions",
  "Read or print final document". View > Mode and ⌘⌥⇧Z, ⌘⌥⇧X, ⌘⌥⇧C change it too.
- **Share**: a filled pill, "Share", with a lock glyph when the document is private; opens LiveDoc's share dialog.
  It is for whoever may share the document (its owner or a member of its team); anyone else sees **Make a copy** in
  its place, an outlined pill that copies the document into their own files and opens the copy. File > Share > Share
  with others opens the same dialog; File > Make a copy is its own dialog ([Files and print](files-and-print.md)).
- **Presence**: everyone else in the document, up to four avatars, then "+n"; each avatar's name is its tooltip and
  accessible name. A press on one in this text document brings their caret into view (the page scrolls, nobody's
  selection moves); a press on one elsewhere in the document opens the tab they are on.
- **Settings** (a gear glyph, "Settings"): LiveDoc's own settings (appearance, preferences), for every role
  `(default)`. Google's Tools > Preferences is the document's, a different dialog.
- **Account**: LiveDoc's account control at the far right, as Google's account picture: "Sign in" for a guest where
  sign-in is offered, the account picture with its menu once signed in, nothing on a host without sign-in.
- Over a text document the editor's bottom line keeps the tabs and Add tab but not the people: presence is here
  ([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md#the-tab-strip)).

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

Per person, per document, remembered in this browser (`livedoc:v2:text-document-zoom`, the most recent
`SURFACE_VIEW_MAX_ENTRIES` documents) `(default)`. The toolbar's zoom is a field with a list: Fit, 50%, 75%, 90%,
100%, 125%, 150%, 200%; a typed whole number from 50 to 200 (with or without %) applies on Enter, anything else puts the
value back. Fit fits the page width to the window, never above 200%. The pages scale; the chrome never does. ⌘+, ⌘− and ⌘0 are the
browser's own (Google leaves them to the browser); pinch zoom on touch screens zooms the pages.

## Compact and full screen

- **Hide the menus** (Ctrl⇧F, the chevron): the title row and menu bar fold away, the toolbar stays.
- **Full screen** (View): menus, toolbar and ruler fold away until Escape.
- Both are personal and remembered per browser.

## Context menus

The shell's [context menu](../004-interface-design/office-shell.md#context-menus) on text, in Google's order: Cut,
Copy, Paste, Paste without formatting, Delete; Comment, Suggest edits; Insert link; Format options, Clear formatting;
Select all matching text. Each is the menu bar's item of the same name (Insert link is Insert > Link, Suggest edits
the Suggesting mode); Format options opens its side panel and Select all matching text selects every stretch with the
selection's formatting, each built in its area's phase. Delete removes the selection and is dimmed while nothing is
selected, in Edit > Delete too. On a table, a picture, a link: their area's menu
([Tables](tables.md#context-menu), [Objects](objects.md#pictures), [Links and navigation](links-and-navigation.md#links)).
A Viewer's holds Copy; a Participant's adds Comment and Suggest edits.

## Tool finder

⌥/ (Alt+/ elsewhere) opens a field over the menu bar: typing lists every menu item (and setting) whose name or keyword
matches, with its menu path; Up and Down move, Enter runs it, Escape closes. Dimmed items list with "Coming soon".

## Keyboard shortcuts

- ⌘/ or Help > Keyboard shortcuts opens the shell's
  [Keyboard shortcuts dialog](../004-interface-design/office-shell.md#keyboard-shortcuts-dialog): a search field and
  every shortcut by group, as Google's.
- Every shortcut of Google's list, for each platform, is a row of [Keyboard shortcuts](keyboard-shortcuts.md), read by the
  menus, the tooltips and the dialog. The browser's own shortcuts are never taken where Google does not take them.

## Phone and tablet

The shell's [phone and tablet layouts](../004-interface-design/office-shell.md#phone-and-tablet). On a phone the pages
flow to the window's width, as pageless, so a line never runs off the screen `(default)`.

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
`UI · Toggled · TextDocumentCompact`, `UI · Toggled · TextDocumentRuler`, `UI · Toggled · TextDocumentStar`,
`UI · Opened · TextDocumentMove`, `UI · Used · TextDocumentFollow` (a press on a person),
`UI · Opened · TextDocumentShortcuts`, `UI · Opened · TextDocumentContextMenu`. Never text.
