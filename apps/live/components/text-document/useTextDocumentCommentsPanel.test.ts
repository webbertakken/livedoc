// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "The comments panel": rows while open, read again as the writing changes;
// filters kept; the tab list.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { LiveThreads, TextDocumentState, type DocumentTab } from '@livedoc/text-documents';
import { useTextDocumentCommentsPanel } from './useTextDocumentCommentsPanel';

function documentWithThread() {
  const doc = TextDocumentState.load();
  TextDocumentState.replaceBody(doc, [{ text: 'quarterly results' }]);
  const node = (TextDocumentState.body(doc).get(0) as Y.XmlElement).get(0) as Y.XmlText;
  const at = (i: number, assoc: number) =>
    Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(node, i, assoc));
  LiveThreads.begin(
    doc,
    {
      id: 'a',
      tab: 't.0',
      start: at(0, 0),
      end: at(8, -1),
      quote: 'quarterly',
      comment: { id: 'c', text: 'hm', at: 1, author: { key: 'k', name: 'Ada', colour: '#000' } },
    },
    null,
  );
  return { doc, node };
}

const TABS: DocumentTab[] = [
  { id: 't.0', name: 'One', depth: 0, body: [] },
  { id: 't.b', name: 'Two', depth: 0, body: [] },
];

describe('useTextDocumentCommentsPanel', () => {
  it('keeps no rows while closed, and reads them once open', () => {
    const { doc } = documentWithThread();
    const docRef = { current: doc };
    const listeners = new Set<() => void>();
    const subscribe = (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    };
    const threads = LiveThreads.read(doc);
    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useTextDocumentCommentsPanel({
          open,
          doc: docRef,
          ready: true,
          threads,
          tabs: TABS,
          subscribe,
        }),
      { initialProps: { open: false } },
    );
    expect(result.current.rows).toEqual([]);
    expect(listeners.size).toBe(0);
    rerender({ open: true });
    expect(result.current.rows.map((r) => r.id)).toEqual(['a']);
    expect(listeners.size).toBe(1);
    expect(result.current.groups).toEqual([
      { id: 't.0', label: 'One' },
      { id: 't.b', label: 'Two' },
    ]);
  });

  it('reads a deleted stretch again as the writing changes', async () => {
    const { doc, node } = documentWithThread();
    const docRef = { current: doc };
    let told = () => {};
    const subscribe = (l: () => void) => {
      told = l;
      return () => {};
    };
    const threads = LiveThreads.read(doc);
    const { result } = renderHook(() =>
      useTextDocumentCommentsPanel({
        open: true,
        doc: docRef,
        ready: true,
        threads,
        tabs: TABS,
        subscribe,
      }),
    );
    expect(result.current.rows[0]!.deleted).toBe(false);
    node.delete(0, 9);
    await act(async () => {
      told();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(result.current.rows[0]!.deleted).toBe(true);
  });

  it('keeps the filters it is given', () => {
    const { doc } = documentWithThread();
    const docRef = { current: doc };
    const subscribe = () => () => {};
    const { result } = renderHook(() =>
      useTextDocumentCommentsPanel({
        open: false,
        doc: docRef,
        ready: true,
        threads: [],
        tabs: [],
        subscribe,
      }),
    );
    act(() => result.current.setFilters({ who: 'for-you', state: 'open', group: null }));
    expect(result.current.filters).toEqual({ who: 'for-you', state: 'open', group: null });
  });
});
