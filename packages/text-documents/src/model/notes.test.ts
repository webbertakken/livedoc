// docs/specs/034-text-documents/page-layout.md "Footnotes": notes are numbered 1, 2, 3 through the document in the
// order of their marks, those in table cells included.
import { describe, expect, it } from 'vitest';
import type { Block, Note } from './blocks';
import { Paragraph } from './blocks';
import { Notes } from './notes';

const note = (text: string): Note => ({
  type: 'note',
  blocks: [Paragraph.of(text, 'Standard')],
  props: {},
});

describe('Notes', () => {
  it('numbers the body’s notes in the order of their marks, into table cells', () => {
    const a = note('a');
    const b = note('b');
    const t = note('t');
    const c = note('c');
    const body: Block[] = [
      {
        ...Paragraph.of('One', 'Standard'),
        inlines: [{ type: 'run', text: 'x', props: {} }, a, b],
      },
      {
        type: 'table',
        columns: [10],
        headerRows: 0,
        rows: [
          { cells: [{ props: {}, blocks: [{ ...Paragraph.of('', 'Standard'), inlines: [t] }] }] },
        ],
      },
      { type: 'kept', name: 'table-of-content', xml: { xml: '<t/>', ns: {} } },
      { ...Paragraph.of('', 'Standard'), inlines: [c] },
    ];
    const numbers = Notes.numbers(body);
    expect([a, b, t, c].map((n) => numbers.get(n))).toEqual([1, 2, 3, 4]);
    expect(Notes.all(body)).toEqual([a, b, t, c]);
  });

  it('numbers none when the body holds none', () => {
    expect(Notes.numbers([Paragraph.of('One', 'Standard')]).size).toBe(0);
  });

  it('reads a paragraph’s mark as no characters', () => {
    const p: Paragraph = {
      ...Paragraph.of('', 'Standard'),
      inlines: [{ type: 'run', text: 'Word', props: {} }, note('n')],
    };
    expect(Paragraph.text(p)).toBe('Word');
  });
});
