# Fields

A PDF's interactive form: what its fields are, how they are filled together, and what stands in for the scripts a
form may carry (fork F11). "Form" in LiveDoc is a Form tab ([Forms](../../specs/030-forms/forms.md)), so a PDF's are
its **fields**. Researched November 2026.

## What a file holds

| Part                   | Is                                                                                                            | Verified by                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **AcroForm**           | The document's field tree: each field a name, a type, a value, flags                                          | The corpus's `fields` group; LibPDF lists fields by full name and type |
| **Field types**        | Text (single line, multi-line, comb, password), tick box, radio group, dropdown, list, push button, signature | The engine's types (`FPDFAnnot_GetFormFieldType`)                      |
| **Widgets**            | Where a field shows on a page; one field may have several                                                     | The engine reads each page's widgets                                   |
| **Appearance streams** | The drawing of a field's current value; a reader shows this, not the value                                    | A filled field must have its appearance rewritten                      |
| **Actions**            | JavaScript for keystroke, format, validate and calculate; a calculation order                                 | The engine lists them without running them                             |
| **XFA**                | A second, XML form definition some files carry beside or instead of AcroForm                                  | The corpus's `xfa` group                                               |

## Filling together

- A value is a change in the layer, by field name: two people filling two fields both land; two filling one field,
  the later write wins, as a spreadsheet cell does ([The live model](live-model.md)).
- Who filled what is the change's author; the file itself has no place for it, so it lives in LiveDoc's history.
- Baking writes each value and regenerates its appearance, as one incremental update: 842 bytes for a text field
  (verified: LibPDF 0.5.3, valid by `qpdf --check`).
- A field a signature locked (its lock dictionary) refuses a value, with the reason (assumed: ISO 32000-2's
  signature field locks; proven in Phase 11).

## Scripts (fork F11)

A form's behaviour is often JavaScript. Three ways to answer it:

| Design                                     | How                                                                                                                                                                                                                                             | For                                                                      | Against                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **A. Run the file's scripts in a sandbox** | A JavaScript engine in WebAssembly (PDF.js ships QuickJS for this, 187 KB compressed)                                                                                                                                                           | Every form behaves as in Acrobat                                         | Untrusted code runs, sandboxed or not; Acrobat's script API is large and the sandbox must implement it |
| **B. Recognise the standard actions**      | Acrobat writes its built-in formats as calls to named functions (`AFNumber_Format`, `AFDate_FormatEx`, `AFSimple_Calculate`, `AFRange_Validate`, ...); LiveDoc parses the call and its literal arguments and runs its own function of that name | No code from a file ever runs; covers what Acrobat's own dialogs produce | A hand-written script is not understood: its field is fillable, unformatted, with a notice             |
| **C. Ignore scripts**                      | Values only                                                                                                                                                                                                                                     | Simplest                                                                 | Dates, currency and totals stop working                                                                |

- Recommended: **B**, as the plan's default has it. A script is matched as text against the known calls; anything
  else is never evaluated.
- Evidence still owed: how much of real forms B covers. The corpus's forms with scripts are test files; a count on
  real government and bank forms (Webber's own, [The corpus and the validators](corpus-and-validators.md)) is taken
  before F11 is asked in Phase 10.

## XFA

- Deprecated in PDF 2.0 (assumed). A file may carry XFA beside an AcroForm ("static" XFA) or instead of one
  ("dynamic" XFA, whose pages are a placeholder saying to open it in Acrobat).
- PDFium's public build and PDF.js with XFA off both show the fallback pages (inferred: the corpus's XFA files draw
  alike in both). PDF.js can lay dynamic XFA out as HTML (`enableXfa`), which nothing here would write back.
- Recommended, as the default has it: the static fallback with a notice ("This form was made with XFA, an older
  form technology. LiveDoc shows its static pages."); an AcroForm beside it is filled as any other; the XFA data is
  kept untouched, and removed only when it would contradict a changed AcroForm value (as Acrobat does: assumed).

## Flattening and field data

- **Flatten** bakes every field's appearance into the page and removes the fields: a rewrite (the engine has
  `FPDFPage_Flatten`; LibPDF flattens too: verified in both interfaces).
- **Field data** travels as FDF and XFDF (assumed: ISO 32000-2 and ISO 19444-1); both are small text formats LiveDoc
  reads and writes itself.

## Filling a file with no fields

A scanned or flat form has no fields. Fill and Sign in Acrobat places text, ticks and crosses on the page. In LiveDoc
those are marks (free text and stamps), snapped to the page's own lines and boxes, which the engine reports as path
objects with bounds (verified: object types and `FPDFPageObj_GetBounds`).
