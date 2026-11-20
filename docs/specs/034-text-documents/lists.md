# Lists

**Status: partly built.** Making lists, list styles, levels, numbering, restart and continue, and checklists are built;
List options > More bullets is specified, built with the [special characters](objects.md#special-characters) dialog.

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

## List styles

- The toolbar's three list buttons are each a **split toggle**: the toggle, and beside it a chevron ("Numbered list
  styles", "Bulleted list styles", "Checklist styles") opening a grid of Google's **presets**, each drawn as three
  lines at levels 0 to 2 with their markers, named by those markers:
  - Numbered: `1. a. i.` (the default), `1) a) i)`, `1. 1.1. 1.1.1.`, `A. a. i.`, `I. A. 1.`.
  - Bulleted: `● ○ ■` (the default), `❖ ➢ ■`, `➔ ○ ■`, `✓ ○ ■`, `★ ○ ■`, `- ○ ■`.
  - Checklist: With strikethrough (the default), Without strikethrough.
- A preset's first levels repeat down the nine levels: three a cycle (`I. A. 1.` cycles `I. A. 1. a. i.`); the
  outline preset shows every level's number (`1.1.1.1.`); each level 0.5 in deeper than the one before.
- **Taking a preset**: when every paragraph the selection touches is in one list, that list takes the preset's levels,
  all its items, wherever they are (default: Google restyles the whole list); otherwise the paragraphs join a new
  list in the preset, each keeping its level, as making a list does. Never a toggle off; one undo step; focus goes back
  to the writing.
- The preset the caret's list matches (its first three levels' markers, and a checklist's strikethrough) is checked.
- The grid is a WAI-ARIA menu of `menuitemradio` cells, two or three to a row: arrows move by cell and row, Home and
  End to the first and last, Enter or Space takes one, Escape closes it and puts focus back on the chevron. Down on a
  list toggle opens its grid too.
- A checklist without strikethrough ticks its items with no line through them and no grey.

## Levels

- Nine levels (0 to 8). Tab and Shift+Tab at an item's start move it a level in and out (Tab elsewhere types a tab);
  ⌘] and ⌘[, and Increase and Decrease indent, do so anywhere in an item, as one undo step. A level never goes past 0
  or 8.
- Each level has its own marker, number format, indent and start value, from the list's definition.
- **Drawn**: an item stands at its level's indent, its marker in the hanging space before its first line, in the
  paragraph's font, size and colour (default); a paragraph's own indents draw over its level's.
- The marker is no text: it cannot be selected, copied or typed into, and a screen reader reads it as the item's
  position ("1.", "bullet") before its text.

## Numbering

- Numbering continues through the list's items at each level, restarting a deeper level after a shallower item.
- **Restart numbering** starts the numbering of the caret's item's level again there, at a number: a dialog
  ("Restart numbering") with one field, **Start at** (1 to start with), Cancel and OK. A whole number from 0 to 32767
  (Word's most; default) is taken; anything else is refused under the field: "Enter a whole number from 0 to 32767."
  Items after it at that level count on from there.
- **Continue previous numbering** takes back a restart: on an item that restarts, the restart goes; on an item of a
  numbered list that follows another numbered list, every item of its list joins the list before (the list of the
  nearest numbered item before its list's first item), keeping their levels, so the numbering runs on.
- Both act on the first numbered item the selection touches, as one undo step. In Format > Bullets & numbering >
  List options they are dimmed where they do not apply; the context menu on text shows them only where they apply.

## List options

Format > Bullets & numbering > **List options**: Restart numbering, Continue previous numbering, and More bullets.

- **More bullets**: any character from the [special characters](objects.md#special-characters) dialog as the bullet
  of the caret's item's level; built with that dialog, dimmed until then.

## Checklists

- A checklist item's box is a checkbox (`role="checkbox"`, named by the item's text) that toggles on press, for
  anyone who may edit; ⌘⌥Enter (Ctrl+Alt+Enter) toggles the items the selection touches: ticked for all unless all are.
  A ticked item is struck through and greyed (default: Google's checklist with strikethrough), unless its list is a
  checklist without strikethrough.
- A checked item's state is a change like any edit: undone with ⌘Z, a suggestion in Suggesting mode.

## In the formats

ODF `text:list` with a list style; OOXML numbering definitions; checklists as each format holds them
([Standard mapping](standard-mapping.md#what-the-model-holds)). A list's custom bullets and number formats map
one to one where both formats have them; others are listed losses on conversion. A restart is ODF's
`text:start-value` on the item, and in OOXML a `w:num` of the list's abstract numbering with a `w:startOverride`
at the item's level, used from that item on; a checklist without strikethrough is `livedoc:strike-checked="false"`
on its levels.

## Share roles

Editors change lists, list styles and numbering, and tick checklist items; a Participant ticks only as a suggestion (D7); a Viewer reads.

## Telemetry

`Element · Changed · TextDocumentList<Kind>` (Bulleted, Numbered, Checklist), `TextDocumentListStyle<Kind>` (a preset
taken), `TextDocumentListRestart`, `TextDocumentListContinue`, `TextDocumentChecklistTicked`. Never text.
