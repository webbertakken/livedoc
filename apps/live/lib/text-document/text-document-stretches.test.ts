// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Selection": several stretches kept with Ctrl+Alt+Shift+← / →
// (Ctrl⌘⇧ on a Mac) or ⌘-drag, moved and extended by the arrows, let go by typing, Enter, Escape; formatting and
// Delete on all of them; copied each from a new line; announced; and Select all matching text.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Selection, EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema as schema } from './text-document-schema';
import {
  lastStretch,
  selectMatching,
  stretchesPlugin,
  stretchKeyOf,
  StretchSelection,
} from './text-document-stretches';
import { TextDocument } from '@livedoc/text-documents';
import { toggleText } from './text-document-formatting';
import { plainTextOf } from './text-document-clipboard-text';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));

// jsdom lays nothing out: the selection scrolled into view has no rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const bold = schema.marks.bold!.create({ value: true });
const doc = () =>
  schema.node('doc', null, [
    schema.nodes.paragraph!.create({}, [
      schema.text('one '),
      schema.text('two', [bold]),
      schema.text(' three'),
    ]),
    schema.nodes.paragraph!.create({ style: 'H' }, [schema.text('four', [bold])]),
    schema.nodes.paragraph!.create({}, [schema.text('five', [bold])]),
  ]);

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  track.mockReset();
});

function editor(selection?: (d: ReturnType<typeof doc>) => Selection): EditorView {
  const d = doc();
  const holder = document.body.appendChild(document.createElement('div'));
  const view = new EditorView(holder.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc: d, selection: selection?.(d), plugins: [stretchesPlugin()] }),
  });
  views.push(view);
  return view;
}

const key = (view: EditorView, init: KeyboardEventInit) =>
  view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', init)));
const add = (view: EditorView, dir: 'ArrowLeft' | 'ArrowRight' = 'ArrowRight') =>
  key(view, { key: dir, ctrlKey: true, altKey: true, shiftKey: true });
const texts = (view: EditorView) =>
  view.state.selection.ranges.map((r) => view.state.doc.textBetween(r.$from.pos, r.$to.pos));

describe('stretchKeyOf', () => {
  it('reads Ctrl⌘⇧ on a Mac and Ctrl+Alt+Shift elsewhere, with Left or Right', () => {
    const at = (init: KeyboardEventInit, mac: boolean) =>
      stretchKeyOf(new KeyboardEvent('keydown', init), mac);
    expect(at({ key: 'ArrowLeft', ctrlKey: true, metaKey: true, shiftKey: true }, true)).toBe(-1);
    expect(at({ key: 'ArrowRight', ctrlKey: true, altKey: true, shiftKey: true }, false)).toBe(1);
    expect(at({ key: 'ArrowRight', ctrlKey: true, altKey: true, shiftKey: true }, true)).toBeNull();
    expect(at({ key: 'ArrowUp', ctrlKey: true, altKey: true, shiftKey: true }, false)).toBeNull();
  });
});

describe('several stretches by the keys', () => {
  it('keep the selection, start a caret beside it, extend it with Shift, and keep it too', () => {
    const view = editor((d) => TextSelection.create(d, 1, 4));
    expect(add(view)).toBe(true);
    expect(view.state.selection).toBeInstanceOf(StretchSelection);
    expect(view.state.selection.head).toBe(5);
    key(view, { key: 'ArrowRight' });
    key(view, { key: 'ArrowRight', shiftKey: true });
    key(view, { key: 'ArrowRight', shiftKey: true });
    key(view, { key: 'ArrowRight', shiftKey: true });
    expect(texts(view)).toEqual(['one', 'wo ']);
    add(view);
    expect(texts(view)).toEqual(['one', 'wo ', '']);
    expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentStretches');
    // Announced, politely.
    expect(view.dom.parentElement!.querySelector('[role="status"]')!.textContent).toBe(
      '2 stretches selected',
    );
  });

  it('do nothing from a bare caret', () => {
    const view = editor((d) => TextSelection.create(d, 2));
    expect(add(view, 'ArrowLeft')).toBeFalsy();
  });

  it('let go to the last with Escape, and type there alone', () => {
    const view = editor((d) => TextSelection.create(d, 1, 4));
    add(view, 'ArrowLeft');
    key(view, { key: 'Escape' });
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.head).toBe(1);
    add(view);
    view.dispatch(
      view.state.tr.setSelection(
        StretchSelection.of(view.state.doc, [
          { from: 1, to: 4 },
          { from: 6, to: 8 },
        ])!,
      ),
    );
    const typed = view.someProp('handleTextInput', (f) => f(view, 6, 8, 'X', () => view.state.tr));
    expect(typed).toBe(true);
    expect(view.state.doc.firstChild!.textContent).toBe('one tX three');
  });

  it('let Enter and Tab act at the last stretch', () => {
    const view = editor((d) =>
      StretchSelection.of(d, [
        { from: 1, to: 4 },
        { from: 6, to: 8 },
      ])!,
    );
    expect(key(view, { key: 'Enter' })).toBeFalsy();
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.selection.from).toBe(6);
  });
});

