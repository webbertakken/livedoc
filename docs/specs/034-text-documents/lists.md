# Lists

**Status: partly built.** Making lists, levels, numbering drawn and checklists are built; presets, restart and continue
numbering and List options are specified.

Bulleted, numbered and checklist lists in a [text document](text-document.md), as Google Docs has them.

## Making a list

- **Bulleted** (⌘⇧8), **numbered** (⌘⇧7), **checklist** (⌘⇧9) from the toolbar or Format > Bullets & numbering act on
  every paragraph the selection touches, as one undo step, and return focus to the writing. When all of them are in
  lists of that kind, they leave their lists; otherwise they all join one list of that kind, each keeping its level
  (a paragraph in no list starts at level 0).
- **Which list they join**: the list of the paragraph just before the first of them, when that is a list of the same
  kind, so the numbering runs on; otherwise a new list in Google's style of that kind (bullets ● ○ ■, numbers 1. a. i.,
  checkboxes), each level 0.5 in deeper than the one before (default).
- The toolbar's three list buttons are pressed when every paragraph the selection touches is in a list of their kind.
- **Enter** in an item makes a new item at the same level (unticked); Enter on an empty item takes it out of the
  list. **Backspace** at the start of an item takes it out of the list, keeping its text where it stands.
- **Automatic lists** (Preferences): `1.`, `a.`, `i.`, `-`, `*` and `[ ]` at a paragraph's start followed by a space.
- The toolbar's list buttons each carry a menu of styles: Google's presets (numbered: 1. a. i., 1) a) i), 1. 1.1.
  1.1.1., A. B. C., I. A. 1.; bulleted: ●○■, ❖➢■, ➔○■, ✓○■, ★○■, -○■; checklist: with or without strikethrough).

## Levels

- Nine levels (0 to 8). Tab and Shift+Tab at an item's start move it a level in and out (Tab elsewhere types a tab);
  ⌘] and ⌘[, and Increase and Decrease indent, do so anywhere in an item, as one undo step. A level never goes past 0
  or 8.
- Each level has its own marker, number format, indent and start value, from the list's definition.
- **Drawn**: an item stands at its level's indent, its marker in the hanging space before its first line, in the
  item's first character's font, size and colour (default); a paragraph's own indents draw over its level's.
- The marker is no text: it cannot be selected, copied or typed into, and a screen reader reads it as the item's
  position ("1.", "bullet") before its text.

## Numbering

- Numbering continues through the list's items at each level, restarting a deeper level after a shallower item.
- **Restart numbering** (context menu, list options) at an item, with a start value; **Continue previous numbering**
  joins a list to the one before it.
- **List options** > More bullets: any character from the special characters dialog as a level's bullet.

## Checklists

- A checklist item's box is a checkbox (`role="checkbox"`, named by the item's text) that toggles on press, for
  anyone who may edit; ⌘⌥Enter (Ctrl+Alt+Enter) toggles the items the selection touches: ticked for all unless all are.
  A ticked item is struck through and greyed (default: Google's checklist with strikethrough).
- A checked item's state is a change like any edit: undone with ⌘Z, a suggestion in Suggesting mode.

## In the formats

ODF `text:list` with a list style; OOXML numbering definitions; checklists as each format holds them
([Standard mapping](standard-mapping.md#what-the-model-holds)). A list's custom bullets and number formats map
one to one where both formats have them; others are listed losses on conversion.

## Share roles

Editors change lists and tick checklist items; a Participant ticks only as a suggestion (D7); a Viewer reads.

## Telemetry

`Element · Changed · TextDocumentList<Kind>` (Bulleted, Numbered, Checklist), `TextDocumentListRestart`,
`TextDocumentChecklistTicked`. Never text.
