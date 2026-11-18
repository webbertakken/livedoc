// A text document's files (files-and-print.md "Opening" and "Downloading"): any `.odt`, `.ott`, `.fodt`, `.docx`,
// `.dotx` or `.docm` read into the model under the package's guards and the document's limits, with its import report;
// and the model written as the file its format leaves as.
import {
  listZip,
  looksLikeXml,
  oleKind,
  refuse,
  startsWithZip,
  type PackageBudgets,
  type PackageRefusal,
} from '@livedoc/office-packages';
import type { Block, Inline } from './model/blocks';
import { TextDocument } from './model/text-document';
import { KEPT_CONTENT_MAX_BYTES, TEXT_DOCUMENT_MAX_CHARS } from './limits';
import { readOdfFile } from './odf/odf-file';
import { writeOdf } from './odf/odf-write';
import { readOoxmlFile } from './ooxml/ooxml-read';
import { writeOoxml } from './ooxml/ooxml-write';
import { ReportBuilder, type ImportReport } from './report';
import type { TextDocumentFileType } from './file-types';

export type TextDocumentRead =
  | { ok: true; document: TextDocument; report: ImportReport; fileType: TextDocumentFileType }
  | PackageRefusal;

function isOoxml(bytes: Uint8Array<ArrayBuffer>): boolean {
  if (oleKind(bytes)) return true;
  if (!startsWithZip(bytes)) return false;
  const listed = listZip(bytes);
  return listed.ok && listed.entries.some((e) => e.name === '[Content_Types].xml');
}

/** Kept XML past the limit is dropped, block by block and inline by inline, in reading order, and reported. */
function withinKeptLimit(
  document: TextDocument,
  report: ReportBuilder,
  limit: number,
): TextDocument {
  let used = 0;
  const fits = (xml: string) => {
    used += xml.length;
    return used <= limit;
  };
  let dropped = 0;
  const body = document.body.flatMap((block): Block[] => {
    if (block.type === 'kept') {
      if (fits(block.xml.xml)) return [block];
      dropped += 1;
      return [];
    }
    if (block.type !== 'paragraph') return [block];
    const inlines = block.inlines.filter((i: Inline) => {
      if (i.type !== 'kept' || fits(i.xml.xml)) return true;
      dropped += 1;
      return false;
    });
    return [inlines.length === block.inlines.length ? block : { ...block, inlines }];
  });
  if (dropped === 0) return document;
  report.drop('kept-limit', 'kept content', dropped);
  return { ...document, body };
}

export type ReadLimits = { budgets?: PackageBudgets; maxChars?: number; keptBytes?: number };

/** A text document file read into the model, in the format it arrived in. */
export async function readTextDocumentFile(
  file: Uint8Array,
  limits: ReadLimits = {},
): Promise<TextDocumentRead> {
  // The readers view the bytes through their own ArrayBuffer.
  const bytes = new Uint8Array(file);
  const report = new ReportBuilder();
  let document: TextDocument;
  let fileType: TextDocumentFileType;
  if (!looksLikeXml(bytes) && isOoxml(bytes)) {
    const read = await readOoxmlFile(bytes, report, limits.budgets);
    if (!read.ok) return read;
    document = read.document;
    fileType = 'docx';
  } else {
    const read = await readOdfFile(bytes, report, limits.budgets);
    if (!read.ok) return read;
    document = read.document;
    fileType = read.flat ? 'fodt' : 'odt';
  }
  if (TextDocument.characters(document) > (limits.maxChars ?? TEXT_DOCUMENT_MAX_CHARS))
    return refuse('document_too_large');
  document = withinKeptLimit(document, report, limits.keptBytes ?? KEPT_CONTENT_MAX_BYTES);
  return { ok: true, document, report: report.build(), fileType };
}

export type TextDocumentWrite =
  { ok: true; bytes: Uint8Array } | { ok: false; rejection: 'format_not_native' };

/** The text document as a file of its own format: `.odt` or `.fodt` for ODF, `.docx` for OOXML. */
export function writeTextDocumentFile(
  document: TextDocument,
  type: TextDocumentFileType,
  generator = 'LiveDoc',
): TextDocumentWrite {
  const odf = type === 'odt' || type === 'fodt';
  if (odf !== (document.format === 'odf')) return { ok: false, rejection: 'format_not_native' };
  const bytes = odf
    ? writeOdf(document, { flat: type === 'fodt', generator })
    : writeOoxml(document, generator);
  return { ok: true, bytes };
}
