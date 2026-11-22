// Whether bytes are a PDF (docs/specs/035-pdf-documents/pdf-document.md "What becomes a PDF document"): `%PDF-` is
// found in their first PDF_SNIFF_BYTES, as readers look for it; the name's extension decides nothing.
import { PDF_SNIFF_BYTES } from './limits';

const MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];

export function isPdfBytes(bytes: Uint8Array): boolean {
  const last = Math.min(bytes.length, PDF_SNIFF_BYTES) - MAGIC.length;
  for (let at = 0; at <= last; at += 1)
    if (MAGIC.every((byte, offset) => bytes[at + offset] === byte)) return true;
  return false;
}
