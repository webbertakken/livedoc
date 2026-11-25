// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Threads in the margin", "How a comment is kept": each open thread's stretch
// in the writing, the stretch Add comment takes, anchors that keep out typing at their edges, cards stacked without
// overlapping, and the highlight that tints and selects.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import {
  LiveThreads,
  TextDocumentState,
  type TextDocumentThreadStart,
} from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';
import {
  anchorsOf,
  setThreadHighlight,
  stackCards,
  stretchToComment,
  threadAt,
  threadHighlightKey,
  threadHighlightPlugin,
  threadStretches,
} from './text-document-threads';

const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((v) => v.destroy()));

async function writing(texts: string[], onSelect = vi.fn()) {
  const doc = TextDocumentState.load();
  TextDocumentState.replaceBody(
    doc,
    texts.map((text) => ({ text })),
  );
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      schema: textDocumentSchema,
      plugins: [ySyncPlugin(TextDocumentState.body(doc)), threadHighlightPlugin({ onSelect })],
    }),
  });
  views.push(view);
  // The binding takes the editor over once its first render has run.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return { doc, view, onSelect };
}

const ADA = { key: 'k', name: 'Ada', colour: '#0284c7' };

function begin(view: EditorView, doc: Y.Doc, from: number, to: number, id = 't1'): void {
  const anchors = anchorsOf(view.state, from, to)!;
  const start: TextDocumentThreadStart = {
    id,
    tab: 't.0',
    ...anchors,
    comment: { id: `${id}-c`, text: 'hm', at: 1, author: ADA },
  };
  LiveThreads.begin(doc, start, null);
}

const textOf = (view: EditorView, s: { from: number; to: number }) =>
  view.state.doc.textBetween(s.from, s.to);

describe('threadStretches', () => {
  it('finds each open thread’s stretch, following typing and never stretched at its edges', async () => {
    const { doc, view } = await writing(['quarterly results are in']);
    // "results" is 11..18 in the document (the paragraph opens at 0).
    begin(view, doc, 11, 18);
    const [s] = threadStretches(view.state, LiveThreads.read(doc));
    expect(textOf(view, s!)).toBe('results');
    view.dispatch(view.state.tr.insertText('XX', 1));
    view.dispatch(view.state.tr.insertText('<', 13));
    view.dispatch(view.state.tr.insertText('>', 21));
    const [moved] = threadStretches(view.state, LiveThreads.read(doc));
    expect(textOf(view, moved!)).toBe('results');
  });

  it('reads a stretch whose text is gone as deleted, and skips resolved threads', async () => {
    const { doc, view } = await writing(['quarterly results are in']);
    begin(view, doc, 11, 18, 'a');
    begin(view, doc, 1, 10, 'b');
    LiveThreads.resolve(doc, 'b', true, null);
    view.dispatch(view.state.tr.delete(11, 18));
    expect(threadStretches(view.state, LiveThreads.read(doc))).toEqual([
      { id: 'a', from: 11, to: 11, deleted: true },
    ]);
  });

  it('finds nothing before the binding has mapped the writing', () => {
    const state = EditorState.create({ schema: textDocumentSchema });
    expect(threadStretches(state, [])).toEqual([]);
    expect(anchorsOf(state, 1, 2)).toBeNull();
  });
});

describe('stretchToComment', () => {
  it('takes the selection, else the word at the caret, else nothing', async () => {
    const { view } = await writing(['quarterly results', '']);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 5)));
    expect(stretchToComment(view.state)).toEqual({ from: 2, to: 5 });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 14)));
    expect(textOf(view, stretchToComment(view.state)!)).toBe('results');
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 20)));
    expect(stretchToComment(view.state)).toBeNull();
  });
});

describe('anchorsOf', () => {
  it('quotes the stretch, across paragraphs too', async () => {
    const { view } = await writing(['one', 'two']);
    expect(anchorsOf(view.state, 2, 8)?.quote).toBe('ne\ntw');
  });
});

describe('stackCards', () => {
  const card = (id: string, top: number, height = 50) => ({ id, top, height });

  it('keeps cards level with their stretches where they fit, and pushes overlapping ones down 8 px apart', () => {
    expect([...stackCards([card('a', 0), card('b', 20), card('c', 200)], null)]).toEqual([
      ['a', 0],
      ['b', 58],
      ['c', 200],
    ]);
  });

  it('sets the selected card level with its stretch, moving those above it up', () => {
    expect([...stackCards([card('a', 0), card('b', 20), card('c', 40)], 'b')]).toEqual([
      ['b', 20],
      ['c', 78],
      ['a', -38],
    ]);
  });

  it('stacks nothing for no cards, and from the first for a selection not among them', () => {
    expect(stackCards([], 'x').size).toBe(0);
    expect(stackCards([card('a', 5)], 'x').get('a')).toBe(5);
  });
});

describe('threadHighlightPlugin', () => {
  it('tints each stretch, the selected one and a draft darker, and moves them with the writing', async () => {
    const { view } = await writing(['quarterly results are in']);
    setThreadHighlight(view, {
      stretches: [
        { id: 'a', from: 11, to: 18, deleted: false },
        { id: 'gone', from: 3, to: 3, deleted: true },
      ],
      selected: 'a',
      draft: { from: 1, to: 4 },
    });
    const tinted = () =>
      [...view.dom.querySelectorAll('.text-document-comment')].map((e) => [
        e.textContent,
        e.classList.contains('text-document-comment-selected'),
        e.getAttribute('data-thread'),
      ]);
    expect(tinted()).toEqual([
      ['qua', true, null],
      ['results', true, 'a'],
    ]);
    view.dispatch(view.state.tr.insertText('XX', 1));
    const state = threadHighlightKey.getState(view.state)!;
    expect(state.stretches[0]).toMatchObject({ from: 13, to: 20 });
    expect(state.draft).toEqual({ from: 3, to: 6 });
  });

  it('selects the innermost thread pressed, and lets it go when pressed elsewhere', async () => {
    const { view, onSelect } = await writing(['quarterly results are in']);
    const stretches = [
      { id: 'outer', from: 1, to: 20, deleted: false },
      { id: 'inner', from: 11, to: 18, deleted: false },
    ];
    expect(threadAt(stretches, 12)).toBe('inner');
    expect(threadAt(stretches, 5)).toBe('outer');
    expect(threadAt(stretches, 22)).toBeNull();
    setThreadHighlight(view, { stretches, selected: 'outer', draft: null });
    const click = (pos: number) =>
      view.someProp('handleClick', (f) => f(view, pos, new MouseEvent('click')));
    click(12);
    expect(onSelect).toHaveBeenLastCalledWith('inner');
    onSelect.mockClear();
    click(5);
    expect(onSelect).not.toHaveBeenCalled();
    click(23);
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
