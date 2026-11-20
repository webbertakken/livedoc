// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Text formatting": Format > Text, the toolbar and the shortcuts
// act on the writing, read their state as drawn, give focus back, and are counted by name.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { TextDocument } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from './text-document-schema';
import { paintFormatPlugin } from './text-document-paint-format';
import {
  TEXT_DOCUMENT_FORMAT_ITEMS,
  TEXT_DOCUMENT_KEY_ACTIONS,
  textDocumentFormatActions,
} from './text-document-format-actions';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const blank = TextDocument.blank({ format: 'odf' });
const readFormatting = () => ({ styles: blank.styles, defaults: blank.defaults });

// jsdom lays nothing out: the selection scrolled into view has no rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

let view: EditorView;
beforeEach(() => {
  const doc = schema.node('doc', null, [
    schema.nodes.paragraph!.create(null, schema.text('hello world')),
  ]);
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, 1, 6),
      plugins: [paintFormatPlugin()],
    }),
  });
  vi.mocked(track).mockClear();
});
afterEach(() => view.destroy());

const marksOfFirst = () =>
  Object.fromEntries(
    view.state.doc.firstChild!.firstChild!.marks.map((m) => [
      m.type.name,
      (m.attrs as { value: unknown }).value,
    ]),
  );

describe('textDocumentFormatActions', () => {
  it('binds nothing without an editor, or for a session that does not write', () => {
    expect(textDocumentFormatActions(null, readFormatting, { canEdit: true })).toEqual({
      actions: {},
      fontSize: null,
      fontFamily: null,
      colours: null,
    });
    expect(textDocumentFormatActions(view, readFormatting, { canEdit: false }).actions).toEqual({});
  });

  it('runs a toggle, reads it as pressed, focuses the writing and counts it', () => {
    const { actions } = textDocumentFormatActions(view, readFormatting, { canEdit: true });
    expect(actions.bold!.checked).toBe(false);
    actions.bold!.run();
    expect(marksOfFirst()).toEqual({ bold: true });
    expect(actions.bold!.checked).toBe(true);
    expect(view.hasFocus()).toBe(true);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentFormatBold');
  });

  it('binds every Format > Text item', () => {
    const { actions } = textDocumentFormatActions(view, readFormatting, { canEdit: true });
    expect(Object.keys(actions).sort()).toEqual(
      [...TEXT_DOCUMENT_FORMAT_ITEMS, ...TEXT_DOCUMENT_KEY_ACTIONS, 'paint-format'].sort(),
    );
    expect(TEXT_DOCUMENT_FORMAT_ITEMS).toHaveLength(13);
  });

  it('raises the text and reads superscript as on, subscript as off', () => {
    const { actions } = textDocumentFormatActions(view, readFormatting, { canEdit: true });
    actions.superscript!.run();
    expect(actions.superscript!.checked).toBe(true);
    expect(actions.subscript!.checked).toBe(false);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentFormatSuperscript');
  });

  it('steps the size, sets one from the field, and reads it back', () => {
    const { actions, fontSize } = textDocumentFormatActions(view, readFormatting, {
      canEdit: true,
    });
    expect(fontSize!.read()).toBe(11);
    actions['size-increase']!.run();
    expect(fontSize!.read()).toBe(12);
    actions['size-decrease']!.run();
    actions['size-decrease']!.run();
    expect(fontSize!.read()).toBe(10);
    fontSize!.set(24);
    expect(marksOfFirst()).toEqual({ size: 24 });
    expect(track).toHaveBeenLastCalledWith('Element', 'Changed', 'TextDocumentFormatSize');
  });

  it('sets a family from the font menu, reads it back and counts it', () => {
    const { fontFamily } = textDocumentFormatActions(view, readFormatting, { canEdit: true });
    expect(fontFamily!.read()).toBe('Arial');
    fontFamily!.set('Lora');
    expect(marksOfFirst()).toEqual({ font: 'Lora' });
    expect(fontFamily!.read()).toBe('Lora');
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentFormatFont');
  });

  // docs/specs/034-text-documents/text-and-paragraphs.md "Colour".
  it('colours and highlights the selection, reads them back, resets them and counts them', () => {
    const { colours } = textDocumentFormatActions(view, readFormatting, { canEdit: true });
    const text = colours!['text-colour']!;
    const highlight = colours!['highlight-colour']!;
    expect([text.leading, text.none, highlight.leading, highlight.none]).toEqual([
      'Reset',
      '#000000',
      'None',
      undefined,
    ]);
    expect(text.read()).toBeUndefined();
    text.set('#CC0000');
    highlight.set('#fff2cc');
    expect(marksOfFirst()).toEqual({ color: '#cc0000', highlight: '#fff2cc' });
    expect(text.read()).toBe('#cc0000');
    expect(view.hasFocus()).toBe(true);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentFormatTextColour');
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentFormatHighlight');
    text.set(null);
    highlight.set(null);
    expect(marksOfFirst()).toEqual({});
    view.destroy();
    expect(highlight.read()).toBeNull();
  });

  it('rewrites the case, and counts nothing when nothing changed', () => {
    const { actions } = textDocumentFormatActions(view, readFormatting, { canEdit: true });
    actions.uppercase!.run();
    expect(view.state.doc.textContent).toBe('HELLO world');
    actions['title-case']!.run();
    expect(view.state.doc.textContent).toBe('Hello world');
    vi.mocked(track).mockClear();
    actions['title-case']!.run();
    expect(track).not.toHaveBeenCalled();
    actions.lowercase!.run();
    expect(view.state.doc.textContent).toBe('hello world');
  });

  // docs/specs/034-text-documents/text-and-paragraphs.md "Clear formatting", "Paint format".
  it("clears the selection's formatting, focuses the writing and counts it", () => {
    const { actions } = textDocumentFormatActions(view, readFormatting, { canEdit: true });
    actions.bold!.run();
    actions['clear-formatting']!.run();
    expect(marksOfFirst()).toEqual({});
    expect(view.hasFocus()).toBe(true);
    expect(track).toHaveBeenLastCalledWith('Element', 'Changed', 'TextDocumentFormatClear');
  });

  it('copies and pastes formatting, counting only the paste', () => {
    const { actions } = textDocumentFormatActions(view, readFormatting, { canEdit: true });
    actions.italic!.run();
    vi.mocked(track).mockClear();
    actions['copy-text-formatting']!.run();
    expect(track).not.toHaveBeenCalled();
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7, 12)));
    actions['paste-text-formatting']!.run();
    expect(view.state.doc.firstChild!.lastChild!.marks.map((m) => m.type.name)).toEqual(['italic']);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentFormatPaint');
  });

  it('presses the roller, reads it as pressed, holds it on a double press, and focuses the writing', () => {
    const roller = textDocumentFormatActions(view, readFormatting, { canEdit: true }).actions[
      'paint-format'
    ]!;
    expect(roller.checked).toBe(false);
    roller.run();
    expect(roller.checked).toBe(true);
    expect(view.hasFocus()).toBe(true);
    roller.double!();
    roller.run();
    expect(roller.checked).toBe(false);
    expect(track).not.toHaveBeenCalled();
  });

  it('does nothing once the editor is gone', () => {
    const { actions, fontSize, fontFamily } = textDocumentFormatActions(view, readFormatting, {
      canEdit: true,
    });
    view.destroy();
    actions.bold!.run();
    actions['paint-format']!.run();
    expect(fontSize!.read()).toBeNull();
    expect(fontFamily!.read()).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});
