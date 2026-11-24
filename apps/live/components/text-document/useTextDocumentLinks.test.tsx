// @vitest-environment jsdom
// docs/specs/034-text-documents/links-and-navigation.md "Links", "Share roles", "Telemetry": the link editor opens on
// the selection or the link at the caret, applies Text and Link as one change, refuses what is no address, offers the
// person's documents as Link is typed in; the link card under a link at the caret (Show link details) names a LiveDoc
// document, copies, edits and removes; Alt+Enter opens the link; a session that may not edit only opens and copies.
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import {
  LINK_COPY_ITEM,
  LINK_EDIT_ITEM,
  LINK_INSERT_ITEM,
  LINK_ITEM,
  LINK_REFUSED,
  LINK_REMOVE_ITEM,
  OPEN_LINK,
  documentAddress,
} from '@/lib/text-document/text-document-links';

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const { useTextDocumentLinks } = await import('./useTextDocumentLinks');

const linked = (text: string, href: string) =>
  schema.text(text, [schema.marks.link!.create({ href })]);
const p = (...parts: (string | PmNode)[]) =>
  schema.nodes.paragraph!.create(
    {},
    parts.map((part) => (typeof part === 'string' ? schema.text(part) : part)),
  );

const DOCUMENTS = [
  { id: 'd1', name: 'Team plan', savedAt: 1 },
  { id: 'd2', name: 'Budget', savedAt: 2 },
];

function setup({
  doc = schema.node('doc', null, [p('see site now')]),
  from = 5,
  to = undefined as number | undefined,
  writes = true,
  showCard = true,
} = {}) {
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, from, to ?? from) }),
  });
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const hook = renderHook(
    (props: { showCard: boolean }) =>
      useTextDocumentLinks({
        view,
        writes,
        documents: DOCUMENTS,
        subscribe,
        showCard: props.showCard,
      }),
    { initialProps: { showCard } },
  );
  const moveTo = (at: number) =>
    act(() => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
      for (const listener of listeners) listener();
    });
  const drawn = () =>
    render(
      <>
        {hook.result.current.editor}
        {hook.result.current.card}
      </>,
    );
  return { view, hook, moveTo, drawn };
}

// Each text node of the first paragraph as [text, href | null].
const runs = (view: EditorView) => {
  const out: [string, string | null][] = [];
  view.state.doc.child(0).forEach((node) => {
    const mark = node.marks.find((m) => m.type.name === 'link');
    out.push([node.text ?? '', mark ? (mark.attrs as { href: string }).href : null]);
  });
  return out;
};

beforeEach(() => {
  track.mockReset();
  vi.spyOn(EditorView.prototype, 'coordsAtPos').mockReturnValue({
    left: 10,
    right: 10,
    top: 20,
    bottom: 30,
  });
});
afterEach(() => vi.restoreAllMocks());

