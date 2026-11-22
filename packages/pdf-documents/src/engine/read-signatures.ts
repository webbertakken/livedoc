// The certificate signatures a file holds, as the file says them (docs/specs/035-pdf-documents/signing.md "The
// signatures panel"). Nothing is checked here.
import { type SignatureRead } from '../file-signature';
import {
  PDF_MAX_SIGNATURES,
  PDF_NAME_MAX_CHARS,
  PDF_PROPERTY_MAX_CHARS,
  PDF_SIGNATURE_MAX_BYTES,
} from '../limits';
import type { ReaderFile } from './reader-file';

// A signature's byte range is a start and a length, twice.
const BYTE_RANGE_NUMBERS = 4;
/** A signature as the file holds it, with its bytes where they are few enough to read. */
export type SignatureHeld = { readonly read: SignatureRead; readonly contents: Uint8Array | null };

/**
 * The certificate signatures the file holds, at most `most`, as the file says them; each with its bytes where they
 * are no more than `mostBytes` (signing.md "The signatures panel"). Nothing is checked here.
 */
export function readSignatures(
  file: ReaderFile,
  most = PDF_MAX_SIGNATURES,
  mostBytes = PDF_SIGNATURE_MAX_BYTES,
): SignatureHeld[] {
  const { p } = file;
  const signatures: SignatureHeld[] = [];
  if (!file.doc) return signatures;
  const count = Math.min(p.FPDF_GetSignatureCount(file.doc), most);
  for (let n = 0; n < count; n += 1) {
    const signature = p.FPDF_GetSignatureObject(file.doc, n);
    if (!signature) continue;
    signatures.push({
      read: {
        encoding: file.writtenBytes(PDF_NAME_MAX_CHARS, (buffer, size) =>
          p.FPDFSignatureObj_GetSubFilter(signature, buffer, size),
        ),
        time: file.writtenBytes(PDF_NAME_MAX_CHARS, (buffer, size) =>
          p.FPDFSignatureObj_GetTime(signature, buffer, size),
        ),
        reason: file.written(PDF_PROPERTY_MAX_CHARS, (buffer, size) =>
          p.FPDFSignatureObj_GetReason(signature, buffer, size),
        ),
        byteRange: byteRangeOf(file, signature),
        permission: p.FPDFSignatureObj_GetDocMDPPermission(signature),
      },
      contents: contentsOf(file, signature, mostBytes),
    });
  }
  return signatures;
}

function byteRangeOf(file: ReaderFile, signature: number): number[] {
  const { p } = file;
  // A range of any other length covers nothing that can be said: it is not read.
  if (p.FPDFSignatureObj_GetByteRange(signature, 0, 0) !== BYTE_RANGE_NUMBERS) return [];
  const out = file.alloc(BYTE_RANGE_NUMBERS * 4);
  p.FPDFSignatureObj_GetByteRange(signature, out, BYTE_RANGE_NUMBERS);
  const range = Array.from({ length: BYTE_RANGE_NUMBERS }, (_, at) =>
    file.runtime.getValue(out + at * 4, 'i32'),
  );
  file.free(out);
  return range;
}

function contentsOf(file: ReaderFile, signature: number, most: number): Uint8Array | null {
  const { p } = file;
  const size = p.FPDFSignatureObj_GetContents(signature, 0, 0);
  if (size <= 0 || size > most) return null;
  const buffer = file.alloc(size);
  p.FPDFSignatureObj_GetContents(signature, buffer, size);
  const contents = file.heap.slice(buffer, buffer + size);
  file.free(buffer);
  return contents;
}
