// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "The comments panel" (a press goes to a thread), "Keys on a selected
// comment" (next, previous, enter current, exit): which thread is selected, the card asked for focus, the writing's
// selection on a resolved thread, another tab shown first, and the shortcuts bound only while there are threads.
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import { LiveThreads, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { anchorsOf, threadHighlightPlugin } from '@/lib/text-document/text-document-threads';
import type { TextDocumentCommenter } from '@/lib/text-document/text-document-commenter';
import { useTextDocumentThreads } from './useTextDocumentThreads';
import {
  ENTER_CURRENT_COMMENT,
  MOVE_TO_NEXT_COMMENT,
  MOVE_TO_PREVIOUS_COMMENT,
  TEXT_GONE,
  useTextDocumentThreadKeys,
} from './useTextDocumentThreadKeys';

const ADA: TextDocumentCommenter = {
  key: 'k',
  name: 'Ada',
  colour: '#0284c7',
  mayDeleteAny: false,
};
const views: EditorView[] = [];
afterEach(() => views.splice(0).forEach((v) => v.destroy()));

async function editor() {
  const doc = TextDocumentState.load();
  TextDocumentState.replaceBody(doc, [{ text: 'alpha beta gamma delta' }]);
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      schema: textDocumentSchema,
      plugins: [
        ySyncPlugin(TextDocumentState.body(doc)),
        threadHighlightPlugin({ onSelect: () => {} }),
      ],
    }),
  });
  views.push(view);
  await new Promise((resolve) => setTimeout(resolve, 0));
  // alpha 1..6, beta 7..11, gamma 12..17, delta 18..23.
  const begin = (id: string, from: number, to: number, tab = 't.0') =>
    LiveThreads.begin(
      doc,
      {
        id,
        tab,
        ...anchorsOf(view.state, from, to)!,
        comment: { id: `${id}.c`, text: id, at: from, author: ADA },
      },
      null,
    );
  return { doc, view, begin };
}

function keysOn(at: Awaited<ReturnType<typeof editor>>) {
  const docRef = { current: at.doc };
  const showTab = vi.fn();
  const subscribe = () => () => {};
  const hook = renderHook(
    ({ tab }: { tab: string }) => {
      const threads = useTextDocumentThreads({
        view: at.view,
        activeView: at.view,
        doc: docRef,
        ready: true,
        tab,
        commenter: ADA,
        subscribe,
      });
      const keys = useTextDocumentThreadKeys({ view: at.view, threads, tab, showTab });
      return { threads, keys };
    },
    { initialProps: { tab: 't.0' } },
  );
  return { ...hook, showTab };
}

const caretAt = (view: EditorView, pos: number) =>
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));

describe('useTextDocumentThreadKeys', () => {
  it('goes to an open thread: selected, its card asked for focus', async () => {
    const at = await editor();
    at.begin('b', 7, 11);
    const { result } = keysOn(at);
    act(() => result.current.keys.go('b'));
    expect(result.current.threads.selected).toBe('b');
    expect(result.current.keys.focusRequest).toMatchObject({ id: 'b' });
  });

  it('goes to a resolved thread by selecting its text in the writing', async () => {
    const at = await editor();
    at.begin('b', 7, 11);
    LiveThreads.resolve(at.doc, 'b', true, null);
    const { result } = keysOn(at);
    act(() => result.current.keys.go('b'));
    expect(result.current.threads.selected).toBeNull();
    const { from, to } = at.view.state.selection;
    expect(at.view.state.doc.textBetween(from, to)).toBe('beta');
  });

  it('says so when a thread’s text no longer resolves, and ignores one that is not there', async () => {
    const at = await editor();
    LiveThreads.begin(
      at.doc,
      {
        id: 'lost',
        tab: 't.0',
        start: new Uint8Array([1]),
        end: new Uint8Array([1]),
        quote: 'x',
        comment: { id: 'c', text: 'x', at: 1, author: ADA },
      },
      null,
    );
    const { result } = keysOn(at);
    act(() => result.current.keys.go('lost'));
    expect(render(result.current.threads.status).container.textContent).toBe(TEXT_GONE);
    act(() => result.current.keys.go('none'));
    expect(result.current.threads.selected).toBeNull();
  });

  it('shows another tab first, then goes once its writing is there', async () => {
    const at = await editor();
    at.begin('b', 7, 11, 't.b');
    const { result, showTab, rerender } = keysOn(at);
    act(() => result.current.keys.go('b'));
    expect(showTab).toHaveBeenCalledWith('t.b');
    expect(result.current.threads.selected).toBeNull();
    // The tab shown is now t.b (the stand-in editor still holds the writing).
    rerender({ tab: 't.b' });
    await waitFor(() => expect(result.current.threads.selected).toBe('b'));
  });

  it('steps to the next and previous thread from the caret, then from the selected one, never wrapping', async () => {
    const at = await editor();
    at.begin('a', 1, 6);
    at.begin('c', 12, 17);
    at.begin('d', 18, 23);
    const { result } = keysOn(at);
    caretAt(at.view, 8);
    act(() => result.current.keys.actions[MOVE_TO_NEXT_COMMENT]!.run());
    expect(result.current.threads.selected).toBe('c');
    act(() => result.current.keys.step(true));
    expect(result.current.threads.selected).toBe('d');
    act(() => result.current.keys.step(true));
    expect(result.current.threads.selected).toBe('d');
    act(() => result.current.keys.actions[MOVE_TO_PREVIOUS_COMMENT]!.run());
    act(() => result.current.keys.step(false));
    act(() => result.current.keys.step(false));
    expect(result.current.threads.selected).toBe('a');
  });

  it('enters the thread whose text holds the caret, and lets it go on exit', async () => {
    const at = await editor();
    at.begin('c', 12, 17);
    const { result } = keysOn(at);
    caretAt(at.view, 3);
    act(() => result.current.keys.actions[ENTER_CURRENT_COMMENT]!.run());
    expect(result.current.threads.selected).toBeNull();
    caretAt(at.view, 14);
    act(() => result.current.keys.actions[ENTER_CURRENT_COMMENT]!.run());
    expect(result.current.threads.selected).toBe('c');
    act(() => result.current.keys.exit());
    expect(result.current.threads.selected).toBeNull();
  });

  it('binds the shortcuts only while there are threads in the writing', async () => {
    const at = await editor();
    const { result } = keysOn(at);
    expect(result.current.keys.actions).toEqual({});
  });
});
