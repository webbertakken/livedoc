// docs/specs/029-sheets/files-and-print.md "Import", D117: a text file read as UTF-8, UTF-16 by its byte order mark,
// else Windows-1252.
import { describe, expect, it } from 'vitest';
import { decodeTextFile } from './text-decoding';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('decodeTextFile', () => {
  it('reads UTF-8, its byte order mark left out', () => {
    expect(decodeTextFile(new TextEncoder().encode('Café;3,50'))).toEqual({
      text: 'Café;3,50',
      encoding: 'utf-8',
    });
    expect(decodeTextFile(bytes(0xef, 0xbb, 0xbf, 0x61))).toEqual({ text: 'a', encoding: 'utf-8' });
  });

  it('reads UTF-16 by its byte order mark, either way round', () => {
    expect(decodeTextFile(bytes(0xff, 0xfe, 0x61, 0x00, 0xe9, 0x00))).toEqual({
      text: 'aé',
      encoding: 'utf-16le',
    });
    expect(decodeTextFile(bytes(0xfe, 0xff, 0x00, 0x61))).toEqual({
      text: 'a',
      encoding: 'utf-16be',
    });
  });

  it('reads bytes that are not UTF-8 as Windows-1252', () => {
    // "Café €5" as Excel writes it on Windows.
    expect(decodeTextFile(bytes(0x43, 0x61, 0x66, 0xe9, 0x20, 0x80, 0x35))).toEqual({
      text: 'Café €5',
      encoding: 'windows-1252',
    });
  });
});
