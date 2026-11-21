// @vitest-environment jsdom
// docs/specs/004-interface-design/office-shell.md "Toolbar": pressed states and the font size are read again as the
// selection or the formatting at the caret changes; the outline only as the body does. performance.md "A keystroke's
// frame": both are told after the frame that paints the change, once however many changes came in it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import { createTextDocumentChanges } from './text-document-changes';
import { paintFormatPlugin, pressRoller } from './text-document-paint-format';
import { listMarkersPlugin } from './text-document-list-markers';

let view: EditorView;
// The frame drawn and painted, and what waits for its paint run.
const painted = () => {
  vi.advanceTimersToNextFrame();
  vi.runOnlyPendingTimers();
};
let changes: ReturnType<typeof createTextDocumentChanges>;
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout'],
  });
  changes = createTextDocumentChanges();
  const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, schema.text('abc'))]);
  view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, plugins: [changes.plugin] }),
  });
});
afterEach(() => {
  view.destroy();
  vi.useRealTimers();
});

describe('createTextDocumentChanges', () => {
  it('tells the body and caret listeners of edits once, after the frame that paints them', () => {
    const body = vi.fn();
    const caret = vi.fn();
    changes.subscribe(body);
    changes.subscribeCaret(caret);
    view.dispatch(view.state.tr.insertText('x', 1));
    view.dispatch(view.state.tr.insertText('y', 1));
    vi.advanceTimersToNextFrame();
    expect(body).not.toHaveBeenCalled();
    expect(caret).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(body).toHaveBeenCalledOnce();
    expect(caret).toHaveBeenCalledOnce();
  });

  it('tells only the caret listeners of a moved selection or new stored formatting', () => {
    const body = vi.fn();
    const caret = vi.fn();
    changes.subscribe(body);
    const stop = changes.subscribeCaret(caret);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    painted();
    view.dispatch(view.state.tr.addStoredMark(schema.marks.bold!.create({ value: true })));
    painted();
    expect(caret).toHaveBeenCalledTimes(2);
    expect(body).not.toHaveBeenCalled();
    stop();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
    painted();
    expect(caret).toHaveBeenCalledTimes(2);
  });

  // text-and-paragraphs.md "Paint format": the roller is drawn pressed as soon as it is on.
  it('tells the caret listeners when the paint roller changes', () => {
    view.destroy();
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: view.state.doc,
        plugins: [changes.plugin, paintFormatPlugin()],
      }),
    });
    const caret = vi.fn();
    changes.subscribeCaret(caret);
    pressRoller(view.state, view.dispatch);
    painted();
    expect(caret).toHaveBeenCalledOnce();
  });

  // lists.md "List styles": a list restyled presses its button anew, with no edit of the writing.
  it('tells the caret listeners when the lists drawn change', () => {
    let notify = () => {};
    view.destroy();
    view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: schema.node('doc', null, [
          schema.nodes.paragraph!.create({ list: { id: 'L1', level: 0 } }, schema.text('a')),
        ]),
        plugins: [
          changes.plugin,
          listMarkersPlugin(
            () => ({}),
            (listener) => {
              notify = listener;
              return () => {};
            },
          ),
        ],
      }),
    });
    const caret = vi.fn();
    changes.subscribeCaret(caret);
    notify();
    painted();
    expect(caret).toHaveBeenCalledOnce();
  });

  it('tells no one after the editor is gone', () => {
    const body = vi.fn();
    const caret = vi.fn();
    changes.subscribe(body);
    changes.subscribeCaret(caret);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    view.destroy();
    painted();
    expect(caret).not.toHaveBeenCalled();
    view = new EditorView(document.createElement('div'), { state: view.state });
  });
});
