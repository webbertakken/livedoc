// marks.md "Making a mark" (a Text's words), "Stamps" (a stamp's): one answer for every mark's words.
import { describe, expect, it } from 'vitest';
import { Mark, type StampInput, type TextBoxInput } from './mark';
import { MarkWords } from './mark-words';
import { StampLayout } from './stamp-layout';
import { TypedLayout } from './typed-layout';

const base = {
  id: 'm1',
  page: 'p:1',
  colour: '#ba1d26',
  opacity: 1,
  author: 'Ada',
  createdAt: 1_795_000_000_000,
} as const;

describe('MarkWords.of', () => {
  it('sets a Text’s words as TypedLayout places them, plain, at the mark’s size', () => {
    const text = Mark.text({
      ...base,
      rect: [100, 600, 200, 650],
      words: 'Check this',
      size: 12,
    } as unknown as TextBoxInput)!;
    expect(MarkWords.of(text)).toEqual({
      lines: TypedLayout.place(text).map((line) => ({ ...line, size: 12, bold: false })),
      box: [100, 600, 200, 650],
    });
  });

  it('sets a stamp’s words as StampLayout places them', () => {
    const stamp = Mark.stamp({
      ...base,
      rect: [100, 600, 220, 627],
      stamp: 'draft',
      lines: ['DRAFT'],
    } as unknown as StampInput)!;
    expect(MarkWords.of(stamp)).toEqual({ lines: StampLayout.place(stamp), box: stamp.rect });
  });

  it('answers nothing for a kind that sets no words', () => {
    const line = Mark.line('line', { ...base, line: [0, 0, 10, 10], width: 2 })!;
    expect(MarkWords.of(line)).toBeNull();
  });
});
