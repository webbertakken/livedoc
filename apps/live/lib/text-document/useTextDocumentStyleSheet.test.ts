// @vitest-environment jsdom
// docs/specs/034-text-documents/text-and-paragraphs.md "Paragraph styles": the open body draws in its styles, and again
// as they change.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { TextDocument, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { useTextDocumentStyleSheet } from './useTextDocumentStyleSheet';

afterEach(() => vi.useRealTimers());

const viewOf = () =>
  new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc: schema.node('doc', null, [schema.nodes.paragraph!.create()]),
    }),
  });

describe('useTextDocumentStyleSheet', () => {
  it('writes the sheet scoped to the body, again once a frame after a change, and takes it away', () => {
    vi.useFakeTimers();
    const view = viewOf();
    const blank = TextDocument.blank({ format: 'odf' });
    const live = { current: TextDocumentState.load([TextDocumentState.fromDocument(blank)]) };
    const { unmount } = renderHook(() => useTextDocumentStyleSheet(view, live, 'odf'));
    const scope = view.dom.getAttribute('data-text-document-styles')!;
    const sheet = document.head.querySelector<HTMLStyleElement>(
      'style[data-text-document-styles]',
    )!;
    expect(sheet.textContent).toContain(`[data-text-document-styles="${scope}"] p {`);
    const quote = {
      id: 'Quote',
      name: 'Quote',
      family: 'paragraph' as const,
      paragraph: {},
      text: { italic: true },
    };
    TextDocumentState.addStyle(live.current, quote);
    TextDocumentState.addStyle(live.current, { ...quote, id: 'Quote2' });
    expect(sheet.textContent).not.toContain('Quote');
    vi.advanceTimersByTime(20);
    expect(sheet.textContent).toContain('p[data-style="Quote2"]');
    TextDocumentState.addStyle(live.current, { ...quote, id: 'Quote3' });
    unmount();
    expect(document.head.querySelector('style[data-text-document-styles]')).toBeNull();
    view.destroy();
  });

  it('writes nothing without an editor', () => {
    renderHook(() => useTextDocumentStyleSheet(null, { current: null }, 'odf'));
    expect(document.head.querySelector('style[data-text-document-styles]')).toBeNull();
  });
});