describe('StretchSelection', () => {
  it('maps through changes, letting go of stretches deleted, and round-trips JSON', () => {
    const view = editor((d) =>
      StretchSelection.of(d, [
        { from: 1, to: 4 },
        { from: 6, to: 8 },
      ])!,
    );
    const selection = view.state.selection as StretchSelection;
    expect(Selection.fromJSON(view.state.doc, selection.toJSON()).eq(selection)).toBe(true);
    view.dispatch(view.state.tr.insertText('ab', 1));
    expect(texts(view)).toEqual(['one', 'wo']);
    view.dispatch(view.state.tr.delete(3, 6));
    expect(view.state.selection).toBeInstanceOf(TextSelection);
  });

  it('copies each stretch from a new line', () => {
    const view = editor((d) =>
      StretchSelection.of(d, [
        { from: 16, to: 18 },
        { from: 1, to: 4 },
      ])!,
    );
    expect(plainTextOf(view.state.selection.content())).toBe('one\nfo');
    expect(lastStretch(view.state.selection as StretchSelection).from).toBe(1);
  });

  it('is one text selection when one stretch is left', () => {
    expect(StretchSelection.of(doc(), [{ from: 1, to: 4 }])).toBeInstanceOf(TextSelection);
    expect(StretchSelection.of(doc(), [{ from: 2, to: 2 }])).toBeNull();
  });

  it('formats and deletes every stretch', () => {
    const view = editor((d) =>
      StretchSelection.of(d, [
        { from: 1, to: 4 },
        { from: 6, to: 8 },
      ])!,
    );
    const blank = TextDocument.blank();
    toggleText({ styles: blank.styles, defaults: blank.defaults }, 'italic')(
      view.state,
      view.dispatch,
    );
    const italic = (pos: number) =>
      view.state.doc
        .resolve(pos)
        .marks()
        .some((m) => m.type.name === 'italic');
    expect([italic(2), italic(7), italic(5)]).toEqual([true, true, false]);
    view.dispatch(view.state.tr.deleteSelection());
    expect(view.state.doc.firstChild!.textContent).toBe(' t three');
  });
});

// The plugin's own press handler: jsdom cannot lay out the pointer's press for ProseMirror's.
const press = (view: EditorView, init: MouseEventInit) =>
  view.someProp('handleDOMEvents', (h) => h.mousedown?.(view, new MouseEvent('mousedown', init)));

describe('several stretches by the pointer', () => {
  it('adds the dragged selection to those kept while ⌘ (Ctrl) is held', () => {
    const view = editor((d) => TextSelection.create(d, 1, 4));
    press(view, { ctrlKey: true, metaKey: true });
    expect(view.someProp('handleClick', (f) => f(view, 9, new MouseEvent('click')))).toBe(true);
    view.dispatch(
      view.state.tr
        .setSelection(TextSelection.create(view.state.doc, 6, 8))
        .setMeta('pointer', true),
    );
    expect(texts(view)).toEqual(['one', 'wo']);
    // A selection made by other means is its own.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 3)));
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    press(view, {});
    expect(view.someProp('handleClick', (f) => f(view, 9, new MouseEvent('click')))).toBeFalsy();
  });
});

describe('selectMatching', () => {
  it('selects every stretch formatted as the caret, in paragraphs of its style', () => {
    const view = editor((d) => TextSelection.create(d, 7));
    expect(selectMatching(view.state, view.dispatch)).toBe(true);
    expect(texts(view)).toEqual(['two', 'five']);
    expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentSelectMatching');
  });

  it('reads the formatting where a selection starts, and declines in an empty document', () => {
    const view = editor((d) => TextSelection.create(d, 1, 3));
    selectMatching(view.state, view.dispatch);
    expect(texts(view)).toEqual(['one ', ' three']);
    const empty = EditorState.create({
      doc: schema.node('doc', null, [schema.nodes.paragraph!.create()]),
    });
    expect(selectMatching(empty)).toBe(false);
  });
});
