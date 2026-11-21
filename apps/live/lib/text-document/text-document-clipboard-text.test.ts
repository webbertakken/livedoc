// docs/specs/034-text-documents/text-and-paragraphs.md "Clipboard": the copied plain text, a line per paragraph, a
// whole list item after its marker as drawn; plain text pasted (Paste without formatting), a paragraph per line,
// empty lines kept, in the formatting at the caret.
import { describe, expect, it } from 'vitest';
import { Fragment, Slice } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { ListDefinition } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { plainTextOf, plainTextSlice, selectionMarkers } from './text-document-clipboard-text';

const lists = { L1: ListDefinition.of('number'), L2: ListDefinition.of('check') };
const doc = schema.node('doc', null, [
  schema.nodes.paragraph!.create({}, schema.text('Intro\tend')),
  schema.nodes.paragraph!.create({ list: { id: 'L1', level: 0 } }, schema.text('one')),
  schema.nodes.paragraph!.create({ list: { id: 'L1', level: 0 } }, schema.text('two')),
  schema.nodes.section_break!.create(),
  schema.nodes.paragraph!.create({ list: { id: 'L2', level: 0, checked: true } }, [
    schema.text('done'),
    schema.nodes.kept_inline!.create({ name: 'bookmark' }),
  ]),
]);

function copy(from: number, to: number): string {
  const state = EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
  return plainTextOf(state.selection.content(), selectionMarkers(state, lists));
}

describe('plainTextOf', () => {
  it('writes a line per paragraph, list items after their markers, kept content and breaks as nothing', () => {
    expect(copy(1, doc.content.size - 1)).toBe('Intro\tend\n1. one\n2. two\n☑ done');
  });

  it('writes no marker for an item copied from inside its text', () => {
    const two = doc.resolve(0).posAtIndex(2) + 2;
    expect(copy(two, two + 2)).toBe('wo');
  });

  it('reads no markers when none are given', () => {
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1, 18) });
    expect(plainTextOf(state.selection.content())).toBe('Intro\tend\none\nt');
  });

  // page-layout.md "Footnotes": copied elsewhere, a footnote's mark is its number.
  it('writes a footnote’s mark as its number, a field as its text', () => {
    const p = schema.nodes.paragraph!.create({}, [
      schema.text('Said'),
      schema.nodes.footnote!.create({ story: 'n' }),
      schema.text(' on page '),
      schema.nodes.field!.create({ field: 'page-number', text: '4' }),
    ]);
    const slice = new Slice(Fragment.from(p), 0, 0);
    expect(plainTextOf(slice, [], new Map([['n', 3]]))).toBe('Said3 on page 4');
    expect(plainTextOf(slice)).toBe('Said on page 4');
  });
});

describe('plainTextSlice', () => {
  const heading = schema.node('doc', null, [
    schema.nodes.paragraph!.create(
      {
        style: 'Heading1',
        list: { id: 'L1', level: 1, restart: 4, checked: true },
        kept: { x: 1 },
      },
      schema.text('Head', [schema.marks.bold!.create({ value: true })]),
    ),
  ]);

  it('makes a paragraph per line, empty lines kept, in the formatting at the caret', () => {
    const slice = plainTextSlice('a\r\n\nb\u0007\tc', heading.resolve(3));
    expect(slice.openStart).toBe(1);
    expect(slice.openEnd).toBe(1);
    const paragraphs: { text: string; attrs: Record<string, unknown>; bold: boolean }[] = [];
    slice.content.forEach((node) =>
      paragraphs.push({
        text: node.textContent,
        attrs: node.attrs,
        bold: node.firstChild?.marks.some((m) => m.type.name === 'bold') ?? false,
      }),
    );
    expect(paragraphs.map((p) => p.text)).toEqual(['a', '', 'b\tc']);
    expect(paragraphs[0]!.bold).toBe(true);
    // Each line a new item of the caret's list, never restarting it, never ticked, and no kept formatting.
    expect(paragraphs[2]!.attrs).toMatchObject({
      style: 'Heading1',
      list: { id: 'L1', level: 1 },
      kept: null,
    });
  });

  it('keeps an unnumbered item unnumbered, and makes Normal paragraphs outside one', () => {
    const unnumbered = schema.node('doc', null, [
      schema.nodes.paragraph!.create({ list: { id: 'L1', level: 0, unnumbered: true } }),
    ]);
    const slice = plainTextSlice('x', unnumbered.resolve(1));
    expect(slice.content.firstChild!.attrs.list).toEqual({ id: 'L1', level: 0, unnumbered: true });
    const plain = plainTextSlice(
      'x',
      schema.node('doc', null, [schema.nodes.paragraph!.create()]).resolve(0),
    );
    expect(plain.content.firstChild!.attrs.style).toBeNull();
  });
});
