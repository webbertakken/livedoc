import { describe, expect, it } from 'vitest';
import { EmbeddedFile } from './embedded-file';
import { PDF_NAME_MAX_CHARS, PDF_PROPERTY_MAX_CHARS } from './limits';

const said = { name: 'notes.txt', size: 5, type: 'text/plain', description: 'Meeting notes' };

// security.md "Embedded files"
describe('an embedded file', () => {
  it('is listed with the name, size, type and description the PDF gives', () => {
    expect(EmbeddedFile.of(said)).toEqual({ ...said, runs: false });
  });

  // security.md "Embedded files": which files run is told by the name's ending, never by the type the file names.
  it('is told apart where its name ends as a program, a script, a shortcut or a file with macros does', () => {
    for (const name of [
      'setup.exe',
      'RUN.BAT',
      'a.b.ps1',
      'link.lnk',
      'budget.xlsm',
      'tool.jar',
      'x.command',
    ])
      expect(EmbeddedFile.of({ ...said, name }).runs, name).toBe(true);
    for (const name of ['notes.txt', 'exe', 'report.exe.pdf', 'archive.zip', '', '.', 'jar.'])
      expect(EmbeddedFile.of({ ...said, name }).runs, name).toBe(false);
  });

  it('is told apart whatever type the PDF names, and however its name hides its ending', () => {
    expect(EmbeddedFile.of({ ...said, name: 'photo.exe', type: 'image/png' }).runs).toBe(true);
    // A computer drops the dots and spaces a name ends with.
    expect(EmbeddedFile.of({ ...said, name: 'run.exe. . ' }).runs).toBe(true);
    // The direction marks are gone before the ending is read: the name shows as it is judged.
    const turned = EmbeddedFile.of({ ...said, name: 'invoice\u202Efdp.exe' });
    expect([turned.name, turned.runs]).toEqual(['invoicefdp.exe', true]);
    // A name cut to its limit is judged by the ending it had.
    expect(EmbeddedFile.of({ ...said, name: `${'n'.repeat(400)}.scr` }).runs).toBe(true);
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
