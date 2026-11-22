// A text file's bytes as text (docs/specs/029-sheets/files-and-print.md "Import", D117): UTF-8 with or without its
// byte order mark, UTF-16 when its byte order mark says so, else, when the bytes are not UTF-8, Windows-1252, the
// encoding Excel writes CSV in on Windows. Web APIs only, so the editor, the api and the CLI read alike.

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252';

const startsWith = (bytes: Uint8Array, mark: readonly number[]) =>
  mark.every((byte, i) => bytes[i] === byte);

/** The text, its byte order mark left out, and the encoding it was read in. */
export function decodeTextFile(bytes: Uint8Array): { text: string; encoding: TextEncodingName } {
  if (startsWith(bytes, [0xff, 0xfe]))
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  if (startsWith(bytes, [0xfe, 0xff]))
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  const body = startsWith(bytes, [0xef, 0xbb, 0xbf]) ? bytes.subarray(3) : bytes;
  try {
    return {
      text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(body),
      encoding: 'utf-8',
    };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}
