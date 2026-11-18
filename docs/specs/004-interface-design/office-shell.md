# Office shell

**Status: specified.** Nothing is built.

The **office shell** is the frame the office kinds share: the [text document](../034-text-documents/text-document.md)
and the spreadsheet of plan 0020. It is Google's office layout (title row, menu bar, toolbar, side panels, dialogs),
built once and filled by each kind with its own menus, toolbar groups and panels. Each kind's spec says what fills it
([Editing surface](../034-text-documents/editing-surface.md)); this spec says how the frame behaves. How literal the
look is, is fork D2 of plan 0019, open.

## Parts

| Part               | Holds                                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Title row**      | The mark, the name with its format pill, star, move, save status; on the right the kind's actions, Share, presence             |
| **Menu bar**       | The kind's menus, declared as data: id, label, shortcut, enabled, checked, submenu, run                                        |
| **Toolbar**        | The kind's groups of controls, declared as data, with overflow into a ⋮ row                                                    |
| **Side panel**     | One panel at a time on the right (comments, version history, image options, …), 360 px, closable, resizable from 280 to 560 px |
| **Left panel**     | The outline, or a kind's own (the spreadsheet's none), 260 px                                                                  |
| **Dialogs**        | The shell's dialog pattern, below                                                                                              |
| **Tool finder**    | Searches every menu item the kind declares                                                                                     |
| **Shortcut layer** | One registry of the kind's shortcuts, by platform, read by the menus, tooltips and the shortcuts dialog                        |

## Menus as data

A kind declares its menus and toolbar as one catalogue; the shell draws them, routes their shortcuts, lists them in
the tool finder and the shortcuts dialog, and hides what the session's `can` forbids. A menu item is never drawn by
hand in a kind's component. An item whose phase has not landed is declared `comingSoon` and shows dimmed with "Coming
soon".

## Dialogs

- Modal, centred, 480 px wide (wide dialogs 720 px), a title, the body, then the buttons at the bottom right: the
  primary (filled, the default on Enter) rightmost, Cancel before it. Escape and the × close with no change.
- Focus starts on the first field (or the primary button); it is trapped inside and returns to the control that
  opened it.
- On a phone a dialog is a full-screen sheet with the title and the primary button in a top bar.

## Behaviour

- **Keyboard**: the menu bar and toolbar as [Editing surface](../034-text-documents/editing-surface.md#accessibility)
  describes; F6 cycles title row, menu bar, toolbar, document, side panel.
- **Escape** backs out one layer per press, as everywhere ([Escape](escape.md)): a menu, then a dialog, then a panel,
  then focus back to the document.
- **Colour** is chosen only with the one [colour picker](colour-picker.md), in its swatch-button skin.
- **Toasts** use the shared toasts ([Toasts](toasts.md)).

## Share roles

The shell renders what the kind's catalogue allows for the session's `can`: a control a session may not use is not
rendered ([Gate a feature by share role](../../instructions/gate-a-feature-by-share-role.md)).

## Telemetry

`UI · Opened · <Kind>Menu<Name>`, `UI · Used · <Kind>ToolFinder`, `UI · Opened · <Kind>Panel<Name>`. Never content.
