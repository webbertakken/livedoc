// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Bookmarks", "Share roles", "Telemetry": Insert > Bookmark is an
// Editor's, one undo step, counted; the card beside a caret at a bookmark copies the document's address with
// `#bookmark=<name>` and, for an Editor, removes it; Escape hides it until the caret moves; a `#name` link and the
// address's hash go to the bookmark; a link to one that is gone opens nothing.
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import {
  BOOKMARK_ITEM,
  bookmarkNames,
  bookmarkPosition,
} from '@/lib/text-document/text-document-bookmarks';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const { useTextDocumentBookmarks } = await import('./useTextDocumentBookmarks');

const mark = (name: string) => schema.nodes.bookmark!.create({ name });
const p = (...parts: (string | PmNode)[]) =>
  schema.nodes.paragraph!.create(
    {},
    parts.map((part) => (typeof part === 'string' ? schema.text(part) : part)),
  );

function setup({ at = 1, writes = true, ready = false } = {}) {
  const doc = schema.node('doc', null, [p('Intro'), p(mark('chap1'), 'Chapter one')]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, at) }),
  });
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const hook = renderHook(() =>
    useTextDocumentBookmarks({ view, writes, ready, documentId: 'doc1', subscribe }),
  );
  const moveTo = (pos: number) =>
    act(() => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
      for (const listener of listeners) listener();
    });
  return { view, hook, moveTo };
}

beforeEach(() => {
  track.mockReset();
  vi.spyOn(EditorView.prototype, 'coordsAtPos').mockReturnValue({
    left: 10,
    right: 10,
    top: 20,
    bottom: 30,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('useTextDocumentBookmarks', () => {
  it('puts a bookmark in at the caret for an Editor, counted', () => {
    const { view, hook } = setup({ at: 3 });
    act(() => hook.result.current.actions[BOOKMARK_ITEM]!.run());
    expect(bookmarkNames(view.state.doc).size).toBe(2);
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentBookmark');
  });

  it('binds no Insert > Bookmark for anyone who may not edit', () => {
    expect(setup({ writes: false }).hook.result.current.actions).toEqual({});
  });

  it('shows the card beside a bookmark; Copy link copies the address with #bookmark=', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { hook, moveTo } = setup();
    expect(hook.result.current.card).toBeNull();
    moveTo(9);
    render(<>{hook.result.current.card}</>);
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/document/doc1#bookmark=chap1`,
    );
  });

  it('removes the bookmark from its card, counted', () => {
    const { view, hook, moveTo } = setup();
    moveTo(9);
    render(<>{hook.result.current.card}</>);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(bookmarkNames(view.state.doc).size).toBe(0);
    expect(view.state.doc.textContent).toBe('IntroChapter one');
    expect(track).toHaveBeenCalledWith('Element', 'Removed', 'TextDocumentBookmark');
  });

  it('offers no Remove to anyone who may not edit', () => {
    const { hook, moveTo } = setup({ writes: false });
    moveTo(9);
    render(<>{hook.result.current.card}</>);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });

  it('hides the card on Escape until the caret moves', () => {
    const { view, hook, moveTo } = setup();
    moveTo(9);
    act(() => {
      view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(hook.result.current.card).toBeNull();
    moveTo(8);
    expect(hook.result.current.card).not.toBeNull();
  });

  it('goes to a bookmark by its name, the caret at it; none for one gone', () => {
    const { view, hook } = setup();
    expect(hook.result.current.places.goTo('chap1')).toBe(true);
    expect(view.state.selection.from).toBe(bookmarkPosition(view.state.doc, 'chap1')! + 1);
    expect(hook.result.current.places.goTo('gone')).toBe(false);
    expect(hook.result.current.places.label('chap1')).toBe('Chapter one');
    expect(hook.result.current.places.targets('chap').map((t) => t.name)).toEqual(['chap1']);
  });

  it('goes to the bookmark the address names once the writing is drawn', async () => {
    window.location.hash = '#bookmark=chap1';
    const { view } = setup({ ready: true });
    await vi.waitFor(() =>
      expect(view.state.selection.from).toBe(bookmarkPosition(view.state.doc, 'chap1')! + 1),
    );
  });
});
