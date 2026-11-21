// docs/specs/034-text-documents/page-layout.md "Footnotes": notes are numbered 1, 2, 3 through the document in the
// order of their marks.
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
  it('numbers the body’s notes in the order of their marks', () => {
    const a = note('a');
    const b = note('b');
    const c = note('c');
    const body: Block[] = [
      { ...Paragraph.of('One', 'Standard'), inlines: [{ type: 'run', text: 'x', props: {} }, a, b] },
      { type: 'kept', name: 'table', xml: { xml: '<t/>', ns: {} } },
      { ...Paragraph.of('', 'Standard'), inlines: [c] },
    ];
    const numbers = Notes.numbers(body);
    expect([numbers.get(a), numbers.get(b), numbers.get(c)]).toEqual([1, 2, 3]);
    expect(Notes.all(body)).toEqual([a, b, c]);
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
