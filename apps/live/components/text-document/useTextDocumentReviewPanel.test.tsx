// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Reviewing suggestions": the panel opens and closes (closing ends a preview);
// it counts the whole document's suggestions and each tab's; Accept all and Reject all settle every one as one change,
// a Participant's Reject all mine only their own; Previous and Next go on through the tabs.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { INSERTION_MARK } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import type { SuggestionRights } from '@/lib/text-document/text-document-suggestion-cards';
import { useTextDocumentReviewPanel } from './useTextDocumentReviewPanel';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
afterEach(() => vi.mocked(track).mockClear());

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };

/** A doc whose writing holds Ada's suggestion and Ben's. */
function written() {
  const doc = new Y.Doc();
  const write = (fragment: Y.XmlFragment, runs: [string, unknown?][]) => {
    const paragraph = new Y.XmlElement('paragraph');
    const text = new Y.XmlText();
    paragraph.insert(0, [text]);
    fragment.push([paragraph]);
    text.applyDelta(
      runs.map(([insert, mark]) =>
        mark ? { insert, attributes: { [INSERTION_MARK]: mark } } : { insert },
      ),
    );
  };
  write(doc.getXmlFragment('body'), [
    ['a ', { id: 's1', at: 1, author: ADA }],
    ['b', { id: 's2', at: 2, author: BEN }],
  ]);
  return doc;
}

function setUp(rights: SuggestionRights = { accepts: true, ownKey: ADA.key }) {
  const doc = written();
  const go = vi.fn();
  const select = vi.fn();
  const setMode = vi.fn();
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  // Stable as the surface's are: a new one each render would read again each render.
  const props = {
    doc: { current: doc },
    ready: true,
    view: null,
    tab: 't.0',
    tabs: [{ id: 't.0', name: 'Tab 1' }],
    rights,
    cards: { cards: [], selected: null, go, select },
    subscribe,
    preview: { mode: 'show' as const, setMode, previewing: false },
  };
  const hook = renderHook(() => useTextDocumentReviewPanel(props));
  return { doc, go, select, setMode, hook };
}

describe('useTextDocumentReviewPanel', () => {
  it('opens and closes, closing ending a preview', () => {
    const { hook, setMode } = setUp();
    expect(hook.result.current.open).toBe(false);
    act(() => hook.result.current.actions['review-suggested-edits']!.run());
    expect(hook.result.current.open).toBe(true);
    act(() => hook.result.current.close());
    expect(hook.result.current.open).toBe(false);
    expect(setMode).toHaveBeenCalledWith('show');
  });

  it('counts the whole document’s suggestions', () => {
    const { hook } = setUp();
    expect(hook.result.current.count.total).toBe(2);
    expect(hook.result.current.count.tabs).toEqual([{ id: 't.0', name: 'Tab 1', count: 2 }]);
  });

  it('accepts all as one change, tracked once', () => {
    const { doc, hook } = setUp();
    let updates = 0;
    doc.on('update', () => (updates += 1));
    act(() => hook.result.current.acceptAll());
    expect(updates).toBe(1);
    expect(hook.result.current.count.total).toBe(0);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentSuggestionAcceptedAll');
  });

  it('gives a Participant Reject all mine, rejecting only their own, and never Accept all', () => {
    const { hook } = setUp({ accepts: false, ownKey: BEN.key });
    expect(hook.result.current.offers).toEqual({ accept: false, reject: 'mine' });
    act(() => hook.result.current.rejectAll());
    expect(hook.result.current.count.total).toBe(1);
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentSuggestionRejectedAll');
    act(() => hook.result.current.acceptAll());
    expect(hook.result.current.count.total).toBe(1);
  });

  it('offers a Viewer neither', () => {
    const { hook } = setUp({ accepts: false, ownKey: null });
    expect(hook.result.current.offers).toEqual({ accept: false, reject: null });
  });
});
