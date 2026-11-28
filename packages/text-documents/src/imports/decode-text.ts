// An imported text file's characters (docs/specs/034-text-documents/files-and-print.md "Opening"): UTF-8 with or without
// a byte order mark; a file that is not UTF-8 read as Windows' Western encoding, which every byte decodes in (default).
// A file holding a NUL byte early on is not text.
import { refuse, type PackageRefusal } from '@livedoc/office-packages';

/** How far into a file a NUL byte says it is not text. */
export const TEXT_SNIFF_BYTES = 8192;

export type DecodedText = { ok: true; text: string } | PackageRefusal;

export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes.subarray(0, TEXT_SNIFF_BYTES).includes(0)) return refuse('package_wrong_type');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  return { ok: true, text: text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n') };
}
