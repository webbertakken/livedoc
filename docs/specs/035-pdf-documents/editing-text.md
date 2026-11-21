# Editing text

**Status: specified.** Nothing is built.

Real editing of a PDF page's own text: the mode Webber asked for beside reading and marking (ruling C2's Editing). A
PDF holds no lines and no paragraphs, only positioned fragments in fonts that are mostly subsets, so this spec says
how fragments become writing a person can edit, and what is written back. Editing is an Editor's
([Editing modes](editing-modes.md)). The research is
[Editing text in place](../../research/pdf-documents/editing-text.md).

## Text boxes

Entering Editing groups each page's text into **text boxes**: lines and paragraphs edited as writing.

- **Where the file's tags cover the page**, its own paragraphs and their order are the boxes.
- **Otherwise by geometry**: fragments on one baseline with word-sized gaps are a line; lines sharing a left edge,
  font and leading are a paragraph; a gutter splits columns; a table's cells are boxes of their own.
- **A person can always correct the grouping**: **Split box** at the caret, **Join boxes** on a selection of two or
  more. A split or a join changes nothing in the file until text is edited.
- Boxes are outlined faintly in Editing, the one under the pointer more strongly, the one holding the caret with
  handles. Leaving Editing shows the page as written.
- **Grouping changes no file.** A box nobody edited is written back as the fragments it came from, untouched.
- Text that is a picture (a scanned page) has no boxes ([Scans](scans.md#editing-a-scans-words)); text in a font that
  maps no characters is a box marked "This text can't be edited as text.", moved and deleted as an object.

## Typing

- **A press in a box places a caret**; typing, deleting and replacing work as in a text field, with selection by
  drag, double press (word), triple press (paragraph), and the usual keys.
- **Reflow inside the box**: a line that grows or shrinks re-breaks the box's lines, keeping its width, alignment,
  leading and first-line indent as measured from the fragments; the box grows or shrinks at its bottom edge.
- **Nothing outside the box moves.** A PDF page does not flow: a box that grows over what is below it shows a warning
  edge and the tooltip "This text now overlaps what is below it.", and is left to the person to move or resize.
- **Typed text takes the look at the caret**: font, size, colour, weight, slant, character spacing and horizontal
  scale of the fragment it joins.
- **Paste** takes plain text in the look at the caret; pasting formatted text keeps bold, italic, size and colour
  where the box's font family has those faces `(default)`.
- **Lists**: a paragraph that starts with a bullet or a number is recognised as a list item; Enter continues the
  list and renumbers the items below it in the same box; ⇥ and ⇧⇥ indent and outdent.
- **Spelling** is the browser's own, on while the caret is in a box, in the language the file gives for the text, or
  the person's; accepted words are the browser's dictionary's.
- **Complex scripts**: new text in a script that needs shaping (Arabic, Indic scripts) or runs right to left is laid
  out by the browser's text engine in a whole font and written as positioned glyphs. Vertical text is edited in
  place glyph by glyph, without reflow `(default)`.

## Formatting

On the toolbar, the Format menu and the context menu, for the selection or the whole box:

| Control                                     | Does                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Font**                                    | The file's own fonts first (each with how many glyphs it holds), then the document fonts          |
| **Size**                                    | 1 to 400 points, by number or steps                                                               |
| **Bold, italic**                            | The family's own face where the file or the document fonts hold it; never a faked slant or stroke |
| **Underline, strikethrough**                | A line drawn as page content                                                                      |
| **Superscript, subscript**                  | Size and baseline shift                                                                           |
| **Colour**                                  | From the one [colour picker](../004-interface-design/colour-picker.md), `strong` tone             |
| **Alignment**                               | Left, centre, right, justified, within the box                                                    |
| **Line spacing**                            | A multiple of the font's own                                                                      |
| **Paragraph spacing**                       | Space before and after, in points                                                                 |
| **Character spacing**, **horizontal scale** | In thousandths and per cent                                                                       |
| **List**                                    | Bulleted, numbered, none                                                                          |

- **Default font** (Settings > PDF documents): the font new text boxes start in, and the one used when a file's font
  cannot take a character and no better match exists; the document fonts' Inter until changed `(default)`.

## Missing glyphs

Most fonts in a PDF are subsets holding only the glyphs the page used. Before anything is written, every typed
character is checked against the font's glyphs; a missing one is never handed to the engine, which would drop or
replace it silently.

1. **The same family from the document fonts**, where LiveDoc serves it: the typed words match their neighbours.
2. **A metric-compatible substitute** from the catalogue's substitution table
   ([Fonts](../004-interface-design/fonts.md)), with the notice "Some characters use Arimo, because Helvetica in this
   file has no glyph for them."
3. **The default font**, with the same notice, when neither exists.

- The run in the new font is its own fragment; the rest of the line keeps the file's font.
- **What is added is subset**: only the glyphs used are embedded, and one subset serves the whole document.
- A font whose licence flags forbid embedding or editing is never embedded; its text is replaced in a document font,
  with the notice saying why.
- A Type 3 font (glyphs as drawings) has no characters to type with: its box is edited only by replacing all of it
  in a document font, asked first.

## Boxes as objects

- **Add** a text box: the Text box tool, a drag for its width, then typing in the default font.
- **Move** by its edge; **resize** by its handles, re-breaking its lines; **rotate** by its handle, snapping at 15°;
  **delete** with the box selected.
- **Copy, cut, paste, duplicate** within and across pages and PDF documents, keeping fonts where the target holds or
  can embed them.
- **Arrange, align, distribute** with other objects ([Objects](objects.md#arranging)).
- A box's text is selectable and found by Find as before; its place in the page's reading order is where the box it
  came from was, or last for a new one.

## Find and replace

- Edit > Find and replace: Find, Replace with, **Match case**, **Whole words**; **Replace**, **Replace all**, and the
  count.
- **Replace all is one undo step** and one live change, across every page; each replacement reflows its box by the
  rules above.
- A replacement needing a glyph its font lacks follows [Missing glyphs](#missing-glyphs); the notice counts them
  once ("14 replacements use Arimo.").
- Text in marks and comments is not replaced; scanned pages are skipped and counted.

## Together

- **A text box someone is typing in is theirs while they type**: others see its text change, outlined in that
  person's colour with their name, and cannot place a caret in it until the caret leaves or
  `PDF_TEXT_BOX_HOLD_MS` passes without a keystroke. Different boxes of one page are edited by different people at
  once.
- A box's edit is one live change per pause in typing: the box's new lines, replacing the fragments it came from.
  Two edits to one box, as when a hold lapses, resolve with the later write winning for that box, the other kept in
  its maker's undo.
- Every edit is attributed in version history, where **Show changes** tints edited boxes in their editors' colours.

## In the file

- An edited box is written as fresh text objects, one a line, with the old fragments removed, in the page's content
  stream regenerated by the engine: **a rewrite** ([Saving](saving.md#addition-or-rewrite)).
- Text is written as text, in its font's own encoding, with a character map so other readers select and search it.
- **A tagged file's structure** keeps its link to the edited text; where the engine cannot keep it, the file's
  PDF/UA claim is removed with a notice ([Accessibility](accessibility.md#what-a-written-file-keeps)).
- A file with certificate signatures is edited only after the warning of
  [Signing](signing.md#changes-after-a-signature).

## Guards

- **Before and after**: the page is drawn before and after an edit; pixels that changed outside the edited box's old
  and new bounds mean the regeneration lost something, so the edit is undone and reported: "This page couldn't be
  edited without changing other parts of it." with **Details**. The tolerance is `PDF_EDIT_GUARD_TOLERANCE`.
- **Read back**: the edited text is extracted again and compared with what was typed; a mismatch undoes the edit
  with the same report.
- Both run in the engine's worker before the change is sent, so a page that does not survive editing is never
  changed for anyone.

## Limits

| Constant                    | Value     | Why                                                                                      |
| --------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| `PDF_TEXT_BOX_MAX_CHARS`    | 50,000    | `(default)` One box; a page of dense text is about 5,000                                 |
| `PDF_TEXT_BOX_HOLD_MS`      | 5,000     | `(default)` A box is held this long after its last keystroke; safe range 2,000 to 30,000 |
| `PDF_EDIT_GUARD_TOLERANCE`  | 0.0001    | `(default)` Share of pixels outside the box that may differ: anti-aliasing noise only    |
| `PDF_REPLACE_ALL_MAX`       | 10,000    | `(default)` Replacements in one Replace all; more asks to narrow the search              |
| `PDF_FONT_SUBSET_MAX_BYTES` | 2,097,152 | `(default)` One embedded subset; a large CJK subset is under a megabyte                  |

## Share roles

| Role            | Page text                                                         |
| --------------- | ----------------------------------------------------------------- |
| **Editor**      | Everything here                                                   |
| **Participant** | Nothing: proposes a change with Replace text or Insert text marks |
| **Viewer**      | Nothing                                                           |

Gated on the session's `can` (`pdfEdits`), and checked by the room on the roots an update touches.

## Keyboard and accessibility

- ⇥ moves between a page's boxes and objects in reading order; Enter enters a box, Escape leaves it; every format has
  a key or a menu item.
- A box is a text field to assistive technology, named by its first words, with its page; its notices (overlap,
  substitute font) are its description and are announced once.
- Split and Join are menu items, not only gestures.

## Telemetry and observability

- `Pdf · Changed · Text.<Typed|Formatted|Moved|Resized|Split|Joined>`, `Pdf · Added · TextBox`,
  `Pdf · Deleted · TextBox`, `Pdf · Changed · ReplaceAll`, `Pdf · Changed · FontSubstituted`. Never text or a font's
  name.
- Fingerprints: `[pdf] boxes source=<tags|geometry> page=<name> count=<n>`, `[pdf] edit-guard failed
reason=<pixels|readback> share=<n>`, `[pdf] glyph-missing count=<n> answered=<family|substitute|default>`,
  `[pdf] font-subset bytes=<n> glyphs=<n>`.

## Errors

| When                          | A person sees                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| The guard fails               | "This page couldn't be edited without changing other parts of it." The edit is undone |
| A font may not be embedded    | "This file's font can't be used for new text. LiveDoc used Arimo instead."            |
| A box is held by someone else | "Ada is editing this text."                                                           |
| Text cannot be edited as text | "This text can't be edited as text. You can move it, delete it or replace it."        |
| The box would pass its limit  | "This text box is full. Start another."                                               |
