# Editing surface

**Status: partly built.** The menu bar (every menu and item, those not yet built dimmed), the tool finder, the
title row (but its comment history), the toolbar's built controls, the ruler and the keyboard shortcuts dialog are
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
4. **Ruler** (when shown), across the page's width, aligned to it ([The ruler](#the-ruler)).
5. **The canvas of pages**: the pages centred on a grey ground, scrolling vertically; the outline panel at its left
   edge, side panels at its right.
6. **No status bar**, as Google has none; the word count shows in a floating box at the bottom left when chosen.

The document's canvas chrome (palette, mode switch, minimap, zoom controls) is never mounted
([Kinds outside the canvas](../006-document/kinds-outside-the-canvas.md)).

## The page in the dark scheme

- In the app's dark scheme the pages are **dark paper** (Webber, ruling D2: "in dark mode the paper should be dark as
  well"): `#1e1f20` on the shell's `#020617` ground, the writing in `#e3e3e3`
  where it has no colour of its own; in the light scheme, white paper and black ink, as Google draws them.
- **Colours are drawn for the paper they are on**, never stored for it: the file keeps the colours as written, so a
  document reads alike in either scheme, in another suite and in print.
- On dark paper a dark text colour is drawn light and a pale fill (a highlight, a paragraph's background) is drawn
  dark: each keeps its hue and chroma, and its OKLCH lightness is mirrored about 0.635 (default), so black ink is drawn
  near white and a pale yellow highlight as a deep yellow. A light text colour and a dark fill are drawn as written.
- Text on dark paper meets 4.5:1 against what is behind it: a mirrored ink still short of it is lifted toward white.
- Borders, list markers, ticked checklist items and kept-content placeholders follow the same rules; pictures and
  drawings are drawn as they are. A paragraph's border in its own background colour is drawn as that fill.
- Printing, PDFs, previews and thumbnails are always light paper (default).

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
  A change of status is drawn after the frame it happens in, the status alone, so a keystroke's frame never waits on
  it ([Performance](performance.md)).

- **Last edit**: none in the title row (Google moved it into File > Version history); once version history is built,
  the save status's details show "Last edit was <time> by <name>", which opens it.
- **Comment history** (a speech bubble with lines, "Open comment history", ⌘⌥⇧A): opens and closes the comments
  panel ([Review](review.md#the-comments-panel)), pressed while it is open; it stands first, before Settings (default).
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
- **Settings** (a gear glyph, "Settings"), before Share: LiveDoc's own settings (appearance, preferences), for every
  role (Webber, 2026-11-21). Google's Tools > Preferences is the document's, a different dialog.
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
| Font      | Font menu (More fonts, recent, My fonts), the size field with − and + (1 to 400 pt)                                                                              |
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

- **Shown** under the toolbar while View > Show ruler is on: on by default, per person, remembered in this browser
  (`livedoc:v2:text-document-ruler`) (default). It runs across the page at the page's zoom, aligned to it as the page
  scrolls sideways; a phone has none, as Google's app has none (default).
- **Its scale**: inches where the browser's language is American English, else centimetres, as Indentation options
  counts (default). A mark every eighth of an inch (a quarter of a centimetre), a longer one at each half, and each
  whole unit numbered from the left margin, counting up both ways.
- **The margins** are the grey ends; the white between them is the text area. Dragging a margin's inner edge sets
  that margin of the section the caret is in ([Page layout](page-layout.md#page-setup)), the ruler spanning that
  section's page, the text area kept at least 1 in wide (default).
- **The indents** of the paragraph at the selection's start: the **left indent** (a triangle under the line), the
  **first line indent** (a bar above it) and the **right indent** (a triangle at the right). Dragging the left indent
  moves the first line with it, as ⌘] does; the first line indent moves alone; each sets every paragraph the
  selection touches, as Indentation options does, held within the text area and the left and right indents at least
  0.5 in apart (default).
- **In a section of columns** ([Page layout](page-layout.md#columns)): the white between the margins is cut by each
  gap between two columns, drawn grey as the margins are. The indents and tab stops are those of the column the caret
  is in, measured from that column's start and held within its width; its start is the ruler's zero, the numbers
  counting from it both ways, as Word's (default). The caret's column is the one its line is drawn in, so a paragraph
  laid across columns reads the column of the caret's line (default). Gaps are set in Column options, never dragged on
  the ruler (default). Pageless, the ruler has one column.
- **Tab stops** of the paragraph at the selection's start, each a mark by its alignment, as Google draws them: an
  angle opening right for left, a T for centre, an angle opening left for right, a T with a dot for decimal.
- **A press on the ruler** away from a marker opens a menu at that point: **Add left tab stop**, **Add centre tab
  stop** and **Add right tab stop**, as Google's; the stop goes at the pressed point on every paragraph the selection
  touches. A stop drags along the ruler; dragged more than 24 px above or below it (default), it is drawn faded and,
  let go, taken away. A decimal stop from a file is drawn and moves like the others.
- **Snapping**: a drag and a pressed point snap to the nearest mark (an eighth of an inch, a quarter of a centimetre);
  Alt (Option) held while dragging moves freely (default, as Word does).
- **While dragging**, a vertical guide runs down the page at the point and a tooltip shows the value: "Left margin:
  1 in", "Left indent: 0.5 in", "First line indent: 0.25 in", "Right indent: 0 in", "Tab stop: 2 in" (in cm with the
  unit "cm"). Escape puts the marker back.
- Every change is one undo step and returns focus to the writing.
- **Keyboard**: each marker is a slider and a keyboard stop of its own (`role="slider"`, named as its tooltip names it,
  its value in the unit as `aria-valuetext`): Left and Right move it by an eighth of the unit, with Shift by a whole
  unit; on a tab stop, Delete or Backspace takes it away. The ruler's strip is a keyboard stop too: Enter or Space opens
  the add menu at the first mark past the last stop (default).
- Share roles: an Editor drags, adds and takes away; a Participant and a Viewer see the ruler without handles (its
  markers drawn, never focusable) (default, as Google's view-only ruler).
- Telemetry: `UI · Toggled · TextDocumentRuler`; `Element · Changed · TextDocumentTabStop` (added, moved, taken away),
  `TextDocumentRulerIndent`; `Tab · Changed · TextDocumentMargins`.

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
Select all matching text. On an item of a numbered list, Restart numbering and Continue previous numbering follow
Clear formatting where they apply ([Lists](lists.md#numbering)). Each is the menu bar's item of the same name (Insert link is Insert > Link, Suggest edits
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
