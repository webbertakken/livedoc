// docs/specs/034-text-documents/text-and-paragraphs.md "Paint format", "Clear formatting".
import { describe, expect, it } from 'vitest';
import type { Mark, Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { textDocumentSchema as schema } from './text-document-schema';
import { clearFormatting, copyFormatting, pasteFormatting } from './text-document-format-copy';

const mark = (name: string, value: unknown) => schema.marks[name]!.create({ value });
const link = schema.marks.link!.create({ href: 'https://example.com' });
const textStyle = schema.marks.text_style!.create({ id: 'Emphasis' });
const runKept = schema.marks.run_kept!.create({ kept: { xml: '<w:rPr/>' } });
const text = (value: string, ...marks: Mark[]) => schema.text(value, marks);
const p = (nodes: PmNode[], attrs: Record<string, unknown> = {}) =>
  schema.nodes.paragraph!.create(attrs, nodes);
const kept = schema.nodes.kept_inline!.create({ name: 'bookmark', props: { bold: true } });

// A state over the paragraphs, the selection between body positions.
function stateOf(paragraphs: PmNode[], from: number, to = from): EditorState {
  const doc = schema.node('doc', null, paragraphs);
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
}

function run(state: EditorState, command: Command): EditorState {
  let next = state;
  let steps = 0;
  const ran = command(state, (tr) => {
    steps += 1;
    next = state.apply(tr);
  });
  expect(ran).toBe(true);
  // One transaction, so one undo step.
  expect(steps).toBe(1);
  return next;
}

// Each inline of a paragraph as [text or node name, { mark: value }].
const runsOf = (paragraph: PmNode) => {
  const out: [string, Record<string, unknown>][] = [];
  paragraph.forEach((node) =>
    out.push([
      node.text ?? node.type.name,
      Object.fromEntries(
        node.marks.map((m) => {
          const attrs = m.attrs as { value?: unknown; href?: unknown; id?: unknown };
          return [m.type.name, attrs.value ?? attrs.href ?? attrs.id ?? true];
        }),
      ),
    ]),
  );
  return out;
};
const marksOf = (marks: readonly Mark[] | null) => (marks ?? []).map((m) => m.type.name).sort();

describe('copyFormatting', () => {
  it("copies the text formatting where the selection starts and its paragraph's style and own formatting", () => {
    const state = stateOf(
      [
        p([text('Big', mark('bold', true), mark('size', 18), link, runKept), text(' rest')], {
          style: 'Heading_20_1',
          props: { align: 'center' },
          list: { id: 'L1', level: 0 },
        }),
      ],
      1,
      6,
    );
    const copy = copyFormatting(state);
    // A link is no formatting; the run's own formatting element is.
    expect(marksOf(copy.marks)).toEqual(['bold', 'run_kept', 'size']);
    expect(copy.style).toBe('Heading_20_1');
    expect(copy.props).toEqual({ align: 'center' });
  });

  it("copies the caret's formatting when nothing is selected", () => {
    const state = stateOf([p([text('ab', mark('italic', true))])], 2);
    expect(marksOf(copyFormatting(state).marks)).toEqual(['italic']);
    expect(copyFormatting(state).style).toBeNull();
    expect(copyFormatting(state).props).toBeNull();
  });
});

describe('pasteFormatting', () => {
  const copy = {
    marks: [mark('bold', true), mark('color', '#ff0000')],
    style: 'Heading_20_2',
    props: { align: 'end' as const },
  };

  it('gives the selected text the copied text formatting in place of its own, links kept', () => {
    const state = stateOf(
      [p([text('one ', mark('italic', true)), text('two', link, textStyle), text(' three')])],
      1,
      8,
    );
    const next = run(state, pasteFormatting(copy));
    expect(runsOf(next.doc.firstChild!)).toEqual([
      ['one ', { bold: true, color: '#ff0000' }],
      ['two', { bold: true, color: '#ff0000', link: 'https://example.com' }],
      [' three', {}],
    ]);
  });

  it('gives every paragraph the selection touches the paragraph style and formatting, its list kept', () => {
    const list = { id: 'L1', level: 1 };
    const state = stateOf(
      [p([text('first')], { props: { indentStart: 36 } }), p([text('second')], { list })],
      2,
      10,
    );
    const next = run(state, pasteFormatting(copy));
    for (const paragraph of [next.doc.child(0), next.doc.child(1)]) {
      expect(paragraph.attrs.style).toBe('Heading_20_2');
      expect(paragraph.attrs.props).toEqual({ align: 'end' });
    }
    expect(next.doc.child(1).attrs.list).toEqual(list);
  });

  it("formats the caret's paragraph and the next characters typed when nothing is selected", () => {
    const state = stateOf([p([text('ab', mark('italic', true), link)])], 2);
    const next = run(state, pasteFormatting(copy));
    expect(next.doc.firstChild!.attrs.style).toBe('Heading_20_2');
    expect(marksOf(next.storedMarks)).toEqual(['bold', 'color', 'link']);
  });

  it('leaves kept content as it was', () => {
    const state = stateOf([p([text('a'), kept, text('b')])], 1, 4);
    const next = run(state, pasteFormatting(copy));
    expect(next.doc.firstChild!.child(1).attrs.props).toEqual({ bold: true });
    expect(next.doc.firstChild!.child(1).marks).toEqual([]);
  });

  it('takes a style of Normal text (none) and no own formatting as they are', () => {
    const state = stateOf(
      [p([text('x', mark('bold', true))], { style: 'Title', props: { align: 'center' } })],
      1,
      2,
    );
    const next = run(state, pasteFormatting({ marks: [], style: null, props: null }));
    expect(next.doc.firstChild!.attrs.style).toBeNull();
    expect(next.doc.firstChild!.attrs.props).toBeNull();
    expect(runsOf(next.doc.firstChild!)).toEqual([['x', {}]]);
  });
});

describe('clearFormatting', () => {
  it("removes the selection's own text formatting, character style and run formatting, links kept", () => {
    const state = stateOf(
      [
        p([
          text('bold ', mark('bold', true), mark('font', 'Lora'), runKept),
          text('link', link, textStyle, mark('highlight', '#ffff00')),
          text(' after', mark('italic', true)),
        ]),
      ],
      1,
      10,
    );
    const next = run(state, clearFormatting);
    expect(runsOf(next.doc.firstChild!)).toEqual([
      ['bold ', {}],
      ['link', { link: 'https://example.com' }],
      [' after', { italic: true }],
    ]);
  });

  it('returns the paragraphs it touches to their style, keeping the style and the list', () => {
    const list = { id: 'L1', level: 0 };
    const state = stateOf(
      [
        p([text('one')], {
          style: 'Heading_20_1',
          props: { align: 'center', spaceAfter: 12 },
          list,
        }),
        p([text('two')], { props: { indentStart: 36 } }),
        p([text('three')], { props: { align: 'end' } }),
      ],
      2,
      7,
    );
    const next = run(state, clearFormatting);
    expect(next.doc.child(0).attrs).toMatchObject({ style: 'Heading_20_1', props: null, list });
    expect(next.doc.child(1).attrs.props).toBeNull();
    expect(next.doc.child(2).attrs.props).toEqual({ align: 'end' });
  });

  it("clears the caret's paragraph and the next characters typed when nothing is selected", () => {
    const state = stateOf(
      [p([text('ab', mark('bold', true), link)], { props: { align: 'center' } })],
      2,
    );
    const next = run(state, clearFormatting);
    expect(next.doc.firstChild!.attrs.props).toBeNull();
    // The text there keeps its formatting; only what is typed next is plain.
    expect(runsOf(next.doc.firstChild!)).toEqual([
      ['ab', { bold: true, link: 'https://example.com' }],
    ]);
    expect(marksOf(next.storedMarks)).toEqual(['link']);
  });

  it('leaves kept content as it was', () => {
    const state = stateOf([p([text('a', mark('bold', true)), kept])], 1, 3);
    const next = run(state, clearFormatting);
    expect(next.doc.firstChild!.child(1).attrs.props).toEqual({ bold: true });
    expect(runsOf(next.doc.firstChild!)[0]).toEqual(['a', {}]);
  });
});
