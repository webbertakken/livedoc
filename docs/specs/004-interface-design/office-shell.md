# Office shell

**Status: partly built.** The look's tokens, menus as data, the menu bar, the tool finder, the shortcut layer, the
title row with its mode switch (each kind's modes), the toolbar, side panels, dialogs, context menus and the keyboard
shortcuts dialog are built.

The **office shell** is the frame the office kinds share: the [text document](../034-text-documents/text-document.md),
the spreadsheet and the [PDF document](../035-pdf-documents/reading-surface.md). It is Google's office layout
(title row, menu bar, toolbar, side panels, dialogs), built once and filled by each kind with its own menus, toolbar
groups and panels. Each kind's spec says what fills it
([Editing surface](../034-text-documents/editing-surface.md)); this spec says how the frame behaves.

## Parts

| Part               | Holds                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Title row**      | The mark, the name with its format pill, star, move, save status; on the right the kind's actions, Share, presence             |
| **Menu bar**       | The kind's menus, declared as data (below)                                                                                     |
| **Toolbar**        | The kind's groups of controls, declared as data, with overflow into a ⋮ row                                                    |
| **Side panel**     | One panel at a time on the right (comments, version history, image options, …), 360 px, closable, resizable from 280 to 560 px |
| **Left panel**     | The outline, or a kind's own (the spreadsheet's none), 260 px                                                                  |
| **Dialogs**        | The shell's dialog pattern, below                                                                                              |
| **Tool finder**    | Searches every menu item the kind declares                                                                                     |
| **Shortcut layer** | One registry of the kind's shortcuts, by platform, read by the menus, tooltips and the shortcuts dialog                        |

## The look

The shell draws every colour, size and radius from one set of **look tokens**, CSS custom properties named
`--office-*` on the shell's root, in light and dark. Nothing in a part names a colour of its own, so how literal the
look is (fork D2 of plan 0019) changes the tokens and nothing else.

Four looks were drawn for D2, each in light and dark, desktop and phone; Webber chose **C** (2026-11-21):

| Look                                           | Metrics                                                      | Colours and type                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **A. Google, literal**                         | Google's: 40 px toolbar pill, 18 px name, 14 px menus        | Google's: white chrome, `#edf2fa` toolbar, light blue Share; Google Sans (OFL); dark from Google's dark palette |
| **B. Google's neutrals, LiveDoc's accent**     | Google's                                                     | Google's greys; LiveDoc's sky for Share, focus and pressed controls; Inter                                      |
| **C. Google's metrics, LiveDoc's colours**     | Google's                                                     | LiveDoc's slate and sky in both schemes; Inter                                                                  |
| **D. LiveDoc's own chrome, in Google's order** | LiveDoc's toolbar group: 46 px bordered group, 36 px buttons | LiveDoc's slate and sky; Inter                                                                                  |

- **Look C** is the shell's: Google's sizes, LiveDoc's colours, slate and the brand's sky blue in both schemes, in the
  app's own sans. Its tokens are in `apps/live/app/office-shell.css`; no Google font or artwork ships in the shell.
