// A text document imported from a file of another type (docs/specs/034-text-documents/files-and-print.md "Opening"):
// read under the document's limits into a new ODF text document, with its import report, as an opened file is.
import { refuse } from '@livedoc/office-packages';
import type { TextDocumentImportType } from '../file-types';
import type { ReadLimits, TextDocumentRead } from '../files';
import { TEXT_DOCUMENT_MAX_CHARS } from '../limits';
import { TextDocument } from '../model/text-document';
import { ReportBuilder } from '../report';
import { decodeText } from './decode-text';
import { readMarkdownImport } from './markdown';
import { readPlainTextImport } from './plain-text';

export function readTextDocumentImport(
  file: Uint8Array,
  type: TextDocumentImportType,
  limits: Pick<ReadLimits, 'maxChars'> = {},
): TextDocumentRead {
  const decoded = decodeText(file);
  if (!decoded.ok) return decoded;
  const maxChars = limits.maxChars ?? TEXT_DOCUMENT_MAX_CHARS;
  // Markup only shrinks what is read, so text past the limit is refused before it is parsed.
  if (decoded.text.length > maxChars * 2) return refuse('document_too_large');
  const report = new ReportBuilder();
  const document =
    type === 'md' ? readMarkdownImport(decoded.text, report) : readPlainTextImport(decoded.text);
  if (TextDocument.characters(document) > maxChars) return refuse('document_too_large');
  return { ok: true, document, report: report.build(), fileType: 'odt' };
}
