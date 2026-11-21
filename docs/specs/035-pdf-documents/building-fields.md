# Building fields

**Status: specified.** Nothing is built.

Adding and changing a PDF's [fields](fields.md): every field type, its properties, tab order and calculations. It is
Editing's ([Editing modes](editing-modes.md)), an Editor's; filling is Reviewing's. No script is ever written or run:
formats and calculations are the recognised functions of [Fields](fields.md#formats-and-calculations) (fork F11).
The research is [Fields](../../research/pdf-documents/fields.md).

## The field tools

**Tools > Prepare fields** (or Insert > Field) puts the surface in field building: every field shows as a named box,
the toolbar shows the field tools, and the Fields panel lists them in tab order.

| Tool                | Makes                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------- |
| **Text field**      | One line, or multi-line; comb; password                                                  |
| **Date field**      | A text field with a date format                                                          |
| **Tick box**        | A check box with its on value and its glyph (tick, cross, circle, square, diamond, star) |
| **Radio button**    | One button of a group; buttons sharing a group name are one field                        |
| **Dropdown**        | Options, each with a shown name and a stored value; may allow typing                     |
| **List**            | Options; may allow several                                                               |
| **Picture field**   | A button that takes a picture                                                            |
| **Button**          | A push button with a label: **Reset fields** or **Go to a page**; no other action        |
| **Signature field** | An empty place to sign ([Signing](signing.md))                                           |

- A field is drawn by a drag, or placed at a default size by a press; ⇧F cycles the tools.
- A new field is named by its type and a number ("Text 3") until renamed; a name is unique unless the person means
  two boxes to be one field, asked when a name is reused: "Use the same field in both places?"
- **Preview** (P) shows the fields as a person filling will meet them, without leaving Editing.
- Barcode fields are left out ([Parity matrix](parity-matrix.md#left-out)).

## Detecting fields

**Detect fields** reads a flat form (a page of lines, boxes and labels with no fields) and proposes a field for each
blank it finds: an underline or a box beside a label becomes a text field named for the label, a small square a tick
box, a row of small circles a radio group.

- Proposals are shown, not made: each is ticked, renamed, retyped or dismissed in a list before **Add fields** makes
  them as one undo step.
- It reads the page's own lines and text ([Fields](fields.md#a-pdf-with-no-fields)); a scanned page needs
  [text recognition](scans.md) first, and says so.
- Nothing is sent anywhere: detection runs in the browser.

## Properties

A selected field's properties show in the side panel, in tabs:

| Tab           | Holds                                                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **General**   | Name; tooltip (the field's accessible name: asked for, and warned about while empty); visible, hidden, visible but not printed, hidden but printed; read-only; required                                                                      |
| **Look**      | Border colour, width and style (solid, dashed, bevelled, inset, underline); fill colour; font, size (or auto), text colour; rotation in quarter turns                                                                                        |
| **Options**   | By type: alignment, default value, multi-line, scrolling, comb of n characters, character limit, password; a tick box's glyph and on value, ticked by default; options of a dropdown or list, sorted or not, typing allowed, several allowed |
| **Format**    | None, Number, Percentage, Date, Time, Special (zip code, phone, an input mask): each with its choices                                                                                                                                        |
| **Validate**  | None, or a value from n to m                                                                                                                                                                                                                 |
| **Calculate** | None; the sum, product, average, minimum or maximum of fields chosen; or a simple formula over field names (`+ - * /` and brackets)                                                                                                          |

- Each choice is written into the file as the standard function call Acrobat's own dialogs write, so Acrobat and
  other readers run it as theirs, and LiveDoc recognises it again
  ([Fields](fields.md#formats-and-calculations)).
- **A field that arrived with a custom script** shows its script as read-only text under "Custom script (not run by
  LiveDoc)" with **Remove script**; it is never edited as code here.
- Several fields selected share the properties they have in common.
- Colours come from the one [colour picker](../004-interface-design/colour-picker.md).

## Arranging fields

- **Move, resize, delete, duplicate, copy and paste** as objects; arrow keys nudge.
- **Align** (left L, right R, top T, bottom B), **centre** (⇧H, ⇧V), **distribute**, **match size** (width, height,
  both), on a selection.
- **Create multiple copies**: a grid of n by m copies of the selected fields with set gaps, each renamed in sequence;
  for a table of fields.
- **Duplicate across pages**: the same field on a page range; each copy the same field (one value everywhere) or its
  own, as chosen.
- Guides and snapping to the page's own lines and to other fields, as [Marks](marks.md#making-a-mark).

## Tab order and calculation order

- **Tab order**: the Fields panel lists fields in order; drag a row to reorder, or choose **Order by rows**, **Order
  by columns** or **Order by structure** for the page. ⇧N shows each field's number on the page.
- **Calculation order**: Fields panel > More > Calculation order lists calculated fields; drag to reorder. A formula
  that reads a field calculated later in the order is flagged.
- Both are the file's own entries, read and written.

## Together and in the file

- A built or changed field is a live change by the field's id
  ([Live editing and storage](live-editing-and-storage.md#the-layout)); two people changing one field, the later
  write wins per property.
- Someone filling a field while it is renamed keeps their value: a value follows its field's id, not its name.
- A deleted field's value is kept in history; deleting a field someone is in tells them "Ada removed this field."
- Built fields are written at a bake as a rewrite `(default)`; each field gets its appearance for its empty and
  filled states, so every reader draws it.
- A file with certificate signatures is changed only after the warning of
  [Signing](signing.md#changes-after-a-signature).
- "Enable filling and saving rights for Reader users" is left out: it needs Adobe's own signing key
  ([Parity matrix](parity-matrix.md#left-out)).

## Limits

| Constant                   | Value  | Why                                                        |
| -------------------------- | ------ | ---------------------------------------------------------- |
| `PDF_MAX_FIELDS`           | 10,000 | `(default)` Fields in one PDF ([Fields](fields.md#limits)) |
| `PDF_FIELD_NAME_MAX_CHARS` | 255    | `(default)` A field's full name                            |
| `PDF_FIELD_OPTIONS_MAX`    | 5,000  | `(default)` Options of one dropdown or list                |
| `PDF_FORMULA_MAX_CHARS`    | 2,000  | `(default)` A simple formula                               |
| `PDF_FIELD_COPIES_MAX`     | 1,000  | `(default)` Copies one Create multiple copies makes        |

## Share roles

| Role            | Building fields                      |
| --------------- | ------------------------------------ |
| **Editor**      | Everything here                      |
| **Participant** | Nothing; fills ([Fields](fields.md)) |
| **Viewer**      | Nothing                              |

## Keyboard and accessibility

- Fields are reached by ⇥ in tab order while building; arrow keys move one, ⌥ with arrows resizes; the align keys
  apply while building only ([Keyboard shortcuts](keyboard-shortcuts.md#building-fields)).
- The builder asks for each field's tooltip, since it becomes the field's accessible name for everyone who fills it
  after; "12 fields have no tooltip" stands in the Fields panel until answered.
- A field's box, in building, is named with its type and name; reorder in the panel has **Move up** and **Move
  down** beside dragging.

## Telemetry and observability

- `Pdf · Added · Field.<Type>`, `Pdf · Changed · FieldProperty.<General|Look|Options|Format|Validate|Calculate>`,
  `Pdf · Deleted · Field`, `Pdf · Reordered · <TabOrder|CalculationOrder>`, `Pdf · Used · DetectFields`,
  `Pdf · Removed · FieldScript`. Never a field's name, an option or a formula.
- Fingerprints: `[pdf] fields-detected proposed=<n> added=<n>`, `[pdf] field-refused reason=<name|limit|formula>`.

## Errors

| When                                   | A person sees                                                           |
| -------------------------------------- | ----------------------------------------------------------------------- |
| A formula names a field that is absent | "There is no field called 'totl'." beside the formula                   |
| A formula cannot be read               | "Use field names, numbers and + - * / ( )."                             |
| A calculation reads itself             | "This calculation uses its own field."                                  |
| A name is already used by another type | "'Total' is already a tick box. Choose another name."                   |
| Detect fields finds nothing            | "No blanks were found on these pages. Add fields with the tools above." |
