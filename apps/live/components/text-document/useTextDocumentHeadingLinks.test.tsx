// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Heading links", "Share roles", "Telemetry": Copy heading link
// while the caret is in a heading copies the document's address with `#heading=<id>`, giving the heading its id when
// it has none (no undo step), counted; a session that may not edit copies only an id given already; the link editor's
// headings come before the bookmarks, a heading without an id offered by the name it gains when claimed; a link's
// title is its heading's text; the address's hash goes to the heading.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import {
  HEADING_LINK_COPY_ITEM,
  headingIdOf,
} from '@/lib/text-document/text-document-heading-links';
import type { BookmarkPlaces } from './useTextDocumentHeadingLinks';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const { useTextDocumentHeadingLinks } = await import('./useTextDocumentHeadingLinks');

const mark = (name: string) => schema.nodes.bookmark!.create({ name });
const para = (level: number | null, ...parts: (string | PmNode)[]) =>
  schema.nodes.paragraph!.create(
    level === null ? {} : { props: { outlineLevel: level } },
    parts.map((part) => (typeof part === 'string' ? schema.text(part) : part)),
  );

function setup({ at = 2, writes = true, ready = false } = {}) {
  // Intro (0..7), a heading with an id (7..), a heading without one.
  const doc = schema.node('doc', null, [
    para(null, 'Intro'),
    para(1, mark('_given'), 'Chapter one'),
    para(2, 'Chapter two'),
  ]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, at) }),
  });
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const bookmarks: BookmarkPlaces = {
    goTo: vi.fn(() => true),
    targets: () => [{ name: 'bm1', label: 'A chapter bookmark' }],
    label: (name) => (name === 'bm1' ? 'A chapter bookmark' : null),
  };
  const hook = renderHook(() =>
    useTextDocumentHeadingLinks({
      view,
      writes,
      ready,
      documentId: 'doc1',
      readStyles: () => [],
      subscribe,
      bookmarks,
    }),
  );
  const moveTo = (pos: number) =>
    act(() => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
      for (const listener of listeners) listener();
    });
  return { view, hook, moveTo, bookmarks };
}

const writeText = vi.fn(() => Promise.resolve());
beforeEach(() => {
  track.mockReset();
  writeText.mockClear();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = '';
});

const address = (id: string) => `${window.location.origin}/document/doc1#heading=${id}`;

describe('useTextDocumentHeadingLinks', () => {
  it('offers Copy heading link only in a heading', () => {
    const { hook, moveTo } = setup();
    expect(hook.result.current.actions[HEADING_LINK_COPY_ITEM]).toBeUndefined();
    moveTo(12);
    expect(hook.result.current.actions[HEADING_LINK_COPY_ITEM]).toBeDefined();
  });

  it('copies a heading’s address with its id, counted', async () => {
    const { hook, moveTo } = setup();
    moveTo(12);
    act(() => hook.result.current.actions[HEADING_LINK_COPY_ITEM]!.run());
    expect(writeText).toHaveBeenCalledWith(address('_given'));
    await waitFor(() =>
      expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentHeadingLinkCopied'),
    );
  });

  it('gives a heading without an id one, as no step to undo, and copies it', () => {
    const { view, hook, moveTo } = setup();
    moveTo(24);
    const before = view.state.doc.textContent;
    let recorded: unknown = 'none';
    const dispatch = view.dispatch.bind(view);
    view.dispatch = (tr) => {
      if (tr.docChanged) recorded = tr.getMeta('addToHistory');
      dispatch(tr);
    };
    act(() => hook.result.current.actions[HEADING_LINK_COPY_ITEM]!.run());
    const id = headingIdOf(view.state.doc.child(2));
    expect(id).toMatch(/^_[a-z][a-z0-9]{11}$/);
    expect(recorded).toBe(false);
    expect(view.state.doc.textContent).toBe(before);
    expect(writeText).toHaveBeenCalledWith(address(id!));
  });

  it('lets a session that may not edit copy only an id given already', () => {
    const { hook, moveTo } = setup({ writes: false });
    moveTo(24);
    expect(hook.result.current.actions[HEADING_LINK_COPY_ITEM]).toBeUndefined();
    moveTo(12);
    act(() => hook.result.current.actions[HEADING_LINK_COPY_ITEM]!.run());
    expect(writeText).toHaveBeenCalledWith(address('_given'));
  });

  it('offers the headings, then the bookmarks; claiming a heading gives it the name offered', () => {
    const { view, hook } = setup();
    const offered = hook.result.current.places.targets('chapter');
    expect(offered.map((t) => [t.group, t.label])).toEqual([
      ['headings', 'Chapter one'],
      ['headings', 'Chapter two'],
      ['bookmarks', 'A chapter bookmark'],
    ]);
    expect(offered[0]!.name).toBe('_given');
    const pending = offered[1]!.name;
    act(() => hook.result.current.places.claim(pending));
    expect(headingIdOf(view.state.doc.child(2))).toBe(pending);
  });

  it('claims nothing for a session that may not edit', () => {
    const { view, hook } = setup({ writes: false });
    const pending = hook.result.current.places.targets('two')[0]!.name;
    act(() => hook.result.current.places.claim(pending));
    expect(headingIdOf(view.state.doc.child(2))).toBeNull();
  });

  it('titles a link by its heading’s text, else by the bookmarks', () => {
    const { hook } = setup();
    expect(hook.result.current.places.label('_given')).toBe('Chapter one');
    expect(hook.result.current.places.label('bm1')).toBe('A chapter bookmark');
    expect(hook.result.current.places.label('gone')).toBeNull();
  });

  it('goes to the heading the address names once the writing is drawn', async () => {
    window.location.hash = '#heading=_given';
    const { bookmarks } = setup({ ready: true });
    await waitFor(() => expect(bookmarks.goTo).toHaveBeenCalledWith('_given'));
  });
});