- The page is paper in every scheme: white in the light one, dark in the dark one (Webber: "in dark mode the paper
  should be dark as well"), unless the document sets a page colour
  ([The page in the dark scheme](../034-text-documents/editing-surface.md#the-page-in-the-dark-scheme)).
- A PDF's pages follow the scheme too, recoloured by [Dark pages](../035-pdf-documents/dark-pages.md), which a person
  may turn off for their own view.
- Every token pair meets WCAG 2.2 AA in both schemes: 4.5:1 for text, 3:1 for a control's outline and focus ring.
- The shell's sizes are the source of LiveDoc's one [sizing scale](sizing.md), one step lower in height: its parts take
  the shared tokens (`packages/tailwind-config/theme.css`), and `office-shell.css` carries only the look's colours.
- Where look C names a size the scale has no step for, the shell keeps it: the title row's 40 px pills and the
  toolbar's 40 px band, boxes over 36 px that the sizing guard passes as layout; every other part is on the tokens.

## Menus as data

A kind declares its menus as one **catalogue**; the shell draws them, routes their shortcuts, lists them in the tool
finder and the shortcuts dialog, and hides what the session's level forbids. A menu item is never drawn by hand in a
kind's component.

- A **menu** has an id, a label and its access key (the letter of Alt+letter).
- An **entry** is an item, a submenu (a label and its entries) or a separator.
- An **item** has an id, a label, optional keywords for the tool finder, the id of its shortcut in the kind's
  registry, its kind (a command, an on/off check, or one of a set), the least share level that sees it (`view`,
  `participate` or `edit`), and its status: `built` or `comingSoon`.
- An item may be drawn as a **size grid** (Insert > Table's): a grid of cells inside its menu, one menu item, whose
  bound `runSized` takes the size chosen (columns and rows), and whose `run` is what the tool finder runs.
  - It starts 5 × 5 cells `(default)` and grows to one past the size pointed at, up to its most (20 × 20 for a
    table); the cells up to the size pointed at are filled, and the size reads under the grid as columns x rows
    ("3 x 2", Google's).
  - Hovering or pressing a cell sizes it; a press or a tap inserts that size. With the keyboard it opens at 1 x 1;
    Right and Left change the columns, Down and Up the rows, Enter or Space inserts; Up at one row and Down at the
    most pass to the menu's own items. Its accessible name says the size ("Table, 3 columns by 2 rows").
- What an item does is bound by id at run time: `run`, and `checked`, `disabled` and `label` where they apply; a bound
  label names what the item does now (Add space or Remove space before a paragraph) and is what the menu draws.
  A bound **picture** is drawn small before the item's label, hidden from screen readers, the label still naming it
  (Insert > Table of contents' looks in a text document).
  A `built` item with nothing bound is a fault the catalogue's test refuses; it is never drawn dead.
- A `comingSoon` item shows dimmed (`aria-disabled`), with "Coming soon" where its shortcut would be (its
  description, so a touch screen shows it too), until its phase lands. None remain once the kind's parity matrix is
  done.
- An item above the session's level is not drawn; a submenu or menu left with no item is not drawn; separators never
  lead, trail or double up.
- A `built` item the kind leaves unbound for this session (Share for someone who may not share) is not drawn either:
  the binding is the session's permission, and a `built` item is never shown dimmed.

## Title row

The shell draws the title row's parts the same for every kind, from what the editor page hands it (the document's
name, star, folder, sharing, people and account), so a kind adds only its own (its format pill, its save status, its
follow of a person's selection). The save status is drawn by the shell from one of five statuses the kind
reports. What each part is, its copy and who sees it:
[Editing surface](../034-text-documents/editing-surface.md#the-title-row).

- Left to right: the mark, then the name line (name, format pill, star, move, save status) over the menu bar; on the
  right, the kind's actions, Settings, Share or Make a copy, presence, the account.
- The name field is an `input` sized to its text, never wider than the room the right side leaves; the right side
  never shrinks, the name shortens with an ellipsis while not focused.
- Every icon control is a 32 px round button (44 px on touch) with its name as tooltip and accessible name.
- On a phone the title row is one line and the menus move into More ([Phone and tablet](#phone-and-tablet)).
- A kind may draw the title row **bare** (a PDF's Read mode): the name line alone, with one button to leave, in
  place of the menu bar, the toolbar and More; items' keys and the tool finder still work, a menu's access key not.

## Menu bar

The WAI-ARIA [menubar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/), on the shared
[menus](menus.md) for each open menu.

- One tab stop: Left and Right move between menus (wrapping), Home and End go to the first and last, Down, Enter and
  Space open the focused menu on its first item, Up on its last.
- In an open menu, Left and Right open the menu beside it (Right on a submenu row opens the submenu instead, Left in a
  submenu closes only it); Escape closes the menu and puts focus back on its name in the bar.
- A press opens a menu; while one is open, hovering another name opens that one instead.
- A submenu opens beside its row, level with it; where it would cross the window's bottom edge it moves up until it
  fits, 8 px clear of the edge, never past the window's top, as Google's does.
- **Access keys** open a menu from anywhere in the surface: Alt+letter in Chrome, Alt+Shift+letter in other browsers,
  Ctrl+Option+letter on a Mac, as [Keyboard shortcuts](../034-text-documents/keyboard-shortcuts.md) lists.
- A row shows its label, its check where it has one, its shortcut on the right in the platform's notation, and ▸ for
  a submenu. Labels keep Google's sentence case ("Make a copy"), the one exception to the Title Case of
  [item labels](menus.md#item-labels).

## Toolbar

A kind declares its toolbar as data too: groups of **controls**, each with an id, a label, a glyph, its shortcut's
id, the least share level that sees it and its status. A control that runs a menu item shares the item's id, so one
binding serves both; a control of its own (the zoom) is bound by its id the same way.

- The WAI-ARIA [toolbar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/): one tab stop, Left and Right
  between controls (wrapping), Home and End to the first and last; Down or Enter opens a control's menu. In a text
  field of the bar (the zoom) Left, Right, Home and End move in its text, and Left at its start or Right at its end
  moves on to the next control, so every control is in reach.
- A control's tooltip names it and its shortcut in the platform's notation; a toggle carries `aria-pressed`, read
  afresh as the selection or the formatting at the caret changes.
- Every target a pointer presses in the bar, a split control's chevron and a value field's list button included, is at
  least 24 by 24 px (WCAG 2.2 AA, 2.5.8 Target Size); a chevron is no narrower than that beside its control.
- **Value fields** (the zoom, the font size) are a field with a list, the WAI-ARIA combobox: a typed value applies on
  Enter, anything else puts the value back; Down or the chevron opens the list, Up and Down move in it, Enter takes
  one, Escape closes it, then puts back what was typed. The font size field shows the value at the caret, blank over
  a mixed selection, with − and + either side; taking a size returns focus to the writing.
- **Choice controls** (the Styles control) show the value at the caret as text with a chevron, blank over a mixed
  selection, and open a menu of the kind's choices, the one at the caret checked; a choice returns focus to the writing.
  A choice may be a **choice with a submenu** (a style with Apply and Update to match): a press on its row runs the
  choice, while hovering it, or Right, Enter or Space on it, opens its submenu, so the keyboard never runs a row it
  cannot see the submenu of. A choice menu holding submenus never scrolls, so a submenu is never cut off.
- A toggle may hold a **double press** (the paint roller): a second press in quick succession (a double-click) runs
  the binding's double press in place of a second plain press, so the toggle stays on; a press from the keyboard is
  always a plain press.
- A **split toggle** (a list button) is a toggle and, beside it, a chevron of its own (`<name> styles`) opening a
  **choice grid**: the kind's choices drawn as small previews, a WAI-ARIA menu of `menuitemradio` cells, the one in
  force checked; arrows move by cell and by row, Home and End to the ends, Enter or Space takes one, Escape closes it
  and puts focus back on the chevron. Down on the toggle opens its grid. Both halves are stops of the bar's arrows.
- **Colour controls** (Text colour, Highlight colour) show their glyph over a bar in the colour at the caret and open
  the [colour picker](colour-picker.md) in its swatch-button skin.
- A `comingSoon` control is drawn dimmed (`aria-disabled`), its tooltip saying "Coming soon"; a `built` control left
  unbound for the session, or above its level, is not drawn; a group left empty is not drawn, nor its divider.
- **Overflow**: the controls that do not fit move, from the right, behind a ⋮ button ("More") at the bar's end; it
  opens a second row under the bar holding them in the same order. The order never changes; the second row closes
  with Escape, a press outside, or once everything fits again.

## Tool finder

- Alt+/ (Option+/ on a Mac; Alt+Z in Chrome) or Help > Search the menus opens a search field over the menu bar.
- As the field changes, a list beneath it shows up to 12 items `(default)` whose label, keywords or menu path hold every
  word typed, each word matching the start of a word; items whose label starts with the query come first, then the
  catalogue's own order.
- Each result shows its label, its path ("Format › Text") and its shortcut; a `comingSoon` item lists dimmed with
  "Coming soon" and does nothing when chosen.
- Up and Down move through the results, Enter runs the one chosen and closes the finder, Escape closes it, and focus
  goes back where it was. The field is a `combobox` owning a `listbox`; the result count is announced.
- Nothing typed shows nothing: the finder suggests no items of its own.

## Shortcut layer

- A kind keeps one **registry** of its shortcuts: each has an id, a label, a group, and its keys for PC, Mac and
  ChromeOS in the notation [Keyboard shortcuts](../034-text-documents/keyboard-shortcuts.md#notation) defines.
- A keydown inside the surface is matched against the registry for the platform; a matched shortcut runs the item
  bound to its id and the browser's default is prevented. Keys the registry does not hold reach the browser and the
  editor untouched; a shortcut whose item is `comingSoon` or not bound is left alone too.
- A shortcut left to the browser (Copy, Cut, Paste) is never bound, so the browser's own clipboard events reach the
  kind; the menu item still runs.
- A shortcut the kind's surface hears itself (a spreadsheet's grid keys, Undo through the editor) is never run by the
  layer, which cannot tell a field's keys from the document's: it is listed as built and shown beside its item.
- A shortcut no item or control names (Copy text formatting) runs what the kind binds under the shortcut's own id;
  unbound for the session, its keys pass on.
- A **sequence** ("holding Ctrl+Alt, press N then H") starts on its first key with its modifiers held and runs on its
  second; releasing the modifiers, or any other key, ends it.
- The platform is read once from the browser (`navigator.userAgentData.platform`, else `navigator.platform`): Mac,
  ChromeOS, or PC for every other.
- Menus and tooltips show an item's first shortcut for the platform, in its notation (⌘ on a Mac).

## Context menus

A kind declares a **context menu** for each place in its document (the text's; a table's, a picture's and a link's
later) as catalogue entries, sharing their item ids with the menus, so one binding serves both. The shell draws it as it
draws a menu: dimmed while `comingSoon`, not drawn above the session's level or while a `built` item is unbound.

- A right-click in the document opens it at the pointer; with Shift held the browser's own menu shows instead, as
  Google leaves it. Ctrl+Shift+\ (⌘⇧\ on a Mac), Ctrl+Shift+X and Shift+F10, as
  [Keyboard shortcuts](../034-text-documents/keyboard-shortcuts.md) lists, and the keyboard's menu key open it at the
  caret.
- A right-click outside the selection first moves the caret to where it was pressed; inside it, the selection stays.
- It is a WAI-ARIA menu, as an open menu of the menu bar: focus starts on its first item, arrows move, Enter runs;
  Escape, a press outside or running an item closes it, and focus goes back to the document.
- It stays inside the window: it opens to the left of the point, or above it, where it would cross the right or
  bottom edge.
- A **contextual item** (a list's Restart numbering) is drawn only while its binding can run, read as the menu opens;
  the menus show the same item dimmed instead.

## Side panels

A kind declares its **panels** as data, as it does its menus: each has an id, a title, a side (`left` or `right`),
and the menu item that opens it, with any more that open it too (each checked while it is open). The shell draws the
panel's frame; the kind fills its body.

- **The right panel** sits at the right of the pages, under the toolbar, the full height left: 360 px wide `(default)`,
  resizable from 280 to 560 px by dragging its left edge. The edge is a `separator` (vertical) that holds its width as
  its value; Left and Right move it 16 px, Home and End to the narrowest and widest. The width is per person, remembered
  in this browser (`livedoc:v2:office-panel-width`) `(default)`.
- **The left panel** sits at the left of the pages, 260 px wide, not resizable.
- A kind with several left panels may give them a **rail**: a vertical toolbar of glyph toggles at the far left, one a
  panel, each named and with its name as tooltip, pressed while its panel is open; the rail is a part of its own in
  the F6 cycle, before the left panel, and is not drawn on a phone
  ([PDF document](../035-pdf-documents/reading-surface.md#the-left-panel)).
- A panel's telemetry name is its title's words joined, each capitalised (`Line numbers` is `LineNumbers`).
- One panel at a time on each side: opening a right panel closes the right panel open before it.
- A panel's header holds its title and a × ("Close <title>"); the body under it scrolls on its own.
- Each panel is a `complementary` landmark named by its title. Opening it from a menu item or a shortcut puts focus in
  it; Escape inside it closes it and gives focus back to the document ([Escape](escape.md)); its × closes it too.
- Whether a panel is open is per person, remembered in this browser per kind (`livedoc:v2:office-panels`)
  `(default)`, so a person who keeps the outline open finds it open in every document of the kind.
- The menu item that opens a panel is an on/off check, checked while it is open; choosing it again closes it.
- A kind may offer a panel to some sessions only (an Editor's), or only where review is shown (a text document's
  comments: never to a Viewer, never in Viewing): elsewhere its item is not bound and the panel is not drawn, even
  where this browser remembers it open, and it is drawn again where it is offered.
- On a phone a panel covers the pages, full width, over them; its × or Escape closes it.
- Panels appear without sliding: the shell's chrome never animates its layout.

## Dialogs

Every dialog of an office kind is the shell's **office dialog** (`OfficeDialog`): the app's modal
(`apps/live/components/dialogs/Dialog.tsx`) drawn in the shell's look tokens, so the editor's own
shortcuts go quiet behind it as behind any LiveDoc dialog.

- Modal, centred, 480 px wide, or 720 px for a wide one; its title (22 px) at the top left and a × ("Close") at the
  top right; then the body; then the buttons at the bottom right.
- The **primary** button is a filled pill, rightmost; **Cancel** is a text button before it. Enter in a one-line
  field runs the primary, unless it is disabled. A dialog with nothing to confirm (Keyboard shortcuts, Word count)
  has no button row; its × closes it.
- A dialog may hold a **secondary** button that changes only the dialog (Reset): an outlined pill at the bottom left;
  on a phone, a text button before the primary in the top bar.
- Escape, the × and a press on the dim around it close it with no change; Escape backs out of a search field with
  text first ([Escape](escape.md)).
- Focus starts on the first field (or the primary button); it is trapped inside and returns to the control that
  opened it. The dialog is named by its title.
- Below 640 px (the app's phone breakpoint, as every LiveDoc dialog) a dialog is a full-screen sheet: a top bar holds
  the ×, the title and the primary button, and there is no bottom row.
- Its colours are the look tokens': `--office-dialog` for the panel, `--office-primary` and `--office-primary-ink`
  for the primary button, `--office-line` for its edge.

## Keyboard shortcuts dialog

The kind's registry, shown: ⌘/ (Ctrl+/ elsewhere) or Help > Keyboard shortcuts opens it, for every share level.

- A wide office dialog titled **Keyboard shortcuts**, with a search field ("Search keyboard shortcuts") focused as it
  opens, and under it every row of the registry by group, in the registry's order, each group under its heading.
- Each row shows its action, then every way to give it on this platform and browser, in the platform's notation,
  joined by "or" (a way that holds only in another browser is not shown).
- A row with no way on this platform, left out (C3), or not needed (what it turns on the page does without), is not listed. A row left to the browser is listed: its keys
  work. A row not yet built is listed dimmed, with **Coming soon** after its action, until its phase lands.
- Typing filters it: a row is shown when every word typed starts a word of its action or its group's name; a group
  left with no row is not shown. With nothing shown it reads **No shortcuts match “…”**. How many rows show is
  announced politely ("12 shortcuts").
- The list scrolls under the search field, which stays in place; the list is a keyboard stop of its own, so arrow
  keys scroll it.

## Phone and tablet

- **Phone** (LiveDoc's phone: narrower than 640 px, or a touch screen under 500 px tall, as
  [live app](../007-editor/live-app.md) defines it):
  - The title row is one line: the mark, the name (shortened with an ellipsis), the save status as its glyph alone, the
    mode switch as its glyph alone (its mode is its tooltip and accessible name), Share (or Make a copy) as a round
    glyph button, and **More** (⋮).
  - More opens a menu holding the kind's menus in the menu bar's order, each a submenu, then **Star** (or
    **Starred**), **Settings** and **Account** `(default)`. The menu bar, the format pill, the star and move buttons,
    Settings, the people and the account are not drawn in the row.
  - The toolbar is one row that scrolls sideways, with no More and no zoom field (pinch zoom scales the pages).
  - While the on-screen keyboard is up, the toolbar docks just above it, so the writing's controls stay in reach.
- **Tablet** (640 to 1024 px): the desktop layout; the name shortens before anything on the right does, and the
  toolbar's overflow takes what does not fit.
- On a touch screen every control reaches 44 px, as everywhere in LiveDoc: the toolbar is 44 px tall there, so its
  items' pads are never clipped; the title row's round buttons and pill reach 44 px; the name and a list field (Zoom,
  a font size) grow to 44 px tall without moving their line.

## Motion

The shell's menus, panels and dialogs appear without sliding; with reduced motion (the system's setting or LiveDoc's
own) they appear without fading too ([Motion](motion.md#reduced-motion)).

## Behaviour

- **Keyboard**: F6 moves focus to the next part, Shift+F6 to the one before, wrapping: the title row, the menu bar,
  the toolbar, the rail, the left panel, the document, the right panel, then the editor's tab strip; a part not shown
  is skipped.
  It is the editor's one region cycle ([F6 moves between regions](canvas-accessibility.md)), so the browser's own F6
  is not used on the page.
- **Escape** backs out one layer per press, as everywhere ([Escape](escape.md)): a menu, then a dialog, then a panel,
  then focus back to the document.
- **Colour** is chosen only with the one [colour picker](colour-picker.md), in its swatch-button skin.
- **Toasts** use the shared toasts ([Toasts](toasts.md)).

## Modes

The title row's **mode switch** shows one person's mode on the document and lists the modes they may choose. The set
of modes is the kind's own; the shell draws it, keeps the person's choice and binds its menu items.

- A kind declares its modes once, in order, each with an id, its label, a line on what it does, its glyph (from the
  repo's icon set), the least share level that reaches it, the level the menus and toolbar are drawn for in it (never
  more than the session's, unless its changes are proposals), its status (`built` or `comingSoon`) and its menu item,
  whose catalogue row holds its shortcut.
- A mode whose changes are **proposals** that the room judges (a text document's Suggesting) also names the items a
  proposal can carry. It is drawn at its own level even for a session below that level, as Google draws a Commenter's
  menus in Suggesting. An item above the session's level runs only when the mode names it; every other one is
  dimmed, so nothing above the session's level becomes runnable, from a menu, the toolbar, a context menu or a key.
  The room's judge stays the guard.
- A text document's modes are Editing, Suggesting and Viewing
  ([Review](../034-text-documents/review.md#editing-modes)); a PDF's are its own.
- The switch lists the modes the session's level reaches; one not yet built is listed dimmed, "Coming soon" in place
  of its line. A person starts in the first built mode their level reaches, else the kind's last mode.
- A mode is one person's, never shared, kept while the surface is open and never stored; a level that changes under
  the person leaves a mode it no longer reaches for the starting one.
- What a mode lets the person change is the kind's: the shell gives the kind the mode and the level to draw at.
- An item a mode dims may carry a **note** and a **hint**: the note in the menu row where its shortcut would be, the
  hint in a hover card on the row and as its description to a screen reader, saying why it is dimmed and where it runs.
- Each built mode's menu item is bound by the shell (`run` chooses it, `checked` while it is chosen); a change logs
  `[office] mode` and tracks `UI · Changed · <the kind's mode type>`.

## Share roles

The shell renders what the kind's catalogue allows for the session's level: a control a session may not use is not
rendered ([Gate a feature by share role](../../instructions/gate-a-feature-by-share-role.md)). An item's least level is
its row's in the kind's spec ([Editing surface](../034-text-documents/editing-surface.md#the-menu-bar)).

## Telemetry

`UI · Opened · <Kind>Menu<Name>` (a menu opened), `UI · Used · <Kind>ToolFinder` (a result run from the finder),
`UI · Opened · <Kind>Panel<Name>` (a side panel opened), `UI · Toggled · <Kind>Star`, `UI · Opened · <Kind>Move`,
`UI · Used · <Kind>Follow` (a press on a person here), `UI · Opened · <Kind>Shortcuts` (the keyboard shortcuts
dialog opened), `UI · Opened · <Kind>ContextMenu` (a context menu opened). Never content, never what was typed.
