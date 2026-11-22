// What a file says of itself, read before any page is drawn (docs/specs/035-pdf-documents/opening.md "What is read":
// pages with their labels, metadata, protection, the form, the structure tree).
import { type PageInfo, type PdfDocumentInfo } from '../engine-contract';
import { PageName } from '../page-name';
import { PdfPermissions } from '../permissions';
import { PDF_NAME_MAX_CHARS, PDF_PROPERTY_MAX_CHARS } from '../limits';
import { FORM_FIELDS, FORM_NONE, type ReaderFile } from './reader-file';

// The reader's count of quarter turns, as degrees; a file that names no quarter turn turns the page by none.
const QUARTER_TURNS: Readonly<Record<number, 90 | 180 | 270>> = { 1: 90, 2: 180, 3: 270 };

export function readPages(file: ReaderFile): PageInfo[] {
  const { p } = file;
  const size = file.alloc(8);
  const pages: PageInfo[] = [];
  // A file that labels its pages labels its first: one read tells whether any page has a label to read.
  const labelled = labelOf(file, 0) !== null;
  for (let index = 0; index < file.count; index += 1) {
    const sized = p.FPDF_GetPageSizeByIndexF(file.doc, index, size);
    pages.push({
      name: PageName.ofObject(p.EPDFDoc_GetPageObjectNumberByIndex(file.doc, index)),
      width: file.side(sized ? file.runtime.getValue(size, 'float') : 0),
      height: file.side(sized ? file.runtime.getValue(size + 4, 'float') : 0),
      rotation: QUARTER_TURNS[p.EPDF_GetPageRotationByIndex(file.doc, index)] ?? 0,
      label: labelled ? labelOf(file, index) : null,
    });
  }
  file.free(size);
  return pages;
}

function labelOf(file: ReaderFile, index: number): string | null {
  const label = file.written(PDF_NAME_MAX_CHARS, (buffer, size) =>
    file.p.FPDF_GetPageLabel(file.doc, index, buffer, size),
  );
  return label === '' ? null : label;
}

function property(file: ReaderFile, tag: string): string {
  return file.written(PDF_PROPERTY_MAX_CHARS, (buffer, size) =>
    file.p.FPDF_GetMetaText(file.doc, tag, buffer, size),
  );
}

function version(file: ReaderFile): string | null {
  const out = file.alloc(4);
  const named = file.p.FPDF_GetFileVersion(file.doc, out);
  const version = file.runtime.getValue(out, 'i32');
  file.free(out);
  // The reader answers 17 for 1.7.
  return named && version >= 10 ? `${Math.floor(version / 10)}.${version % 10}` : null;
}

export function readDocument(file: ReaderFile): PdfDocumentInfo {
  const { p } = file;
  const form = p.FPDF_GetFormType(file.doc);
  return {
    version: version(file),
    encrypted: p.FPDF_GetSecurityHandlerRevision(file.doc) >= 0,
    permissions: PdfPermissions.of(p.FPDF_GetDocPermissions(file.doc)),
    properties: {
      title: property(file, 'Title'),
      author: property(file, 'Author'),
      subject: property(file, 'Subject'),
      keywords: property(file, 'Keywords'),
      creator: property(file, 'Creator'),
      producer: property(file, 'Producer'),
      created: property(file, 'CreationDate'),
      modified: property(file, 'ModDate'),
    },
    tagged: Boolean(p.FPDFCatalog_IsTagged(file.doc)),
    form: form === FORM_NONE ? 'none' : form === FORM_FIELDS ? 'fields' : 'xfa',
    // Counted, never read: no script of a file is evaluated, or handed on as text here (security.md "Scripts").
    scripts: Math.max(p.FPDFDoc_GetJavaScriptActionCount(file.doc), 0),
  };
}
