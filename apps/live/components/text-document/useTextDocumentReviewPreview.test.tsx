// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Reviewing suggestions" (Preview): Preview accept all and reject all bind the
// body to a copy of the writing settled that way, following the document's changes; Show suggested edits, or showing
// another tab, binds it back to the live writing.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { INSERTION_MARK } from '@livedoc/text-documents';
import {
  REVIEW_PREVIEW_REFRESH_MS,
  useTextDocumentReviewPreview,
} from './useTextDocumentReviewPreview';

const ADA = { key: 'k', name: 'Ada', colour: '#0284c7' };

function writtenDoc() {
  const doc = new Y.Doc();
  const paragraph = new Y.XmlElement('paragraph');
  const text = new Y.XmlText();
  paragraph.insert(0, [text]);
  doc.getXmlFragment('body').push([paragraph]);
  text.insert(0, 'kept ');
  text.insert(5, 'new', { [INSERTION_MARK]: { id: 's1', at: 1, author: ADA } });
  return { doc, text };
}

const textOf = (fragment: Y.XmlFragment): string =>
  (((fragment.get(0) as Y.XmlElement).get(0) as Y.XmlText).toDelta() as { insert: string }[])
    .map((op) => op.insert)
    .join('');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useTextDocumentReviewPreview', () => {
  function setUp(tab = 't.0') {
    const { doc, text } = writtenDoc();
    const bind = vi.fn<(fragment: Y.XmlFragment) => void>();
    const ref = { current: doc };
    const hook = renderHook(
      ({ shown, viewing }) => useTextDocumentReviewPreview({ doc: ref, tab: shown, viewing }),
      { initialProps: { shown: tab, viewing: false } },
    );
    hook.result.current.bindBody.current = bind;
    return { doc, text, bind, hook };
  }

  it('binds the body to the writing settled as previewed, and back to the live writing', () => {
    const { doc, bind, hook } = setUp();
    expect(hook.result.current.mode).toBe('show');
    act(() => hook.result.current.setMode('reject-all'));
    expect(hook.result.current.previewing).toBe(true);
    expect(textOf(bind.mock.calls.at(-1)![0])).toBe('kept ');
    act(() => hook.result.current.setMode('accept-all'));
    expect(textOf(bind.mock.calls.at(-1)![0])).toBe('kept new');
    act(() => hook.result.current.setMode('show'));
    expect(bind.mock.calls.at(-1)![0]).toBe(doc.getXmlFragment('body'));
    expect(hook.result.current.previewing).toBe(false);
  });

  it('follows the document’s changes while previewing, at most every refresh', () => {
    const { text, bind, hook } = setUp();
    act(() => hook.result.current.setMode('accept-all'));
    const calls = bind.mock.calls.length;
    act(() => text.insert(0, 'more '));
    expect(bind.mock.calls.length).toBe(calls);
    act(() => {
      vi.advanceTimersByTime(REVIEW_PREVIEW_REFRESH_MS);
    });
    expect(textOf(bind.mock.calls.at(-1)![0])).toBe('more kept new');
  });

  it('returns to the live writing when another tab is shown', () => {
    const { doc, bind, hook } = setUp();
    act(() => hook.result.current.setMode('accept-all'));
    hook.rerender({ shown: 't.1', viewing: false });
    expect(hook.result.current.mode).toBe('show');
    // The surface binds the shown tab's live writing itself; the preview binds nothing more.
    expect(bind.mock.calls.some(([fragment]) => fragment === doc.getXmlFragment('body'))).toBe(
      false,
    );
  });

  it('follows the document in place, without binding again', () => {
    const { text, bind, hook } = setUp();
    act(() => hook.result.current.setMode('reject-all'));
    const fragment = bind.mock.calls.at(-1)![0];
    act(() => {
      text.insert(0, 'more ');
      vi.advanceTimersByTime(REVIEW_PREVIEW_REFRESH_MS);
    });
    expect(bind.mock.calls.at(-1)![0]).toBe(fragment);
    expect(textOf(fragment)).toBe('more kept ');
    expect(hook.result.current.drawn).toBe(fragment.doc);
  });

  describe('in Viewing (review.md "Editing modes")', () => {
    it('draws every pending suggestion rejected, and the live writing again on leaving it', () => {
      const { doc, bind, hook } = setUp();
      hook.rerender({ shown: 't.0', viewing: true });
      expect(textOf(bind.mock.calls.at(-1)![0])).toBe('kept ');
      expect(hook.result.current.previewing).toBe(false);
      expect(hook.result.current.drawn).not.toBeNull();
      hook.rerender({ shown: 't.0', viewing: false });
      expect(bind.mock.calls.at(-1)![0]).toBe(doc.getXmlFragment('body'));
      expect(hook.result.current.drawn).toBeNull();
    });

    it('draws the writing itself while nothing is pending, and settles once a suggestion arrives', () => {
      const { doc, text, bind, hook } = setUp();
      act(() => {
        text.delete(5, 3);
      });
      hook.rerender({ shown: 't.0', viewing: true });
      expect(bind).not.toHaveBeenCalled();
      expect(hook.result.current.drawn).toBeNull();
      act(() => {
        text.insert(0, 'new ', { [INSERTION_MARK]: { id: 's2', at: 2, author: ADA } });
        vi.advanceTimersByTime(REVIEW_PREVIEW_REFRESH_MS);
      });
      expect(textOf(bind.mock.calls.at(-1)![0])).toBe('kept ');
      expect(bind.mock.calls.at(-1)![0]).not.toBe(doc.getXmlFragment('body'));
    });

    it('chooses no preview while Viewing', () => {
      const { bind, hook } = setUp();
      act(() => hook.result.current.setMode('accept-all'));
      hook.rerender({ shown: 't.0', viewing: true });
      expect(hook.result.current.mode).toBe('show');
      expect(textOf(bind.mock.calls.at(-1)![0])).toBe('kept ');
    });

    it('lets the writing go when another tab is shown with nothing pending there', () => {
      const { text, bind, hook } = setUp();
      hook.rerender({ shown: 't.0', viewing: true });
      const calls = bind.mock.calls.length;
      act(() => {
        text.delete(5, 3);
      });
      hook.rerender({ shown: 't.1', viewing: true });
      expect(bind.mock.calls.length).toBe(calls);
      expect(hook.result.current.drawn).toBeNull();
    });
  });
});
