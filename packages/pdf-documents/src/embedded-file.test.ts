import { describe, expect, it } from 'vitest';
import { EmbeddedFile } from './embedded-file';
import { PDF_NAME_MAX_CHARS, PDF_PROPERTY_MAX_CHARS } from './limits';

const said = { name: 'notes.txt', size: 5, type: 'text/plain', description: 'Meeting notes' };

// security.md "Embedded files"
describe('an embedded file', () => {
  it('is listed with the name, size, type and description the PDF gives', () => {
    expect(EmbeddedFile.of(said)).toEqual(said);
  });

  it('has no path separator, control character or direction mark in its name', () => {
    expect(EmbeddedFile.of({ ...said, name: '../..\\etc/passwd' }).name).toBe('....etcpasswd');
    expect(EmbeddedFile.of({ ...said, name: 'a\u0000b\nc\u0085d' }).name).toBe('abcd');
    expect(EmbeddedFile.of({ ...said, name: 'invoice\u202Efdp.exe' }).name).toBe('invoicefdp.exe');
    expect(EmbeddedFile.of({ ...said, name: '\u2066x\u2069\u200f' }).name).toBe('x');
  });

  it('has a name and a description no longer than a file’s strings may be', () => {
    const long = EmbeddedFile.of({ ...said, name: 'n'.repeat(999), description: 'd'.repeat(9999) });
    expect(long.name).toHaveLength(PDF_NAME_MAX_CHARS);
    expect(long.description).toHaveLength(PDF_PROPERTY_MAX_CHARS);
  });

  it('shows no size where the PDF says none, or one that is no size', () => {
    for (const size of [null, -1, 1.5, Number.NaN, Number.MAX_VALUE])
      expect(EmbeddedFile.of({ ...said, size }).size).toBeNull();
    expect(EmbeddedFile.of({ ...said, size: 0 }).size).toBe(0);
  });

  it('names a type only where the PDF writes one as a type is written', () => {
    expect(EmbeddedFile.of({ ...said, type: ' Application/PDF ' }).type).toBe('application/pdf');
    for (const type of [
      '',
      'plain',
      'text/',
      '<script>/x',
      'text/plain; charset=x',
      `a/${'b'.repeat(200)}`,
    ])
      expect(EmbeddedFile.of({ ...said, type }).type).toBe('');
  });
});
