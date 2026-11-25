// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Threads in the margin", "How a comment is kept": Add comment on the body's
// selection or the word at the caret, a draft sent as a thread signed with the commenter's key, replies, edits,
// deletes and resolves beside the writing (never an undo step of it), telemetry, and who may comment.
import { act, render, renderHook } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import { LiveThreads, TEXT_DOCUMENT_THREADS_MAX, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import {
  threadHighlightKey,
  threadHighlightPlugin,
} from '@/lib/text-document/text-document-threads';
import {
  COMMENT_ITEM,
  COMMENTS_FULL,
  NOTHING_TO_COMMENT_ON,
  THREADS_ORIGIN,
  useTextDocumentThreads,
} from './useTextDocumentThreads';
import type { TextDocumentCommenter } from '@/lib/text-document/text-document-commenter';

const tracked = vi.hoisted(() => [] as string[][]);
vi.mock('@/lib/telemetry', () => ({
  track: (...args: string[]) => tracked.push(args),
}));

const ADA: TextDocumentCommenter = {
  key: 'k-ada',
  name: 'Ada',
  colour: '#0284c7',
  mayDeleteAny: false,
};
const views: EditorView[] = [];
beforeEach(() => tracked.splice(0));
afterEach(() => views.splice(0).forEach((v) => v.destroy()));

async function editor(text = 'quarterly results are in') {
  const doc = TextDocumentState.load();
  TextDocumentState.replaceBody(doc, [{ text }]);
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
  return { doc, view };
}

const noSubscribe = () => () => {};
const renderStatus = (status: ReactElement) => render(status);

function threadsOn(
  { doc, view }: Awaited<ReturnType<typeof editor>>,
  commenter: TextDocumentCommenter | null = ADA,
  activeView: EditorView | null = view,
) {
  const docRef = { current: doc };
  return renderHook(() =>
    useTextDocumentThreads({
      view,
      activeView,
      doc: docRef,
      ready: true,
      tab: 't.0',
      commenter,
      subscribe: noSubscribe,
    }),
  );
}

describe('useTextDocumentThreads', () => {
  it('opens a draft on the selection, and sends it as a thread signed with the commenter’s key', async () => {
    const at = await editor();
    at.view.dispatch(
      at.view.state.tr.setSelection(TextSelection.create(at.view.state.doc, 11, 18)),
    );
    const { result } = threadsOn(at);
    act(() => result.current.actions[COMMENT_ITEM]!.run());
    expect(result.current.draft).toMatchObject({ from: 11, to: 18, quote: 'results' });
    expect(threadHighlightKey.getState(at.view.state)?.draft).toEqual({ from: 11, to: 18 });
    const updates: unknown[] = [];
    at.doc.on('update', (_: Uint8Array, origin: unknown) => updates.push(origin));
    act(() => result.current.send('Is this final?'));
    const [thread] = LiveThreads.read(at.doc);
    expect(thread).toMatchObject({ tab: 't.0', quote: 'results', resolved: false });
    expect(thread!.comments[0]).toMatchObject({
      text: 'Is this final?',
      author: { key: 'k-ada', name: 'Ada', colour: '#0284c7' },
    });
    expect(updates).toEqual([THREADS_ORIGIN]);
    expect(result.current.draft).toBeNull();
    expect(result.current.selected).toBe(thread!.id);
    expect(result.current.threads).toHaveLength(1);
    expect(result.current.stretches).toEqual([
      { id: thread!.id, from: 11, to: 18, deleted: false },
    ]);
    expect(tracked).toEqual([['Comment', 'Added', 'TextDocument']]);
  });

  it('comments on the word at the caret, and says so when there is nothing to comment on', async () => {
    const at = await editor('quarterly  results');
    at.view.dispatch(at.view.state.tr.setSelection(TextSelection.create(at.view.state.doc, 3)));
    const { result } = threadsOn(at);
    act(() => result.current.addComment());
    expect(result.current.draft?.quote).toBe('quarterly');
    act(() => result.current.cancel());
    expect(result.current.draft).toBeNull();
    at.view.dispatch(at.view.state.tr.setSelection(TextSelection.create(at.view.state.doc, 11)));
    act(() => result.current.addComment());
    expect(result.current.draft).toBeNull();
    const { container } = renderStatus(result.current.status);
    expect(container.textContent).toBe(NOTHING_TO_COMMENT_ON);
  });

  it('comments on the body alone: the caret in a header finds nothing', async () => {
    const at = await editor();
    const header = await editor('header');
    const { result } = threadsOn(at, ADA, header.view);
    act(() => result.current.addComment());
    expect(result.current.draft).toBeNull();
  });

  it('replies, edits, resolves and deletes beside the writing', async () => {
    const at = await editor();
    at.view.dispatch(at.view.state.tr.setSelection(TextSelection.create(at.view.state.doc, 1, 10)));
    const { result } = threadsOn(at);
    act(() => result.current.addComment());
    act(() => result.current.send('First'));
    const id = result.current.selected!;
    act(() => result.current.reply(id, 'Second'));
    const second = LiveThreads.read(at.doc)[0]!.comments[1]!;
    expect(second.text).toBe('Second');
    act(() => result.current.edit(id, second.id, 'Second, edited'));
    expect(LiveThreads.read(at.doc)[0]!.comments[1]).toMatchObject({ text: 'Second, edited' });
    act(() => result.current.remove(id, second.id));
    expect(LiveThreads.read(at.doc)[0]!.comments).toHaveLength(1);
    act(() => result.current.resolve(id, true));
    expect(LiveThreads.read(at.doc)[0]!.resolved).toBe(true);
    expect(result.current.selected).toBeNull();
    expect(result.current.stretches).toEqual([]);
    act(() => result.current.resolve(id, false));
    act(() => result.current.remove(id, LiveThreads.read(at.doc)[0]!.comments[0]!.id));
    expect(LiveThreads.read(at.doc)).toEqual([]);
    expect(tracked).toEqual([
      ['Comment', 'Added', 'TextDocument'],
      ['Comment', 'Added', 'TextDocument'],
      ['Comment', 'Resolved', 'TextDocument'],
    ]);
  });

  it('reacts beside the writing, signed with the commenter’s key, and takes it back', async () => {
    const at = await editor();
    at.view.dispatch(at.view.state.tr.setSelection(TextSelection.create(at.view.state.doc, 1, 10)));
    const { result } = threadsOn(at);
    act(() => result.current.addComment());
    act(() => result.current.send('First'));
    const id = result.current.selected!;
    const first = LiveThreads.read(at.doc)[0]!.comments[0]!.id;
    tracked.splice(0);
    act(() => result.current.react(id, first, '👍', true));
    expect(LiveThreads.read(at.doc)[0]!.comments[0]!.reactions).toEqual({ '👍': ['k-ada'] });
    expect(result.current.names.get('k-ada')).toBe('Ada');
    act(() => result.current.react(id, first, '👍', false));
    expect(LiveThreads.read(at.doc)[0]!.comments[0]!.reactions).toBeUndefined();
    expect(tracked).toEqual([['Comment', 'Added', 'TextDocumentReaction']]);
  });

  it('lets a reader change nothing, and offers no Add comment', async () => {
    const at = await editor();
    const { result } = threadsOn(at, null);
    expect(result.current.actions).toEqual({});
    act(() => result.current.addComment());
    act(() => result.current.send('x'));
    act(() => result.current.reply('t', 'x'));
    act(() => result.current.resolve('t', true));
    expect(LiveThreads.read(at.doc)).toEqual([]);
  });

  it('adds no thread once the document holds the most', async () => {
    const at = await editor();
    const anchor = { start: new Uint8Array([1]), end: new Uint8Array([1]), quote: '' };
    for (let i = 0; i < TEXT_DOCUMENT_THREADS_MAX; i += 1)
      LiveThreads.begin(
        at.doc,
        {
          id: `t${i}`,
          tab: 't.0',
          ...anchor,
          comment: { id: `c${i}`, text: 'x', at: i, author: ADA },
        },
        null,
      );
    at.view.dispatch(at.view.state.tr.setSelection(TextSelection.create(at.view.state.doc, 1, 4)));
    const { result } = threadsOn(at);
    act(() => result.current.addComment());
    expect(result.current.draft).toBeNull();
    expect(renderStatus(result.current.status).container.textContent).toBe(COMMENTS_FULL);
  });
});
