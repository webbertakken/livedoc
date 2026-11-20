// docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard": Markdown pasted as paragraphs, its headings and
// list items naming their level and list until the paste places them.
import { describe, expect, it } from 'vitest';
import { textDocumentSchema as schema } from './text-document-schema';
import { markdownSlice } from './text-document-markdown-slice';

describe('markdownSlice', () => {
  it('makes a paragraph per block, headings and items named for placing, runs formatted', () => {
    const { slice, lists } = markdownSlice(
      '## Two\n\n3. **a**\n   1. [b](https://a.b)\n- [ ] c\n\ntext',
      schema,
    );
    const attrs = slice.content.content.map((n) => ({ ...n.attrs, content: n.textContent }));
    expect(attrs).toMatchObject([
      { style: '@heading2', content: 'Two' },
      { list: { id: '@paste:md-1', level: 0, restart: 3 }, content: 'a' },
      { list: { id: '@paste:md-1', level: 1 }, content: 'b' },
      { list: { id: '@paste:md-2', level: 0, checked: false }, content: 'c' },
      { style: null, list: null, content: 'text' },
    ]);
    expect(slice.content.child(1).firstChild!.marks.map((m) => m.type.name)).toEqual(['bold']);
    expect(slice.content.child(2).firstChild!.marks[0]!.attrs.href).toBe('https://a.b');
    expect([...lists.get('md-1')!]).toEqual([
      [0, { kind: 'number', format: 'decimal' }],
      [1, { kind: 'number', format: 'decimal' }],
    ]);
    expect([...lists.get('md-2')!]).toEqual([[0, { kind: 'check' }]]);
    expect([slice.openStart, slice.openEnd]).toEqual([1, 1]);
  });

  it('is empty for nothing', () => {
    expect(markdownSlice('\n\n', schema).slice.size).toBe(0);
  });
});
