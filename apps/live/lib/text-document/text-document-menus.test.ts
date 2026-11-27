// docs/specs/034-text-documents/tools.md "Google-only services": what fork C3 leaves out has its parity row, reads
// left out (C3), and no menu offers it (translate, voice typing, any assistant, add-ons and scripting, Explore).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { catalogueItems } from '@/lib/office/office-catalogue';
import { textDocumentMenus } from './text-document-menus';

const MATRIX = readFileSync(
  fileURLToPath(
    new URL('../../../../docs/specs/034-text-documents/parity-matrix.md', import.meta.url),
  ),
  'utf8',
);

const LEFT_OUT: readonly (readonly [row: string, words: RegExp])[] = [
  ['Translate document', /translat/i],
  ['Voice typing', /voice/i],
  ['Assistant button', /gemini|assistant|smart reply/i],
  ['Add-ons', /add-on/i],
  ['Apps Script', /apps script|macro/i],
  ['Explore', /^explore$/i],
];

const statusOf = (row: string): string | undefined =>
  MATRIX.split('\n')
    .find((line) => line.startsWith(`| ${row} `))
    ?.split('|')[3]
    ?.trim();

describe('what fork C3 leaves out', () => {
  it.each(LEFT_OUT)('%s has its parity row, left out (C3)', (row) => {
    expect(statusOf(row)).toBe('left out (C3)');
  });

  it.each(LEFT_OUT)(
    '%s is offered by no menu, with screen reader support on or off',
    (_row, words) => {
      for (const screenReader of [false, true])
        for (const format of ['odf', 'ooxml'] as const) {
          const offered = catalogueItems(textDocumentMenus(format, { screenReader }))
            .map(({ item }) => [item.label, ...(item.keywords ?? [])].join(' '))
            .filter((text) => words.test(text));
          expect(offered).toEqual([]);
        }
    },
  );
});
