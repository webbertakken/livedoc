// The places on a page where a file's fields show (docs/specs/035-pdf-documents/fields.md "What a file's fields
// are"), each with what the file says of its field.
import { type FieldOption, type PageField, type PdfFieldType } from '../file-field';
import {
  PDF_FIELD_NAME_MAX_CHARS,
  PDF_FIELD_OPTIONS_MAX,
  PDF_FIELD_VALUE_MAX_CHARS,
  PDF_MAX_FIELDS,
  PDF_NAME_MAX_CHARS,
} from '../limits';
import { rectOf } from './read-marks';
import type { ReaderFile } from './reader-file';

// A field's place on a page, by the reader's number for what sits there.
const WIDGET = 20;
// FPDFAnnot_GetFormFieldType's answers LiveDoc knows; every other type is drawn as the file drew it and not listed.
const FIELD_TYPES: Readonly<Record<number, PdfFieldType>> = {
  1: 'button',
  2: 'tick-box',
  3: 'radio',
  4: 'dropdown',
  5: 'list',
  6: 'text',
  7: 'signature',
};
// What the file says of a field, by the standard's bit: read-only, required, multi-line, password, a dropdown that
// takes a value of one's own, a list that takes several.
const FIELD_READ_ONLY = 1 << 0;
const FIELD_REQUIRED = 1 << 1;
const FIELD_MULTILINE = 1 << 12;
const FIELD_PASSWORD = 1 << 13;
const FIELD_OWN_VALUE = 1 << 18;
const FIELD_SEVERAL = 1 << 21;
// What sits on a page is not shown where the file says hidden, or no view.
const NOT_SHOWN = (1 << 1) | (1 << 5);

/** The places on a page where the file's fields show, at most `most` (fields.md "What a file's fields are"). */
export function readFields(
  file: ReaderFile,
  index: number,
  most = PDF_MAX_FIELDS,
): readonly PageField[] {
  const { p } = file;
  const form = file.formOf();
  if (!form) return [];
  return (
    file.withPage(index, (page) => {
      // A tick box's state is the form's own answer, which it has once the page is the form's too.
      p.FORM_OnAfterLoadPage(page, form);
      const fields: PageField[] = [];
      const count = p.FPDFPage_GetAnnotCount(page);
      for (let n = 0; n < count && fields.length < most; n += 1) {
        const annotation = p.FPDFPage_GetAnnot(page, n);
        if (!annotation) continue;
        const type =
          p.FPDFAnnot_GetSubtype(annotation) === WIDGET
            ? FIELD_TYPES[p.FPDFAnnot_GetFormFieldType(form, annotation)]
            : undefined;
        if (type) fields.push(fieldOf(file, form, annotation, type));
        p.FPDFPage_CloseAnnot(annotation);
      }
      p.FORM_OnBeforeClosePage(page, form);
      return fields;
    }) ?? []
  );
}

function fieldOf(
  file: ReaderFile,
  form: number,
  annotation: number,
  type: PdfFieldType,
): PageField {
  const { p } = file;
  const flags = p.FPDFAnnot_GetFormFieldFlags(form, annotation);
  const password = type === 'text' && (flags & FIELD_PASSWORD) !== 0;
  const pressed = type === 'tick-box' || type === 'radio';
  // A password field's value is never read out of the file; a button and a signature field hold no text.
  const valued = !password && type !== 'button' && type !== 'signature';
  return {
    name: file.written(PDF_FIELD_NAME_MAX_CHARS, (buffer, size) =>
      p.FPDFAnnot_GetFormFieldName(form, annotation, buffer, size),
    ),
    type,
    rect: rectOf(file, annotation),
    value: valued
      ? file.written(PDF_FIELD_VALUE_MAX_CHARS, (buffer, size) =>
          p.FPDFAnnot_GetFormFieldValue(form, annotation, buffer, size),
        )
      : '',
    on: pressed ? Boolean(p.FPDFAnnot_IsChecked(form, annotation)) : null,
    onValue: pressed
      ? file.written(PDF_NAME_MAX_CHARS, (buffer, size) =>
          p.FPDFAnnot_GetFormFieldExportValue(form, annotation, buffer, size),
        )
      : '',
    options: type === 'dropdown' || type === 'list' ? optionsOf(file, form, annotation) : [],
    label: file.written(PDF_NAME_MAX_CHARS, (buffer, size) =>
      p.FPDFAnnot_GetFormFieldAlternateName(form, annotation, buffer, size),
    ),
    readOnly: (flags & FIELD_READ_ONLY) !== 0,
    required: (flags & FIELD_REQUIRED) !== 0,
    hidden: (p.FPDFAnnot_GetFlags(annotation) & NOT_SHOWN) !== 0,
    multiline: type === 'text' && (flags & FIELD_MULTILINE) !== 0,
    password,
    severalChoices: type === 'list' && (flags & FIELD_SEVERAL) !== 0,
    ownValue: type === 'dropdown' && (flags & FIELD_OWN_VALUE) !== 0,
  };
}

function optionsOf(file: ReaderFile, form: number, annotation: number): FieldOption[] {
  const { p } = file;
  const count = Math.min(p.FPDFAnnot_GetOptionCount(form, annotation), PDF_FIELD_OPTIONS_MAX);
  const options: FieldOption[] = [];
  for (let n = 0; n < count; n += 1)
    options.push({
      label: file.written(PDF_NAME_MAX_CHARS, (buffer, size) =>
        p.FPDFAnnot_GetOptionLabel(form, annotation, n, buffer, size),
      ),
      chosen: Boolean(p.FPDFAnnot_IsOptionSelected(form, annotation, n)),
    });
  return options;
}
