// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import { LiveSuggestions, TextDocumentState } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import { textDocumentUndoPlugins } from '@/lib/text-document/text-document-undo';
import type { SuggestionRights } from '@/lib/text-document/text-document-suggestion-cards';
import {
  MOVE_TO_NEXT_SUGGESTION,
  useTextDocumentSuggestionCards,
} from './useTextDocumentSuggestionCards';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

// docs/specs/034-text-documents/review.md "Suggestion cards": the cards of the writing, Accept and Reject as the
// person's rights allow, each tracked once; the next suggestion from the caret.
const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };

async function writing() {
  const doc = TextDocumentState.load();
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      schema,
      plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
    }),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const insertion = (id: string, author: object) =>
    schema.marks.insertion!.create({ id, at: 1, author });
  view.dispatch(
    view.state.tr.insert(1, [
      schema.text('quick', [insertion('s1', ADA)]),
      schema.text(' '),
      schema.text('brown', [insertion('s2', BEN)]),
    ]),
  );
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const changed = () => listeners.forEach((l) => l());
  return { doc, view, subscribe, changed };
}

function cardsOf(w: Awaited<ReturnType<typeof writing>>, rights: SuggestionRights) {
  return renderHook(() =>
    useTextDocumentSuggestionCards({
      view: w.view,
      doc: { current: w.doc },
      ready: true,
      rights,
      subscribe: w.subscribe,
    }),
  );
}

afterEach(() => vi.mocked(track).mockClear());

describe('useTextDocumentSuggestionCards', () => {
  it('reads the cards of the writing', async () => {
    const w = await writing();
    const { result } = cardsOf(w, { accepts: true, ownKey: null });
    expect(result.current.cards.map((c) => [c.id, c.lines])).toEqual([
      ['s1', ['Add: “quick”']],
      ['s2', ['Add: “brown”']],
    ]);
    w.view.destroy();
  });

  it('lets an Editor accept, tracked once, and reads the writing again', async () => {
    const w = await writing();
    const { result } = cardsOf(w, { accepts: true, ownKey: null });
    act(() => result.current.select('s1'));
    act(() => {
      result.current.accept('s1');
      w.changed();
    });
    expect(LiveSuggestions.count(w.doc)).toBe(1);
    expect(track).toHaveBeenCalledOnce();
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentSuggestionAccepted');
    expect(result.current.cards.map((c) => c.id)).toEqual(['s2']);
    expect(result.current.selected).toBeNull();
    w.view.destroy();
  });

  it('lets a Participant reject their own, never accept nor reject another’s', async () => {
    const w = await writing();
    const { result } = cardsOf(w, { accepts: false, ownKey: 'k-ada' });
    act(() => result.current.accept('s1'));
    act(() => result.current.reject('s2'));
    expect(LiveSuggestions.count(w.doc)).toBe(2);
    expect(track).not.toHaveBeenCalled();
    act(() => result.current.reject('s1'));
    expect(LiveSuggestions.count(w.doc)).toBe(1);
    expect(w.view.state.doc.textContent).toBe(' brown');
    expect(track).toHaveBeenCalledWith('Element', 'Changed', 'TextDocumentSuggestionRejected');
    w.view.destroy();
  });

  it('moves to the next suggestion from the caret, asking for its card’s focus', async () => {
    const w = await writing();
    const { result } = cardsOf(w, { accepts: true, ownKey: null });
    act(() => result.current.actions[MOVE_TO_NEXT_SUGGESTION]!.run());
    // The caret is at the writing's end, past both: nothing moves.
    expect(result.current.selected).toBeNull();
    act(() => result.current.step(false));
    expect(result.current.selected).toBe('s2');
    expect(result.current.focusRequest).toEqual({ id: 'suggestion:s2', n: 1 });
    act(() => result.current.step(false));
    expect(result.current.selected).toBe('s1');
    act(() => result.current.exit());
    expect(result.current.selected).toBeNull();
    w.view.destroy();
  });

  it('binds no keys with no suggestions', async () => {
    const w = await writing();
    act(() => {
      LiveSuggestions.accept(w.doc, 's1', null);
      LiveSuggestions.accept(w.doc, 's2', null);
    });
    const { result } = cardsOf(w, { accepts: true, ownKey: null });
    expect(result.current.actions).toEqual({});
    w.view.destroy();
  });
});

describe('useTextDocumentSuggestionCards, selecting', () => {
  it('lets a selected comment thread go as a suggestion is selected', async () => {
    const w = await writing();
    const onSelect = vi.fn();
    const { result } = renderHook(() =>
      useTextDocumentSuggestionCards({
        view: w.view,
        doc: { current: w.doc },
        ready: true,
        rights: { accepts: true, ownKey: null },
        subscribe: w.subscribe,
        onSelect,
      }),
    );
    act(() => result.current.select(null));
    expect(onSelect).not.toHaveBeenCalled();
    act(() => result.current.select('s1'));
    act(() => result.current.step(true));
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(result.current.selected).toBe('s2');
    w.view.destroy();
  });
});
