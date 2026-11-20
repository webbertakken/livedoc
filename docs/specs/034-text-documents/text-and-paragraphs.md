# Text and paragraphs

**Status: partly built.** Text formatting, colour, paragraph styles, default styles, alignment, indents, spacing,
keep rules, borders and shading, paint format, clear formatting, the Tab key, Shift+Enter, tab stops,
non-printing characters, the clipboard (but Markdown) and several stretches are built; the rest is specified.

Typing, selecting and formatting text and paragraphs in a [text document](text-document.md), as Google Docs does.
Every rule maps to a format construct in [Standard mapping](standard-mapping.md#what-the-model-holds).

## Writing

- **A press puts the caret there**; a drag selects; double-click selects a word (double-click and drag extends by
  words), triple-click a paragraph (triple-click and drag extends by paragraphs).
- **Keys**: the arrows, Home and End, word jumps, Page Up and Down, Shift to extend, ⌘↑ and ⌘↓ to the start and end,
  IME composition, dictation by the system, the system emoji picker: all as in any editor.
- **Enter** splits the paragraph: after a heading, the new paragraph takes the heading's next style (Normal text); in
  a list, a new item; on an empty list item, the item leaves the list. **Shift+Enter** is a line break.
- **Backspace** at the start of a list item takes it out of the list, then joins; elsewhere it joins the paragraph
  before. **Delete** at the end joins the next.
- **Tab** types a tab, which moves the text after it to the next [tab stop](#tab-stops); over a selection that
  spans paragraphs, Tab and Shift+Tab step their indent as ⌘] and ⌘[ do (default, as Word and Google do, inferred).
  In a list item Tab and Shift+Tab step its level ([Lists](lists.md#levels)). Elsewhere Shift+Tab does nothing, so
  focus stays in the writing; F6 leaves it for the next region
  ([Office shell](../004-interface-design/office-shell.md)).
- **Move paragraph up and down**: Ctrl⇧↑ / ↓ moves the paragraphs the selection touches past their neighbour.
- **Repeat last action** (⌘Y) repeats the last formatting or insertion at the new selection.

## Selection

- **Select all** (⌘A) selects the current document tab's body; in a header, footer or footnote, that part's text.
- **Select multiple sections of text**: with text selected, Ctrl⌘⇧← or → (Ctrl+Alt+Shift elsewhere) keeps it and
  puts a second caret a character to that side; the arrows move that caret, Shift with them selects from it, and the
  keys again keep that stretch too and start another. ⌘-drag (Ctrl-drag elsewhere) adds a stretch with the pointer
  (default, as Google's).
- **Several stretches** are drawn in the selection's colour, the caret still to place drawn as a caret. Text and
  paragraph formatting, paragraph styles, lists and Delete act on all of them; Copy copies them in order, each from a
  new line. Typing, Enter, Tab and Paste act at the last stretch alone, the others let go (default). Escape keeps the
  last stretch alone. A collaborator's change keeps the last stretch alone, as the live merge restores one selection.
- How many stretches are selected is announced politely ("3 stretches selected").
- **Select all matching text** (context menu) selects every stretch of text with the text formatting at the caret (or
  where the selection starts) in a paragraph of the same paragraph style (default: a run's own formatting, its text
  style and the file's own run formatting compared, as Paint format copies them).
- **Delete** removes the selection.

## Clipboard

- **Copy** (⌘C) and **Cut** (⌘X) put the selection on the clipboard three ways at once:
  - **HTML** for other editors: each paragraph and run with its formatting written out in place, its styles resolved,
    headings as `h1` to `h6`, list items as `li` in `ul` and `ol`, colours as on white paper in either scheme;
  - **plain text**: a line per paragraph, a list item after its marker as drawn and a space, tabs and line breaks as
    typed (default);
  - **LiveDoc's model fragment**, carried in the HTML (`data-livedoc-fragment`), so it travels wherever the HTML does:
    the paragraphs and runs exactly, with the styles and lists they name.
- Content kept from the file and section breaks travel in the fragment only; the HTML and the text leave them out.
- Copy works at every share level; Cut removes the selection where the person may edit.
- **Paste** (⌘V) reads the first of these the clipboard holds:
  1. **A model fragment from this tab**: everything as copied, kept content included; list items join their lists.
  2. **A model fragment from another text document or tab**: a paragraph style with a built-in role becomes this
     document's style of that role; one this document holds by the same id and name stays; any other becomes Normal
     text with its look kept as direct formatting (default). Its lists arrive as new lists, numbered as copied.
     Content kept from the other file stays behind, as it points into that file; the paste says so: "Content kept from
     the other file was left out (3 items)." (default)
  3. **HTML** from a web page or another editor: `h1` to `h6` become Heading 1 to 6, other paragraphs Normal text;
     `ul`, `ol` and Word's list paragraphs become bulleted, numbered or checklist lists at their nesting level; safe
     links, bold, italic, underline, strikethrough, superscript, subscript, font, size, colour, highlight, small caps,
     capitalisation, alignment, indents and spacing are read from tags and inline CSS; a page's white behind its
     text is no highlight (default). Its whitespace is collapsed as a browser draws it, except where the source
     keeps it (`pre`, `white-space: pre*`); `br` is a line break.
     A table's cells arrive as paragraphs in reading order until [tables](tables.md) are built; pictures wait for
     [Objects](objects.md#pictures), left out and logged.
  4. **Markdown text**, read as Markdown when Preferences > Automatically detect Markdown is on, as Google does.
  5. **Plain text**: a paragraph per line, empty lines kept, each in the paragraph formatting and the text formatting
     at the caret.
- Pasted into an empty paragraph, or over a paragraph's whole text, the first paragraph pasted keeps its own style;
  into part of a paragraph, it joins that paragraph, as Google's paste does.
- A fragment that is not one LiveDoc wrote (its shape or size wrong) is ignored and the HTML read instead.
- **Paste without formatting** (⌘⇧V) pastes the clipboard's plain text, as in 5, whatever else it holds.
- A paste is one undo step, its new lists included; text dropped from outside the writing is read as a paste.
- **Edit > Cut, Copy, Paste, Paste without formatting** ask the browser for the clipboard. Where it refuses, the
  dialog **Copying and pasting** says to use ⌘X, ⌘C, ⌘V and ⌘⇧V instead, as Google's does.
- Their keys are left to the browser ([Office shell](../004-interface-design/office-shell.md#shortcut-layer)), whose
  clipboard events the writing handles.
- Pictures pasted are uploaded into the document ([Objects](objects.md#pictures)).

## Text formatting

| Format                  | Shortcut                     | Notes                                                                         |
| ----------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| Bold, italic, underline | ⌘B, ⌘I, ⌘U                   |                                                                               |
| Strikethrough           | ⌘⇧X (Alt⇧5 on PC)            |                                                                               |
| Superscript, subscript  | ⌘. and ⌘,                    | One or the other                                                              |
| Font                    | Toolbar                      | From the [document fonts](../004-interface-design/fonts.md#document-fonts)    |
| Size                    | Toolbar; ⌘⇧. and ⌘⇧, step it | 1 to 400 pt; steps 6, 7, 8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96 |
| Small caps              | ⌘⇧K (Option⇧K on a Mac)      |                                                                               |
| Capitalisation          | Format > Text                | lowercase, UPPERCASE, Title Case: changes the characters                      |
| Text colour, highlight  | Toolbar                      | [Colour](#colour)                                                             |

Formatting with no selection applies to the next characters typed at the caret.

- **A toggle** (bold, italic, underline, strikethrough, small caps) is on when every character of the selection has
  it, through its styles or its own formatting; over an empty selection, when the caret's formatting has it.
- Pressing a toggle that is on turns it off for the whole selection; one that is off, or mixed, turns it on for all.
- A value equal to what the character's styles give is stored as no formatting of its own, so a file gains no needless
  direct formatting (both formats inherit the style's).
- **Superscript and subscript** are one or the other: pressing the one that is on returns the text to the baseline;
  pressing the other moves it there.
- **Size**: the toolbar's size field shows the size at the caret, or the selection's when it has one size; blank when
  mixed. A number typed from 1 to 400 applies on Enter, rounded to a tenth of a point (default); anything else puts
  the value back. The field's list holds the steps above.
- **− and +** and ⌘⇧, and ⌘⇧. change each character's size by one point, kept within 1 to 400 (as Google does,
  inferred from Google's shortcut list); a mixed selection keeps its differences.
- **Capitalisation** rewrites the selected characters, each keeping its formatting: lowercase, UPPERCASE, or Title
  Case (each word's first letter upper case and the rest lower case (default)). With nothing selected it changes
  nothing (default).
- Each change is one undo step, and returns focus to the writing.

## Colour

Text colour and highlight colour are chosen with the one [colour picker](../004-interface-design/colour-picker.md) in
its swatch-button skin: Google's grid of colours is the picker's standard colours, tones and Custom colours (the
picker has no second grid). **Reset** (text) and **None** (highlight) lead each picker.

- **The controls**: the toolbar's Text colour (a lettered A) and Highlight colour (a highlighter), each with a bar
  under its glyph in the colour at the caret: the text's colour through its styles, its highlight or no colour.
  Over a selection of more than one colour the bar shows no colour (default).
- **The picker** shows no Theme Palette, as a text document has no theme (default); the Standard Colours as two
  rows, Light (the soft tone) then Dark (the strong tone), both drawn for the page's light paper; then Custom
  Colours and **Add a custom colour**.
- **Picking** sets the colour of the selection (or of the next characters typed), as one undo step, closes the
  picker and returns focus to the writing. A standard colour is stored as its light-paper `#rrggbb`, a custom
  colour as its own; a value equal to what the styles give is stored as none.
- **Reset** takes away the text's own colour, so it draws in its styles' colour. **None** takes away the text's
  own highlight; a highlight its style gives still shows (default).
- **Keyboard**: the picker's own (colour-picker.md "Keyboard"); Escape closes it and returns focus to its control.
- **Share roles**: an Editor colours text; a Participant and a Viewer see neither control (the Format level).
- In files: ODF `fo:color` and `fo:background-color`; OOXML `w:color`, and `w:highlight` when the highlight is one
  of its sixteen named colours, else `w:shd` ([Standard mapping](standard-mapping.md)).

## Paragraph styles

- **Normal text, Title, Subtitle, Heading 1 to 6**, each with its font, size, weight, colour and spacing. A new text
  document's styles are Google's defaults (Arial 11 pt, line spacing 1.15; Title 26 pt; Subtitle 15 pt grey; Heading 1
  20 pt, Heading 2 16 pt, Heading 3 14 pt grey, Heading 4 12 pt grey, Heading 5 and 6 11 pt grey, 6 italic)
  (assumed: Google's defaults as known; confirmed with the captures).
- **A paragraph draws in its style**: the font, size, weight, slant, colour, line spacing and spacing before and after
  its style gives through its parents and the defaults; the text's own formatting draws over it. A paragraph with no
  style, or one the document does not hold, draws as Normal text.
- **Applying a style** (the toolbar's Styles menu, Format > Paragraph styles, ⌘⌥0 and ⌘⌥1 to ⌘⌥6) sets it on every
  paragraph the selection touches, as one undo step, and returns focus to the writing. The text keeps its own
  formatting (default). A style the document lacks (a file that never named a Title) is first added from a new
  document's set (default).
- **The Styles control** shows the style of the paragraph at the caret, blank when the selection spans several. Its
  menu lists the nine styles, each drawn in its weight and slant at its size held between 13 and 22 px (default),
  checked when it is the style at the caret, then Options. A press on a style's row applies it; hovering the row, or
  Right, Enter or Space on it, opens its submenu: **Apply '<style>'** and **Update '<style>' to match**, as Google's.
- **Format > Paragraph styles** lists the nine styles, each a submenu holding the same two items (Apply carries its
  shortcut), then Options; no row is checked there, as in Google's Format menu.
- ⌘⌥0 applies Normal text, ⌘⌥1 to ⌘⌥6 the headings.
- Share roles: an Editor applies and updates styles; a Participant and a Viewer see neither the Styles control nor
  the items.
- A paragraph's own formatting over its style is kept as direct formatting (ODF automatic style, OOXML direct
  properties).

### A style's look

- A style's **look** is the formatting it draws its paragraphs in, through its parents and the defaults: font, size,
  bold, italic, underline, strikethrough, small caps, case and colour; alignment, indents, line spacing, space before
  and after, keep with next, keep lines together and prevent single lines.
- A highlight and superscript or subscript are never part of a look: they stay the text's own (default).
- A property the look leaves unset reads as its plain value: black, left aligned, no indent or space, single line
  spacing, each toggle off (default).
- A heading's outline level is not part of its look: updating or resetting a style never changes it.

### Update to match

- **Update '<style>' to match** sets the style's look from the text at the caret (where the selection starts) and its
  paragraph: the text's formatting through its styles and its own, and the paragraph's own alignment, indents and
  spacing over its style's.
- Every paragraph of that style redraws in its new look at once; their own formatting stays over it.
- The paragraph at the caret takes the style (default), and draws wholly in it: its text's and its own formatting of
  the look's properties is dropped (default).
- **Every other style keeps its look** (default): a style built on the updated one (each heading is built on Normal
  text) holds what it drew before, so updating Normal text changes no heading, as Google's styles stand alone.
- A style the document lacks is first added from a new document's set, as applying does.
- It is one undo step with the paragraph's change, and returns focus to the writing.

## Default styles

Styles > Options and Format > Paragraph styles > Options hold three items, as Google's:

- **Save as my default styles** keeps the nine styles' looks in this document as the person's **default styles**, in
  their [preferences](../007-editor/user-preferences.md): with their account when signed in, else with this browser's
  guest identity (default). Only what differs from Google's defaults is kept (default), so an unchanged set keeps
  nothing.
- **Use my default styles** sets this document's nine styles to the person's default styles (Google's defaults for a
  look not saved), every other style keeping its look; one undo step.
- **Reset styles** sets this document's nine styles to Google's defaults, the same way; one undo step.
- **A new text document starts in its maker's default styles**: when the person who made it first opens it, its
  styles are set to their default styles before anything is typed (default), never as an undo step. A file opened
  as a text document keeps its own styles; someone else's new document keeps its maker's.
- Default styles with all nine looks changed fit the preferences' cap with room for every other key.
- Share roles: Use and Reset change the document, so an Editor only; Save changes only the person's own preferences,
  yet sits with the others where an Editor sees them (default).
- A saved set that does not read back as looks (a cache from elsewhere) is ignored whole and logged
  `[text-document] default styles unreadable`; Use then applies Google's defaults.

## Alignment and indents

- **A paragraph draws in its own paragraph formatting** over its style's: alignment, indents, spacing and line
  spacing, as in both formats' direct paragraph properties.
- **Alignment**: Left, Centre, Right and Justified (⌘⇧L, ⌘⇧E, ⌘⇧R, ⌘⇧J; Format > Align & indent; the toolbar's Align
  control) set it on every paragraph the selection touches, as one undo step, and return focus to the writing. An
  alignment equal to the style's is stored as none of the paragraph's own, as text formatting is.
- The **Align control** shows the alignment of the paragraphs the selection touches by its icon (Left when they
  differ) and opens a menu of the four, the one there is checked (default: Google draws the four as a row of icons).
- **Increase indent** and **Decrease indent** (⌘] and ⌘[, Format > Align & indent, the toolbar) move every paragraph
  the selection touches by 0.5 in (36 pt), from what it draws with; decreasing never goes past 0, increasing never
  past 6 in (432 pt) (default: a letter page's line less 0.5 in). A first-line or hanging indent moves with it.
- **Indentation options** (Format > Align & indent) is a dialog for the paragraphs the selection touches: **Left**
  and **Right** indents, and **Special indent** (None, First line, Hanging) with its size, each in centimetres, or in
  inches where the browser's language is American English (default). A field shows the paragraphs' value, blank when
  they differ, and a blank field changes nothing. **Apply** sets them as one undo step; **Cancel** and Escape change
  nothing. A value past 0 to 55.88 cm (22 in) is refused in the field: "Enter a number from 0 to 55.88."
- Share roles: an Editor aligns and indents; a Participant and a Viewer see none of the items or controls.

## Spacing and keep rules

- **Line spacing**: Single, 1.15, 1.5 and Double (Format > Line & paragraph spacing; the toolbar's Line & paragraph
  spacing control, which opens the same menu) set it on every paragraph the selection touches, as one undo step,
  and return focus to the writing; the one the paragraphs have is checked, none for a custom value or when they differ.
- **Add space before paragraph** and **Add space after paragraph** add 12 pt (default) where the paragraphs have none;
  where they have some, the item reads **Remove space before paragraph** (or after) and sets it to 0, as Google's.
- **Custom spacing** is a dialog for the paragraphs the selection touches: **Line spacing** (a multiple, 0.06 to 100)
  and **Paragraph spacing** **Before** and **After** (points, 0 to 1,584). A field shows the paragraphs' value, blank
  where they differ, and a blank field changes nothing; a value out of range is refused in the field ("Enter a
  number from 0.06 to 100.", "Enter a number from 0 to 1584."). **Apply** sets them as one undo step.
- **Keep with next**, **Keep lines together** and **Prevent single lines** (widows and orphans of two) are switches on
  every paragraph the selection touches: checked when all have it, and on for all unless all have it. A new
  document's paragraphs prevent single lines; headings keep with next.
- The keep rules shape where pages break: they are drawn as the print layout's break rules (`break-after`,
  `break-inside`, `widows` and `orphans`), and laid out with pagination ([Page layout](page-layout.md)).
- A value equal to the style's is stored as none of the paragraph's own, as alignment is.
- Share roles: an Editor sets spacing and keep rules; a Participant and a Viewer see none of the items or controls.

## Tab stops

- **A tab stop** is a position on a paragraph's line, with an alignment and a leader. Positions count from the
  text area's start (the left margin), as Word and Google count them, so moving an indent never moves a stop.
- **Alignment**: Left (the text after the tab starts at the stop), Centre (centred on it), Right (ends at it) and
  Decimal (its first `.` or `,` sits on it). Google offers Left, Centre and Right; Decimal arrives in files and is
  drawn and kept. **Leader**: none, dots, hyphens, an underline or middle dots, filling the tab's space.
- **A tab goes to the next stop past where it starts**: the paragraph's own stops (or its style's), the first one
  past it; past the last, the default stops, every 0.5 in from the text area's start (the document's own interval
  where its file names one). On a hanging indent's first line, a tab before the indent goes to the indent, as both
  suites draw it (default). A Centre, Right or Decimal stop whose text would start before the tab gives no space.
- **A paragraph's own stops replace its style's whole**, as its borders do; none of its own means its style's; an
  empty list of its own means none at all. A list equal to its style's is stored as none of the paragraph's own.
- **Made on the ruler** ([Editing surface](editing-surface.md#the-ruler)), on every paragraph the selection touches:
  added, moved and taken away, each one undo step. Clear formatting takes a paragraph's own stops away.
- At most 64 stops in a paragraph (`TAB_STOPS_MAX`, Word's most), each from -22 in to 22 in (`TAB_STOP_MAX_PT`,
  1,584 pt, Word's range); a file's stops past either are dropped and listed in the import report.
- Share roles: an Editor makes and moves stops; every role sees the writing drawn at them.

## Borders and shading

**Borders and shading** (Format > Paragraph styles > Borders and shading, first in that submenu as in Google's) is a
dialog for the paragraphs the selection touches:

- **Position**: Top, Bottom, Left, Right and Between, each a toggle button; all five are pressed when it opens
  (default). Width, dash and colour apply to the pressed positions only.
- **Border width**: 0 pt, 1 pt, 2 pt, 3 pt, 4 pt, 6 pt (default: Google's list as known, assumed); 0 pt takes the
  border away. **Border dash**: Solid, Dotted, Dashed. **Border colour** and **Background colour** through the one
  [colour picker](../004-interface-design/colour-picker.md), as text colour is.
- **Paragraph padding**: the space between a border and the text, 0 to 72 pt (default), on every side with a border.
- Each field shows the value the paragraphs share over the pressed positions, blank where they differ (or have no
  border there); a blank field changes nothing.
- **Reset** sets the dialog to no borders, no background and no padding; **Apply** sets the paragraphs as one undo
  step and returns focus to the writing; **Cancel** and Escape change nothing.
- **Between** draws a line between adjacent paragraphs that share their borders. An OpenDocument file has no such
  line, so in an `.odt` text document Between is drawn dimmed, its tooltip "OpenDocument files have no line between
  paragraphs" (default).
- **Drawn as both formats do**: adjacent paragraphs with the same borders, padding and background share one box: the
  upper one has no bottom border (Between's line instead, where set), the lower one no top border, and the space
  between them lies inside the box.
- A paragraph's own borders and background replace its style's whole; Reset takes away its own, so its style's
  show (default). Clear formatting takes them away too.
- Share roles: an Editor only; a Participant and a Viewer see no item.

## Paint format

- **The formatting clipboard** holds one formatting: the text formatting where the selection starts (its own over
  its styles, as the run holds it) and its paragraph's style and own paragraph formatting. Each surface holds its own,
  for as long as it is open (default).
- **Copy text formatting** (⌘⌥C) puts the selection's formatting on the formatting clipboard; it changes nothing.
- **Paste text formatting** (⌘⌥V) applies the formatting clipboard to the selection: every paragraph it touches takes
  the paragraph style and paragraph formatting, and its text takes the text formatting in place of its own; with
  nothing selected, the caret's paragraph and the next characters typed take it. Links, comments and kept content stay.
  One undo step; with nothing copied it does nothing.
- **The paint roller** (the toolbar's Paint format) copies the selection's formatting and stays pressed: the next
  selection made with the pointer takes it, as Paste text formatting, and the roller lets go. A double-click on the
  roller keeps it pressed until it is pressed again or Escape is pressed in the writing, applying to every selection
  made with the pointer meanwhile. A press with no drag applies nothing (default). While it is pressed, the pointer
  over the writing is a paint roller.
- Share roles: an Editor paints and pastes formatting; Copy text formatting changes nothing, yet is bound with them,
  so a Participant and a Viewer have none of the three (default).

## Clear formatting

**Clear formatting** (⌘\, and Ctrl+Space on a PC; Format > Clear formatting; the toolbar; the context menu) removes
the selection's own text formatting (font, size, toggles, colours, its character style and the file's own run
formatting), so it draws in its paragraph style. The paragraphs it touches lose their own paragraph formatting
(alignment, indents, spacing, keep rules) too, back to their style's (default, as Google's does, inferred); they keep
their paragraph style and list, and the text keeps its links, comments and kept content. With nothing selected, the
caret's paragraph is cleared and the next characters typed take no formatting of their own. One undo step; focus
returns to the writing. Share roles: an Editor only.

## Non-printing characters

- **View > Show non-printing characters** (⌘⇧P, Ctrl+Shift+P elsewhere) shows what the writing holds but never prints:
  off by default, per person, remembered in this browser (`livedoc:v2:text-document-marks`) (default).
- **Drawn**: ¶ at each paragraph's end, · in the middle of each space (the space keeps its width), → at the start of
  each tab's space, ↵ at each line break, and "Section break" on a section break's line (page and column breaks get
  theirs when they are built, [Page layout](page-layout.md#breaks)).
- In a muted ink for the paper they are on (#5f6368 on white, 6.3:1; #9aa0a6 on dark paper, 6.4:1), never part of the
  text: not selected, copied, printed or read by a screen reader.
- Telemetry: `UI · Toggled · TextDocumentNonPrinting`.

## Typing aids

Tools > Preferences, per person (account or browser), each on by default as Google has them:

- Automatically capitalise words; use smart quotes; automatically detect links; automatically detect lists (`1.`,
  `-`, `*` at a paragraph's start); show link details; automatically detect Markdown (off by default); substitutions
  (a list: `(c)` → ©, `(r)` → ®, `-->` → →, `1/2` → ½, … Google's list, editable, each on or off).
- An aid's change is undone by the next ⌘Z, leaving what was typed.

## Share roles

| Role            | May                                                                  |
| --------------- | -------------------------------------------------------------------- |
| **Editor**      | Everything above                                                     |
| **Participant** | Select, copy; in Suggesting mode (D7) type and format as suggestions |
| **Viewer**      | Select, copy (unless the owner turned copying off)                   |

## Telemetry

`Element · Changed · TextDocumentFormat<Name>` (Bold, Italic, Underline, Strikethrough, Superscript, Subscript,
SmallCaps, Size, Lowercase, Uppercase, TitleCase, Font, TextColour, Highlight, Paint (painted or pasted), Clear; from
toolbar, menu or shortcut), `TextDocumentParagraphStyle` (applied, from toolbar, menu or shortcut),
`TextDocumentStyleUpdated` (update to match), `TextDocumentStylesUsed` (Use my default styles),
`TextDocumentStylesReset`, `TextDocumentPaste<Source>` (Document, Html, Markdown, Plain), `TextDocumentAlign`,
`TextDocumentIndent` (a step), `TextDocumentIndentation` (Indentation options), `TextDocumentLineSpacing`,
`TextDocumentParagraphSpace` (add or remove space), `TextDocumentCustomSpacing`, `TextDocumentKeepRule`,
`TextDocumentBordersAndShading`, `TextDocumentTabStop` (added, moved or taken away on the ruler);
`UI · Used · TextDocumentStretches` (a second stretch selected, by keys or pointer), `TextDocumentSelectMatching`;
`UI · Changed · TextDocumentDefaultStyles` (Save as my default styles). Never text.

## Limits

A paragraph holds at most 100,000 characters (`TEXT_DOCUMENT_MAX_PARAGRAPH_CHARS`, (default)); a paste past the
document's character limit is refused whole: "This document is at its 1,020,000-character limit."
