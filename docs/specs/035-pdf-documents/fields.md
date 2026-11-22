# Fields

**Status: specified; a first slice is built.** Built: the engine reads a page's fields as the file holds them: each
place a field shows, with its full name, type, value, options, label and what the file says of it (read-only,
required, hidden, multi-line, password, several choices, a value of one's own); a field value held in the live
changes; and a bake that writes each value into its field with its appearance, as an addition. Filling on the
surface, the fields panel, formats and everything a person sees are not built.

A PDF's **fields** are the inputs it carries: text fields, tick boxes, radio groups, dropdowns, lists, buttons and
signature fields. Filling them is Reviewing's ([Editing modes](editing-modes.md)); adding and changing them is
Editing's ([Building fields](building-fields.md)). "Form" in LiveDoc is a Form tab ([Forms](../030-forms/forms.md)),
so a PDF's are always its fields. The research is [Fields](../../research/pdf-documents/fields.md).

## What a file's fields are

| Field type          | Filled by                                                                                                    | In the file                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **Text**            | Typing one line; a **multi-line** one wraps and takes Enter                                                  | A text field                        |
| **Comb**            | Typing one character a box, to its length                                                                    | A text field with the comb flag     |
| **Password**        | Typing; shown as dots; never kept in history, search text or logs                                            | A text field with the password flag |
| **Date**            | Typing, or a date picker where its format is a date                                                          | A text field with a date format     |
| **Tick box**        | Pressing; on or off                                                                                          | A button field, check box           |
| **Radio group**     | Pressing one of its buttons; one at most is on                                                               | A button field, radio               |
| **Dropdown**        | Choosing one option; typing a value of one's own where the field allows                                      | A choice field, combo               |
| **List**            | Choosing one option, or several where the field allows                                                       | A choice field, list                |
| **Picture**         | Choosing a picture, placed in the field's box                                                                | A button field with an icon         |
| **Button**          | Nothing: its action is listed, never run, but a reset or a go-to ([Security](security.md#links-and-actions)) | A push button                       |
| **Signature field** | Signing ([Signing](signing.md))                                                                              | A signature field                   |

- A field may show in several places (its **widgets**); filling one fills them all.
- A field is named by its **full name** in the file's field tree ("applicant.address.city"); two fields with one
  full name are one field.
- Read-only and hidden fields are as the file says: a read-only field shows its value and takes none; a hidden one
  is not shown.
- **A password field's value is never read out of the file** `(default)`: the engine answers it empty, so it reaches
  no screen, history, search text or log; a file that stores one keeps it untouched.
- A field of a type LiveDoc does not know is shown as the file drew it, takes no value and is not listed.
- A barcode field is shown as the file drew it and takes no value ([Parity matrix](parity-matrix.md#left-out)).

## Filling

- **In Reviewing a field is a real control** over its place on the page, with the file's own font, size, colour and
  alignment as far as the browser can match them; leaving it draws the value into the page as the file's appearance
  will have it.
- **Writing direction** is taken from what is typed: a value whose first strong character is of a right-to-left
  script is laid out right to left, and digits are written as typed `(default)`; there is no direction or digit
  setting.
- **Highlight fields** (on by default in Reviewing) tints every fillable field and outlines required ones; a required
  field left empty is listed in the Fields panel under "Still to fill".
- **Tab order** is the file's: its declared order, else row order, else column order, as the page says; ⇥ and ⇧⇥ move
  through it across pages, scrolling to each.
- **A value is checked as it is left**: its length, its options, its format and its validation
  ([Formats and calculations](#formats-and-calculations)); a value refused stays in the field, outlined, with the
  reason beside it, and is not sent.
- **A value is sent when the field is left**, or after `PDF_FIELD_IDLE_MS` without typing, as one undo step; others
  see it then, and see who is in the field meanwhile by their colour on its outline.
- **Clear all fields** (Tools > Fill in) empties every field the person may fill, as one undo step, asked first.
- **Remembered entries**: off until a person turns it on in Settings, as Acrobat's is. On, what that person types
  into text fields is kept in this browser only and offered on a field of the same name later; numbers are kept only
  where they also tick "Remember numbers"; **Forget all entries** empties it. Nothing is offered from another
  person's values, and a password field is never remembered.
- A field a certificate signature locked takes no value: "This field was locked when the PDF was signed."
  ([Signing](signing.md#changes-after-a-signature))

## Together

- A field value is a live change by the field's full name: two people filling two fields both land; two filling one,
  the later write wins, as a spreadsheet's cell.
- **Who filled what** is the change's author, kept in LiveDoc's history and shown in the Fields panel ("Filled by
  Ada, 14:02"); the file has no place for it.
- Calculated fields are recalculated by each client from the same values with the same functions, so everyone shows
  the same total; the calculated value is written at the bake.

## Formats and calculations

Fork F11 `(default)`: **no script from a file ever runs.** A form's behaviour is usually written by Acrobat's own
dialogs as calls to named functions with literal arguments. LiveDoc recognises those calls **as text** and answers
them with its own functions of the same names:

| Recognised                                                         | Does                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `AFNumber_Format`, `AFNumber_Keystroke`                            | Number: decimals, separator style, negative style, currency symbol and its side |
| `AFPercent_Format`, `AFPercent_Keystroke`                          | Percentage                                                                      |
| `AFDate_FormatEx`, `AFDate_KeystrokeEx`                            | Date in the pattern given (`dd/mm/yyyy`, `mmm d, yyyy`, …)                      |
| `AFTime_Format`, `AFTime_FormatEx`, `AFTime_Keystroke`             | Time                                                                            |
| `AFSpecial_Format`, `AFSpecial_Keystroke`, `AFSpecial_KeystrokeEx` | Zip code, Zip+4, phone number, social security number, an input mask            |
| `AFRange_Validate`                                                 | A value at least and at most the numbers given                                  |
| `AFSimple_Calculate`                                               | Sum, product, average, minimum or maximum of the named fields                   |
| A simplified field notation calculation                            | `+`, `-`, `*`, `/` and brackets over field names and numbers                    |

- The call and its arguments are **parsed, never evaluated**: a script is matched against these shapes exactly, with
  literal arguments only. Anything else is not understood.
- **A field whose script is not understood** is fillable and unformatted, with a small mark and the tooltip "This
  field has a custom script, which LiveDoc doesn't run."; the Fields panel counts them, and File > Properties >
  Security lists them.
- **Calculation order** is the file's own; a calculation naming a field that is absent yields nothing and is logged.
- LiveDoc's functions follow Acrobat's results for the same arguments, proven by a table of cases per function;
  dates and numbers are formatted as the format says, never by the person's locale.
- Scripts stay in the file as text, written back untouched.

## XFA

- A file may carry an XFA form beside an AcroForm, or instead of one. LiveDoc **shows its static pages**, with the
  notice "This form was made with XFA, an older form technology. LiveDoc shows its static pages."
- Fields of an AcroForm beside the XFA are filled as any other. The XFA data is kept untouched, and removed only
  when it would contradict a changed field value, said before the first such change: "Filling this form removes its
  XFA data, so other readers show what you filled in."
- A file that is only XFA, whose pages say to open it elsewhere, shows those pages and the same notice; it is not
  refused.

## A PDF with no fields

A scanned or flat form has nothing to fill. Reviewing offers the **fill marks** instead:

- **Text** typed where a press lands, in a face and size that match the nearest text on the page, snapped to the
  page's own lines and boxes; **comb spacing** by dragging the text's right handle so letters fall into boxes.
- **Tick**, **Cross**, **Dot**, **Circle** and **Line**, placed by a press, sized to the box they land in.
- Each is a mark ([Marks](marks.md#kinds)): live, undoable, written as an addition, and changeable until flattened.
- The notice "This PDF has no fields. Use Text and Tick to fill it in." shows once per document when the Fill in
  tool is first taken on such a file.
- **Detecting fields** on a flat form and turning them into real fields is Editing's
  ([Building fields](building-fields.md#detecting-fields)).

## Field data

- **Export field data** (Tools > Fill in, File > Download > Field data) writes every field's name and value as FDF
  or XFDF; **Import field data** reads one onto this PDF: values for fields this PDF has are set as one undo step,
  the rest are listed and skipped.
- Both formats are small text formats LiveDoc reads and writes itself; an imported file is untrusted input, parsed
  as data and never as script.
- **Flatten fields** writes each field's appearance into the page content and removes the fields: an Editor's tool,
  a rewrite ([Document tools](document-tools.md#flattening)).
- **Submitting** a form to an address a file names is never performed ([Security](security.md#links-and-actions));
  field data leaves by export, by sharing the document, or by downloading the filled PDF.
- Collecting many people's answers is a Form tab's work ([Forms](../030-forms/forms.md)), not a PDF's.

## In the file

- A bake writes each changed value into its field and **regenerates its appearance** in the field's own font, as an
  addition: a filled text field adds under a kilobyte ([Saving](saving.md#addition-or-rewrite)).
- A value the field's font has no glyph for is drawn with a substitute and said so
  ([Editing text](editing-text.md#missing-glyphs)).
- **A value the file's field does not take is not written**: the field is not in the stored file, is read-only, is a
  signature field or a button, or the value is none of its options. It is counted in the bake's answer and stays in
  the live changes.
- A tick box is turned off by the value `Off` and on by any other; a list that takes several is given the options
  chosen.
- The form's "need appearances" flag is never relied on: every value LiveDoc writes has its appearance, so every
  reader shows it.

## Limits

| Constant                    | Value     | Why                                                                                               |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `PDF_FIELD_VALUE_MAX_CHARS` | 100,000   | `(default)` One value, unless the field's own maximum is smaller                                  |
| `PDF_FIELD_IDLE_MS`         | 1,000     | `(default)` Typing rests this long before a value is sent; safe range 300 to 3,000                |
| `PDF_MAX_FIELDS`            | 10,000    | `(default)` Fields read from one file, and places read on one page; more are shown and not listed |
| `PDF_FIELD_DATA_MAX_BYTES`  | 8,000,000 | `(default)` An imported FDF or XFDF file; the api's body cap                                      |

## Share roles

| Role            | Fields                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| **Editor**      | Fills, clears, imports and exports field data; builds and flattens fields       |
| **Participant** | Fills, clears their own values, imports and exports field data (F7, ruled)      |
| **Viewer**      | Sees values; fills nothing; exports field data unless downloading is turned off |

## Keyboard and accessibility

- Fields are real controls with the field's name, its tooltip as description, and its required, read-only and
  invalid states; a radio group is a group; a refused value's reason is tied to its field and announced.
- The keys are [Keyboard shortcuts](keyboard-shortcuts.md#fields); a date picker is the shell's, operable by keys.
- Highlight fields' tint meets 3:1 against the page in both paper and Dark pages; required is said, not only
  outlined.

## Telemetry and observability

- `Pdf · Changed · Field.<Type>` when a value is sent, `Pdf · Cleared · Fields`, `Pdf · Imported · FieldData`,
  `Pdf · Exported · FieldData`, `Pdf · Toggled · <FieldHighlightOn|FieldHighlightOff>`,
  `Pdf · Opened · Fields.<AcroForm|Xfa|None>` once per open. Never a field's name or value.
- Fingerprints: `[pdf] fields-read count=<n> scripted=<n> understood=<n> xfa=<bool>`,
  `[pdf] field-refused reason=<format|validate|length|option|locked|read-only>`,
  `[pdf] calculation-skipped reason=<reason>`.

## Errors

| When                                  | A person sees                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| A value fails its format              | Beside the field: "Enter a date like 21/11/2026." (the format's own example) |
| A value fails its range               | "Enter a number from 1 to 100."                                              |
| A value is too long                   | "This field holds at most 20 characters."                                    |
| An import names fields this PDF lacks | "18 values imported. 4 were for fields this PDF doesn't have."               |
| A field is locked by a signature      | "This field was locked when the PDF was signed."                             |
