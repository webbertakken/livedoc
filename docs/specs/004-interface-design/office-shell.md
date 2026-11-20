# Office shell

**Status: partly built.** The look's tokens, menus as data, the menu bar, the tool finder, the shortcut layer and the
title row (but its save status) are built; the toolbar, side panel, dialogs, context menus and the shortcuts dialog
are specified.

The **office shell** is the frame the office kinds share: the [text document](../034-text-documents/text-document.md)
and the spreadsheet of plan 0020. It is Google's office layout (title row, menu bar, toolbar, side panels, dialogs),
built once and filled by each kind with its own menus, toolbar groups and panels. Each kind's spec says what fills it
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

Four looks were drawn for D2, each in light and dark, desktop and phone:

| Look                                           | Metrics                                                      | Colours and type                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **A. Google, literal**                         | Google's: 40 px toolbar pill, 18 px name, 14 px menus        | Google's: white chrome, `#edf2fa` toolbar, light blue Share; Google Sans (OFL); dark from Google's dark palette |
| **B. Google's neutrals, LiveDoc's accent**     | Google's                                                     | Google's greys; LiveDoc's sky for Share, focus and pressed controls; Inter                                      |
| **C. Google's metrics, LiveDoc's colours**     | Google's                                                     | LiveDoc's slate and sky in both schemes; Inter                                                                  |
| **D. LiveDoc's own chrome, in Google's order** | LiveDoc's toolbar group: 46 px bordered group, 36 px buttons | LiveDoc's slate and sky; Inter                                                                                  |

- Until D2 is ruled, the tokens hold look A's colours and metrics, in the app's own sans `(default)`.
- The page is paper in every look and scheme: white unless the document sets a page colour, as Google and Word draw
  it `(default)`.
- Every token pair meets WCAG 2.2 AA in both schemes: 4.5:1 for text, 3:1 for a control's outline and focus ring.

## Menus as data

A kind declares its menus as one **catalogue**; the shell draws them, routes their shortcuts, lists them in the tool
finder and the shortcuts dialog, and hides what the session's level forbids. A menu item is never drawn by hand in a
kind's component.

- A **menu** has an id, a label and its access key (the letter of Alt+letter).
- An **entry** is an item, a submenu (a label and its entries) or a separator.
- An **item** has an id, a label, optional keywords for the tool finder, the id of its shortcut in the kind's
  registry, its kind (a command, an on/off check, or one of a set), the least share level that sees it (`view`,
  `participate` or `edit`), and its status: `built` or `comingSoon`.
- What an item does is bound by id at run time: `run`, and `checked` and `disabled` where they apply. A `built` item
  with nothing bound is a fault the catalogue's test refuses; it is never drawn dead.
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
follow of a person's selection). What each part is, its copy and who sees it:
[Editing surface](../034-text-documents/editing-surface.md#the-title-row).

- Left to right: the mark, then the name line (name, format pill, star, move, save status) over the menu bar; on the
  right, the kind's actions, Settings, Share or Make a copy, presence, the account.
- The name field is an `input` sized to its text, never wider than the room the right side leaves; the right side
  never shrinks, the name shortens with an ellipsis while not focused.
- Every icon control is a 32 px round button (44 px on touch) with its name as tooltip and accessible name.
- On a phone the title row keeps the mark, the name and Share; the rest moves into the kind's phone layout.

## Menu bar

The WAI-ARIA [menubar pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/), on the shared
[menus](menus.md) for each open menu.

- One tab stop: Left and Right move between menus (wrapping), Home and End go to the first and last, Down, Enter and
  Space open the focused menu on its first item, Up on its last.
- In an open menu, Left and Right open the menu beside it (Right on a submenu row opens the submenu instead, Left in a
  submenu closes only it); Escape closes the menu and puts focus back on its name in the bar.
- A press opens a menu; while one is open, hovering another name opens that one instead.
- **Access keys** open a menu from anywhere in the surface: Alt+letter in Chrome, Alt+Shift+letter in other browsers,
  Ctrl+Option+letter on a Mac, as [Keyboard shortcuts](../034-text-documents/keyboard-shortcuts.md) lists.
- A row shows its label, its check where it has one, its shortcut on the right in the platform's notation, and ▸ for
  a submenu. Labels keep Google's sentence case ("Make a copy"), the one exception to the Title Case of
  [item labels](menus.md#item-labels).

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
- A **sequence** ("holding Ctrl+Alt, press N then H") starts on its first key with its modifiers held and runs on its
  second; releasing the modifiers, or any other key, ends it.
- The platform is read once from the browser (`navigator.userAgentData.platform`, else `navigator.platform`): Mac,
  ChromeOS, or PC for every other.
- Menus and tooltips show an item's first shortcut for the platform, in its notation (⌘ on a Mac).

## Dialogs

- Modal, centred, 480 px wide (wide dialogs 720 px), a title, the body, then the buttons at the bottom right: the
  primary (filled, the default on Enter) rightmost, Cancel before it. Escape and the × close with no change.
- Focus starts on the first field (or the primary button); it is trapped inside and returns to the control that
  opened it.
- On a phone a dialog is a full-screen sheet with the title and the primary button in a top bar.

## Behaviour

- **Keyboard**: F6 cycles title row, menu bar, toolbar, document, side panel.
- **Escape** backs out one layer per press, as everywhere ([Escape](escape.md)): a menu, then a dialog, then a panel,
  then focus back to the document.
- **Colour** is chosen only with the one [colour picker](colour-picker.md), in its swatch-button skin.
- **Toasts** use the shared toasts ([Toasts](toasts.md)).

## Share roles

The shell renders what the kind's catalogue allows for the session's level: a control a session may not use is not
rendered ([Gate a feature by share role](../../instructions/gate-a-feature-by-share-role.md)). An item's least level is
its row's in the kind's spec ([Editing surface](../034-text-documents/editing-surface.md#the-menu-bar)).

## Telemetry

`UI · Opened · <Kind>Menu<Name>` (a menu opened), `UI · Used · <Kind>ToolFinder` (a result run from the finder),
`UI · Opened · <Kind>Panel<Name>` (a side panel opened), `UI · Toggled · <Kind>Star`, `UI · Opened · <Kind>Move`,
`UI · Used · <Kind>Follow` (a press on a person here). Never content, never what was typed.
