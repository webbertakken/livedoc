# Lists

**Status: specified.** Nothing is built.

Bulleted, numbered and checklist lists in a [text document](text-document.md), as Google Docs has them.

## Making a list

- **Bulleted** (⌘⇧8), **numbered** (⌘⇧7), **checklist** (⌘⇧9) from the toolbar or Format > Bullets and numbering; the
  same command on a list of that kind takes the paragraphs out of it.
- **Automatic lists** (Preferences): `1.`, `a.`, `i.`, `-`, `*` and `[ ]` at a paragraph's start followed by a space.
- The toolbar's list buttons each carry a menu of styles: Google's presets (numbered: 1. a. i., 1) a) i), 1. 1.1.
  1.1.1., A. B. C., I. A. 1.; bulleted: ●○■, ❖➢■, ➔○■, ✓○■, ★○■, -○■; checklist: with or without strikethrough).

## Levels

- Nine levels (0 to 8). Tab and Shift+Tab at an item's start move it a level in and out; ⌘] and ⌘[ do so anywhere.
- Each level has its own marker, number format, indent (0.25 in steps) and start value, from the list's style.

## Numbering

- Numbering continues through the list's items at each level, restarting a deeper level after a shallower item.
- **Restart numbering** (context menu, list options) at an item, with a start value; **Continue previous numbering**
  joins a list to the one before it.
- **List options** > More bullets: any character from the special characters dialog as a level's bullet.

## Checklists

- A checklist item's box toggles on press, for anyone who may edit (⌘⌥Enter at the caret); a checked item is struck
  through and greyed when the list's style says so.
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
