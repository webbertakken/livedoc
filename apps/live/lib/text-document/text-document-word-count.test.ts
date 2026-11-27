import { describe, expect, it } from 'vitest';
import { FIELD, FOOTNOTE } from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';
import { countText, countWriting, NO_COUNTS } from './text-document-word-count';

// docs/specs/034-text-documents/tools.md "Word count", "What counts".

const s = textDocumentSchema;
const paragraph = (...content: Parameters<typeof s.node>[2][]) =>
  s.node('paragraph', null, content.flat() as never);
const docOf = (...blocks: ReturnType<typeof paragraph>[]) => s.node('doc', null, blocks);

describe('countText', () => {
  it('counts words at white space and the punctuation that parts them, a contraction as one', () => {
    expect(countText('The cat’s mat, don’t you think?')).toEqual({
      words: 6,
      characters: 31,
      charactersExcludingSpaces: 26,
    });
  });

  it('counts what a reader sees as one character once, and never a line break', () => {
    expect(countText('e\u0301 👍🏽\nx')).toEqual({
      words: 2,
      characters: 4,
      charactersExcludingSpaces: 3,
    });
    expect(countText('a\r\nb\rc')).toMatchObject({ characters: 3 });
    expect(countText('')).toEqual(NO_COUNTS);
  });
});

describe('countWriting', () => {
  it('counts each paragraph on its own, so no word runs across two', () => {
    const doc = docOf(paragraph(s.text('one two')), paragraph(s.text('three')));
    expect(countWriting(doc)).toEqual({ words: 3, characters: 12, charactersExcludingSpaces: 11 });
  });

  it('counts a field’s shown text; a footnote mark counts nothing but parts the words beside it', () => {
    const field = s.nodes[FIELD]!.create({ field: 'page', text: '12' });
    const mark = s.nodes[FOOTNOTE]!.create({ story: 'n1' });
    const doc = docOf(
      paragraph(s.text('page '), field, s.text(' end')),
      paragraph(s.text('a'), mark, s.text('b')),
    );
    expect(countWriting(doc)).toEqual({ words: 5, characters: 13, charactersExcludingSpaces: 11 });
  });

  it('counts only what lies in a selection, from the middle of a paragraph to the middle of the next', () => {
    const doc = docOf(paragraph(s.text('one two')), paragraph(s.text('three four')));
    // "two" (5..8) through "three" (10..15).
    expect(countWriting(doc, 5, 15)).toMatchObject({ words: 2, characters: 8 });
    expect(countWriting(doc, 3, 3)).toEqual(NO_COUNTS);
  });

  it('counts the text in a table', () => {
    const cell = s.nodes.table_cell!.create(null, paragraph(s.text('in a cell')));
    const table = s.nodes.table!.create(null, s.nodes.table_row!.create(null, [cell]));
    expect(countWriting(s.node('doc', null, [paragraph(s.text('before')), table])).words).toBe(4);
  });
});
