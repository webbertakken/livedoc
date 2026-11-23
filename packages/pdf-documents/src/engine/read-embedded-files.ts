// The files a PDF carries inside it (docs/specs/035-pdf-documents/security.md "Embedded files"): listed by what the
// PDF says of each, none decoded, none opened; one read out only when a person asks to save or open it.
import type { EmbeddedFileRead } from '../engine-contract';
import { EmbeddedFile, type EmbeddedFiles } from '../embedded-file';
import {
  PDF_EMBEDDED_FILE_MAX_BYTES,
  PDF_EMBEDDED_FILES_MAX,
  PDF_NAME_MAX_CHARS,
  PDF_PROPERTY_MAX_CHARS,
} from '../limits';
import type { ReaderFile } from './reader-file';

/** The files the PDF carries inside it, at most `most`: listed by what the PDF says of each, none decoded. */
export function readEmbeddedFiles(file: ReaderFile, most = PDF_EMBEDDED_FILES_MAX): EmbeddedFiles {
  const { p } = file;
  const files: EmbeddedFile[] = [];
  if (!file.doc) return { files, cut: false };
  const count = Math.max(p.FPDFDoc_GetAttachmentCount(file.doc), 0);
  if (count > most) file.clamped('list');
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

/** The attachment listed at `at` in readEmbeddedFiles' list: the at-th the reader answers, as the list skips none. */
function attachmentAt(file: ReaderFile, at: number): number {
  const { p } = file;
  if (!file.doc || !Number.isInteger(at) || at < 0) return 0;
  const count = Math.min(
    Math.max(p.FPDFDoc_GetAttachmentCount(file.doc), 0),
    PDF_EMBEDDED_FILES_MAX,
  );
  let listed = -1;
  for (let n = 0; n < count; n += 1) {
    const attachment = p.FPDFDoc_GetAttachment(file.doc, n);
    if (attachment && (listed += 1) === at) return attachment;
  }
  return 0;
}

/**
 * An embedded file's bytes, by its place in the list (reading-surface.md "Embedded files"): refused unread where the
 * PDF says it is past `most`, and refused where it reads past `most`.
 */
export function readEmbeddedFile(
  file: ReaderFile,
  at: number,
  most = PDF_EMBEDDED_FILE_MAX_BYTES,
): EmbeddedFileRead {
  const { p } = file;
  const attachment = attachmentAt(file, at);
  if (!attachment) return { ok: false, refusal: 'unreadable' };
  const out = file.alloc(4);
  try {
    if (
      p.EPDFAttachment_GetIntegerValue(attachment, 'Size', out) &&
      file.runtime.getValue(out, 'i32') > most
    )
      return { ok: false, refusal: 'too_large' };
    if (!p.FPDFAttachment_GetFile(attachment, 0, 0, out))
      return { ok: false, refusal: 'unreadable' };
    const size = file.runtime.getValue(out, 'i32') >>> 0;
    if (size > most) return { ok: false, refusal: 'too_large' };
    const buffer = file.alloc(Math.max(size, 1));
    try {
      if (!p.FPDFAttachment_GetFile(attachment, buffer, size, out))
        return { ok: false, refusal: 'unreadable' };
      return { ok: true, bytes: file.heap.slice(buffer, buffer + size) };
    } finally {
      file.free(buffer);
    }
  } finally {
    file.free(out);
  }
}
