// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Footnotes", "The mark": a copied mark's note travels as its writing; a
// pasted mark gets a note of its own: its own note kept where a cut took the mark, a copy where another mark names it,
// a new note with the writing it brought where the note is not here. A header, footer or note takes no marks.
import { describe, expect, it, vi } from 'vitest';
import { Fragment, Slice, type Node as PmNode } from 'prosemirror-model';
import * as Y from 'yjs';
import { storyFragment, TextDocumentState } from '@livedoc/text-documents';
import type { NodeJson } from './text-document-clipboard-fragment';
import { footnoteClipboard } from './text-document-footnote-clipboard';
import { marksIn } from './text-document-footnotes-edit';
import { textDocumentSchema as schema } from './text-document-schema';
import { withoutMarks } from './text-document-story-editing';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const written = (doc: Y.Doc, story: string, text: string) => {
  const paragraph = new Y.XmlElement('paragraph');
  paragraph.insert(0, [new Y.XmlText(text)]);
  storyFragment(doc, story).insert(0, [paragraph]);
};
const mark = (story: string) => schema.nodes.footnote!.create({ story });
const sliceOf = (...inlines: PmNode[]) =>
  new Slice(Fragment.from(schema.nodes.paragraph!.create(null, inlines)), 1, 1);
const storiesIn = (slice: Slice) =>
  marksIn(schema.topNodeType.create(null, slice.content)).map((m) => m.story);
const text = (doc: Y.Doc, story: string) =>
  TextDocumentState.storyParagraphs(doc, story).map((p) => p.text);

function setUp(bodyStories: string[] = []) {
  const doc = TextDocumentState.load();
  written(doc, 'n1', 'First source');
  const body = schema.topNodeType.create(null, [
    schema.nodes.paragraph!.create(null, [schema.text('x'), ...bodyStories.map(mark)]),
  ]);
  return {
    doc,
    notes: footnoteClipboard(
      doc,
      () => 'odf',
      () => body,
    ),
  };
}

describe('footnoteClipboard', () => {
  it('reads a note’s writing, and none for a note it does not hold', () => {
    const { notes } = setUp();
    expect(notes.read('n1')).toEqual([
      {
        type: 'paragraph',
        attrs: expect.any(Object),
        content: [{ type: 'text', text: 'First source' }],
      },
    ]);
    expect(notes.read('missing')).toBeNull();
  });

  it('keeps a cut mark’s own note, and copies it for a second mark in the same paste', () => {
    const { doc, notes } = setUp();
    const placed = notes.place(sliceOf(mark('n1'), mark('n1')), {});
    const [first, second] = storiesIn(placed);
    expect(first).toBe('n1');
    expect(second).not.toBe('n1');
    expect(text(doc, second!)).toEqual(['First source']);
  });

  it('copies a note another mark names', () => {
    const { doc, notes } = setUp(['n1']);
    const [own] = storiesIn(notes.place(sliceOf(schema.text('a'), mark('n1')), {}));
    expect(own).not.toBe('n1');
    expect(text(doc, own!)).toEqual(['First source']);
  });

  it('makes a note of the writing a mark brought from another document, else an empty one', () => {
    const { doc, notes } = setUp();
    const brought: NodeJson[] = [
      { type: 'paragraph', content: [{ type: 'text', text: 'Brought' }] },
    ];
    const [made, empty] = storiesIn(
      notes.place(sliceOf(mark('far'), mark('none')), { far: brought }),
    );
    expect(text(doc, made!)).toEqual(['Brought']);
    expect(text(doc, empty!)).toEqual(['']);
    expect(made).not.toBe('far');
  });

  it('makes an empty note where the writing brought does not read', () => {
    const { doc, notes } = setUp();
    const [made] = storiesIn(
      notes.place(sliceOf(mark('far')), { far: [{ type: 'no-such-node' }] }),
    );
    expect(text(doc, made!)).toEqual(['']);
  });

  it('leaves a slice without marks as it is', () => {
    const { notes } = setUp();
    const slice = sliceOf(schema.text('plain'));
    expect(notes.place(slice, {})).toBe(slice);
  });
});

describe('withoutMarks', () => {
  it('leaves footnotes’ marks out of what a header, footer or note takes', () => {
    const out = withoutMarks(sliceOf(schema.text('a'), mark('n1'), schema.text('b')));
    expect(out.content.firstChild!.textContent).toBe('ab');
    expect(storiesIn(out)).toEqual([]);
  });
});
