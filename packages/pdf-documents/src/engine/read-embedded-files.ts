// The files a PDF carries inside it (docs/specs/035-pdf-documents/security.md "Embedded files"): listed by what the
// PDF says of each, none decoded, none opened.
import { EmbeddedFile, type EmbeddedFiles } from '../embedded-file';
import { PDF_EMBEDDED_FILES_MAX, PDF_NAME_MAX_CHARS, PDF_PROPERTY_MAX_CHARS } from '../limits';
import type { ReaderFile } from './reader-file';

/** The files the PDF carries inside it, at most `most`: listed by what the PDF says of each, none decoded. */
export function readEmbeddedFiles(file: ReaderFile, most = PDF_EMBEDDED_FILES_MAX): EmbeddedFiles {
  const { p } = file;
  const files: EmbeddedFile[] = [];
  if (!file.doc) return { files, cut: false };
  const count = Math.max(p.FPDFDoc_GetAttachmentCount(file.doc), 0);
  const out = file.alloc(4);
  for (let n = 0; n < Math.min(count, most); n += 1) {
    const attachment = p.FPDFDoc_GetAttachment(file.doc, n);
    if (!attachment) continue;
    const sized = p.EPDFAttachment_GetIntegerValue(attachment, 'Size', out);
    files.push(
      EmbeddedFile.of({
        name: file.written(PDF_PROPERTY_MAX_CHARS, (buffer, size) =>
          p.FPDFAttachment_GetName(attachment, buffer, size),
        ),
        size: sized ? file.runtime.getValue(out, 'i32') : null,
        type: file.written(PDF_NAME_MAX_CHARS, (buffer, size) =>
          p.FPDFAttachment_GetSubtype(attachment, buffer, size),
        ),
        description: file.written(PDF_PROPERTY_MAX_CHARS, (buffer, size) =>
          p.EPDFAttachment_GetDescription(attachment, buffer, size),
        ),
      }),
    );
  }
  file.free(out);
  return { files, cut: count > most };
}
