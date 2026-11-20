# Text and paragraphs

**Status: partly built.** Text formatting and colour are built; the rest is specified.

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
- ⌘⌥0 applies Normal text, ⌘⌥1 to ⌘⌥6 the headings.
- **Update to match**: Styles > a style > "Update '<style>' to match" sets the style from the paragraph at the caret,
  re-styling every paragraph of that style.
- A paragraph's own formatting over its style is kept as direct formatting (ODF automatic style, OOXML direct
  properties).

## Default styles

Styles > Options: **Save as my default styles** (stored with the person's account, or in this browser for a guest);
**Use my default styles** (applies them to this document); **Reset styles** (back to Google's defaults).

## Alignment and indents

- Left, centre, right, justified: ⌘⇧L, ⌘⇧E, ⌘⇧R, ⌘⇧J.
- Increase and decrease indent: ⌘] and ⌘[, by 0.5 in (1.27 cm).
- **Indentation options** dialog: left, right (cm or in), special (none, first line, hanging) with its size.

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
`TextDocumentParagraphStyle`, `TextDocumentStyleUpdated`, `TextDocumentPaintFormat`, `TextDocumentPaste` (with the
source: Document, Html, Markdown, Plain). Never text.

## Limits

A paragraph holds at most 100,000 characters (`TEXT_DOCUMENT_MAX_PARAGRAPH_CHARS`, (default)); a paste past the
document's character limit is refused whole: "This document is at its 1,020,000-character limit."