describe('useTextDocumentLinks', () => {
  it('opens and copies only, for a session that may not edit', () => {
    const { hook } = setup({ writes: false });
    expect(Object.keys(hook.result.current.actions).sort()).toEqual(
      [LINK_COPY_ITEM, OPEN_LINK].sort(),
    );
  });

  it('links a selection to a bare domain, as https, in one change, counted as added', () => {
    const { view, hook, drawn } = setup({ from: 5, to: 9 });
    act(() => hook.result.current.actions[LINK_ITEM]!.run());
    drawn();
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Text' }).value).toBe('site');
    const link = screen.getByRole<HTMLInputElement>('combobox', { name: 'Link' });
    expect(link.placeholder).toBe('Search or paste a link');
    fireEvent.change(link, { target: { value: 'example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(runs(view)).toEqual([
      ['see ', null],
      ['site', 'https://example.com'],
      [' now', null],
    ]);
    expect(track).toHaveBeenCalledWith('Element', 'Added', 'TextDocumentLink');
  });

  it('refuses what is no web, email or LiveDoc address, under Link, changing nothing', () => {
    const { view, hook, drawn } = setup({ from: 5, to: 9 });
    act(() => hook.result.current.actions[LINK_ITEM]!.run());
    drawn();
    const link = screen.getByRole<HTMLInputElement>('combobox', { name: 'Link' });
    fireEvent.change(link, { target: { value: 'javascript:alert(1)' } });
    fireEvent.submit(link.form!);
    expect(screen.getByRole('alert').textContent).toBe(LINK_REFUSED);
    expect(link.getAttribute('aria-invalid')).toBe('true');
    expect(view.state.doc.textContent).toBe('see site now');
    expect(runs(view).every(([, href]) => href === null)).toBe(true);
    expect(track).not.toHaveBeenCalled();
  });

  it('offers the person’s documents as Link is typed in; Enter takes one, naming an empty Text', () => {
    const { view, hook, drawn } = setup({ from: 3 });
    act(() => hook.result.current.actions[LINK_ITEM]!.run());
    drawn();
    const link = screen.getByRole<HTMLInputElement>('combobox', { name: 'Link' });
    fireEvent.change(link, { target: { value: 'plan' } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Team plan']);
    expect(link.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(link, { key: 'Enter' });
    const address = documentAddress('d1', window.location.origin);
    expect(link.value).toBe(address);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Text' }).value).toBe('Team plan');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.submit(link.form!);
    expect(runs(view)).toEqual([
      ['se', null],
      ['Team plan', address],
      ['e site now', null],
    ]);
  });

  it('closes on Escape, changing nothing', () => {
    const { view, hook, drawn } = setup({ from: 5, to: 9 });
    act(() => hook.result.current.actions[LINK_ITEM]!.run());
    const { rerender } = drawn();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Link' }), { key: 'Escape' });
    rerender(<>{hook.result.current.editor}</>);
    expect(screen.queryByRole('form', { name: 'Link' })).toBeNull();
    expect(view.state.doc.textContent).toBe('see site now');
  });

  describe('on a link', () => {
    const doc = () =>
      schema.node('doc', null, [
        p('see ', linked('plan', documentAddress('d1', window.location.origin)), ' now'),
      ]);

    it('shows the card under it, naming the LiveDoc document, while Show link details is on', () => {
      const { hook, drawn } = setup({ doc: doc(), from: 6 });
      drawn();
      const card = screen.getByRole('group', { name: 'Link details' });
      expect(card.querySelector('a')?.textContent).toBe('Team plan');
      for (const name of ['Copy link', 'Edit link', 'Remove link'])
        expect(screen.getByRole('button', { name })).toBeTruthy();
      hook.rerender({ showCard: false });
      expect(hook.result.current.card).toBeNull();
    });

    it('hides the card on Escape until the caret moves', () => {
      const { view, hook, moveTo } = setup({ doc: doc(), from: 6 });
      act(() => {
        view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
      expect(hook.result.current.card).toBeNull();
      moveTo(7);
      expect(hook.result.current.card).not.toBeNull();
    });

    it('shows no card off a link, nor over a selection', () => {
      const { hook, moveTo } = setup({ doc: doc(), from: 2 });
      expect(hook.result.current.card).toBeNull();
      expect(hook.result.current.actions[OPEN_LINK]!.disabled).toBe(true);
      moveTo(7);
      expect(hook.result.current.card).not.toBeNull();
      expect(hook.result.current.actions[OPEN_LINK]!.disabled).toBe(false);
    });

    it('offers Copy link alone on the card for a session that may not edit', () => {
      const { drawn } = setup({ doc: doc(), from: 6, writes: false });
      drawn();
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Edit link' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Remove link' })).toBeNull();
    });

    it('removes the link from the card, the text staying, counted as removed', () => {
      const { view, drawn } = setup({ doc: doc(), from: 6 });
      drawn();
      fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
      expect(runs(view).every(([, href]) => href === null)).toBe(true);
      expect(view.state.doc.textContent).toBe('see plan now');
      expect(track).toHaveBeenCalledWith('Element', 'Removed', 'TextDocumentLink');
    });

    it('edits the link’s whole text and address, counted as changed', () => {
      const { view, hook, drawn } = setup({ doc: doc(), from: 6 });
      drawn();
      fireEvent.click(screen.getByRole('button', { name: 'Edit link' }));
      const { unmount } = render(<>{hook.result.current.editor}</>);
      const text = screen.getAllByRole<HTMLInputElement>('textbox', { name: 'Text' }).at(-1)!;
      expect(text.value).toBe('plan');
      fireEvent.change(text, { target: { value: 'the plan' } });
      const link = screen.getAllByRole<HTMLInputElement>('combobox', { name: 'Link' }).at(-1)!;
      fireEvent.change(link, { target: { value: 'https://b.test' } });
      fireEvent.submit(link.form!);
      expect(runs(view)).toEqual([
        ['see ', null],
        ['the plan', 'https://b.test'],
        [' now', null],
      ]);
      expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentLink');
      unmount();
    });

    it('copies the address', async () => {
      const writeText = vi.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const { hook, drawn } = setup({ doc: doc(), from: 6 });
      drawn();
      fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
      expect(writeText).toHaveBeenCalledWith(documentAddress('d1', window.location.origin));
      await act(() => Promise.resolve());
      render(<>{hook.result.current.status}</>);
      expect(screen.getByRole('status').textContent).toBe('Link copied');
    });

    it('opens the link at the caret (Alt+Enter) in a new tab with no opener, counted', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      const { hook } = setup({ doc: doc(), from: 6 });
      act(() => hook.result.current.actions[OPEN_LINK]!.run());
      expect(open).toHaveBeenCalledWith(
        documentAddress('d1', window.location.origin),
        '_blank',
        'noopener,noreferrer',
      );
      expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentLinkOpened');
    });

    it('offers Edit link, Copy link and Remove link in the context menu, Insert link off a link', () => {
      const { hook, moveTo } = setup({ doc: doc(), from: 6 });
      const on = hook.result.current.actions;
      expect(on[LINK_EDIT_ITEM]!.disabled).toBe(false);
      expect(on[LINK_INSERT_ITEM]!.disabled).toBe(true);
      expect(on[LINK_REMOVE_ITEM]!.disabled).toBe(false);
      moveTo(2);
      const off = hook.result.current.actions;
      expect(off[LINK_EDIT_ITEM]!.disabled).toBe(true);
      expect(off[LINK_INSERT_ITEM]!.disabled).toBe(false);
      expect(off[LINK_COPY_ITEM]!.disabled).toBe(true);
    });
  });
});
