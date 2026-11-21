// @vitest-environment jsdom
// docs/specs/004-interface-design/fonts.md "Substitution": a family the document's text names that LiveDoc does not
// serve loads from Google Fonts, as the document opens and as its text changes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { TextDocument, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { createTextDocumentChanges } from './text-document-changes';
import { documentFamiliesOf, useGoogleDocumentFonts } from './useGoogleDocumentFonts';

const loadGoogleFamilies = vi.hoisted(() => vi.fn(async (_names: readonly string[]) => {}));
vi.mock('@/lib/document-fonts/google-families', () => ({ loadGoogleFamilies }));

const fontMark = (family: string) => schema.marks.font!.create({ value: family });
const paragraph = (text: string, family?: string) =>
  schema.nodes.paragraph!.create(null, schema.text(text, family ? [fontMark(family)] : []));

afterEach(() => {
  vi.useRealTimers();
  loadGoogleFamilies.mockClear();
});

describe('documentFamiliesOf', () => {
  it('names the families of the defaults, the styles and the text, each once', () => {
    const blank = TextDocument.blank({ format: 'odf' });
    const styles = blank.styles.map((s, i) =>
      i === 0
        ? { ...s, text: { ...s.text, font: 'Lobster' } }
        : { ...s, text: { ...s.text, font: '' } },
    );
    const doc = schema.node('doc', null, [
      paragraph('a', 'Rubik'),
      paragraph('b', 'Rubik'),
      paragraph('c'),
    ]);
    expect(documentFamiliesOf(doc, { styles, defaults: blank.defaults }).sort()).toEqual(
      ['Arial', 'Lobster', 'Rubik'].sort(),
    );
  });
});

describe('useGoogleDocumentFonts', () => {
  it('loads the families as the document opens, then once its text settles after a change', () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    const changes = createTextDocumentChanges();
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        doc: schema.node('doc', null, [paragraph('a', 'Rubik')]),
        plugins: [changes.plugin],
      }),
    });
    const blank = TextDocument.blank({ format: 'odf' });
    const live = { current: TextDocumentState.load([TextDocumentState.fromDocument(blank)]) };
    const { unmount } = renderHook(() =>
      useGoogleDocumentFonts(view, live, 'odf', changes.subscribe),
    );
    expect(loadGoogleFamilies).toHaveBeenCalledTimes(1);
    expect(loadGoogleFamilies.mock.calls[0]![0]).toContain('Rubik');
    view.dispatch(view.state.tr.insertText('b', 1).addMark(1, 2, fontMark('Pacifico')));
    view.dispatch(view.state.tr.insertText('c', 1));
    // The writing tells of its changes after the frame that paints them (performance.md "A keystroke's frame").
    vi.advanceTimersToNextFrame();
    vi.runOnlyPendingTimers();
    vi.advanceTimersByTime(499);
    expect(loadGoogleFamilies).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(loadGoogleFamilies).toHaveBeenCalledTimes(2);
    unmount();
    view.dispatch(view.state.tr.insertText('d', 1));
    vi.advanceTimersByTime(1000);
    expect(loadGoogleFamilies).toHaveBeenCalledTimes(2);
    view.destroy();
  });

  it('does nothing without an editor', () => {
    renderHook(() => useGoogleDocumentFonts(null, { current: null }, 'odf', () => () => {}));
    expect(loadGoogleFamilies).not.toHaveBeenCalled();
  });
});
