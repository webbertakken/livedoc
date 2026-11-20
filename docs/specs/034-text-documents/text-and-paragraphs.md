# Text and paragraphs

**Status: partly built.** Text formatting, colour, paragraph styles, default styles, alignment and indents are
built; the rest is specified.

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
- **Move paragraph up and down**: Ctrl⇧↑ / ↓ moves the paragraphs the selection touches past their neighbour.
- **Repeat last action** (⌘Y) repeats the last formatting or insertion at the new selection.

## Selection

- **Select all** (⌘A) selects the current document tab's body; in a header, footer or footnote, that part's text.
- **Select multiple sections of text**: Ctrl⌘⇧← / → (Ctrl+Alt+Shift elsewhere) after a first selection, then the
  arrows to a second; formatting applies to all of them.
- **Select all matching text** (context menu) selects every stretch with the same formatting.
- **Delete** removes the selection.

## Clipboard

- **Copy** puts the selection on the clipboard as HTML (with its formatting and styles), as plain text, and as
  LiveDoc's own model fragment (so a paste between text documents keeps everything, kept content included).
- **Paste** from a text document keeps everything; from a web page or another editor, its headings, lists, tables,
  links, pictures and character formatting are kept and mapped to the nearest paragraph style; from Markdown text, Markdown is read when
  Preferences > Automatically detect Markdown is on, as Google does.
- **Paste without formatting** (⌘⇧V) inserts plain text in the formatting at the caret.
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

- Line spacing: Single, 1.15, 1.5, Double; **Custom spacing** dialog: line spacing (0.06 to 100) and space before and
  after (0 to 1,584 pt).
- Add or remove space before and after a paragraph (12 pt steps, as Google).
- **Keep with next**, **keep lines together**, **prevent single lines** (widows and orphans, on by default).

## Borders and shading

Format > Paragraph styles > Borders and shading: borders on each side (colour, width 0 to 6 pt, dash), padding,
background colour; **Reset**. Adjacent paragraphs with the same borders share one box, as in both formats.

## Paint format

The paint roller copies the selection's formatting (text and paragraph) and applies it once to the next selection;
a double-click keeps it on until pressed again or Escape. ⌘⌥C and ⌘⌥V copy and paste formatting.

## Clear formatting

⌘\ (and Ctrl+Space on PC) removes direct text formatting from the selection, leaving the paragraph style, links and
comments.

## Non-printing characters

View > Show non-printing characters: ¶ at each paragraph's end, · for spaces, → for tabs, ↵ for line breaks, and
"Page break", "Section break" labels at breaks. Per person.

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
SmallCaps, Size, Lowercase, Uppercase, TitleCase, Font, TextColour, Highlight; from toolbar, menu or shortcut),
`TextDocumentParagraphStyle` (applied, from toolbar, menu or shortcut), `TextDocumentStyleUpdated` (update to match),
`TextDocumentStylesUsed` (Use my default styles), `TextDocumentStylesReset`, `TextDocumentPaintFormat`,
`TextDocumentPaste` (with the source: Document, Html, Markdown, Plain), `TextDocumentAlign`, `TextDocumentIndent` (a step),
`TextDocumentIndentation` (Indentation options); `UI · Changed · TextDocumentDefaultStyles`
(Save as my default styles). Never text.

## Limits

A paragraph holds at most 100,000 characters (`TEXT_DOCUMENT_MAX_PARAGRAPH_CHARS`, (default)); a paste past the
document's character limit is refused whole: "This document is at its 1,020,000-character limit."
