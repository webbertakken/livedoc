// Every Rich Text download opens in LibreOffice with its words (docs/specs/034-text-documents/files-and-print.md
// "Downloading"): each construct's `.rtf` is converted to text by LibreOffice, and its words are the writing's as the
// Plain Text export reads them. The Plain Text export writes footnotes, pictures and a reference to a note in
// brackets, where Rich Text keeps the picture and the footnote (which LibreOffice's text leaves out), so those are
// left out of the comparison. Needs LibreOffice (`soffice`); run in CI's Office files job by `validate:files`.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writePlainText } from '../exports/plain-text';
import { writeRtf } from '../exports/rtf';
import { CONSTRUCTS } from '../testing/constructs';

const words = (text: string) => text.match(/\p{L}+/gu) ?? [];

/** The writing's words: footnotes (the lines after the writing, `[1] ...`) and anything in brackets left out. */
const writingWords = (plain: string) =>
  words(
    plain
      .split('\n')
      .filter((line) => !/^\[\d+\] /.test(line))
      .join('\n')
      .replace(/\[[^\]\n]*\]/g, ' '),
  );

describe('every Rich Text download opens in LibreOffice', () => {
  it('reads back each construct’s words', () => {
    const dir = mkdtempSync(join(tmpdir(), 'livedoc-rtf-'));
    const names = Object.keys(CONSTRUCTS);
    for (const name of names)
      writeFileSync(join(dir, `${name}.rtf`), writeRtf(CONSTRUCTS[name]!('odf')));
    execFileSync(
      'soffice',
      [
        '--headless',
        '--norestore',
        '--convert-to',
        'txt:Text (encoded):UTF8',
        '--outdir',
        join(dir, 'out'),
        ...names.map((name) => join(dir, `${name}.rtf`)),
      ],
      { stdio: 'pipe', timeout: 300_000 },
    );
    for (const name of names) {
      const expected = writingWords(writePlainText(CONSTRUCTS[name]!('odf')));
      const read = words(readFileSync(join(dir, 'out', `${name}.txt`), 'utf8'));
      expect(read, name).toEqual(expected);
    }
  }, 400_000);
});
