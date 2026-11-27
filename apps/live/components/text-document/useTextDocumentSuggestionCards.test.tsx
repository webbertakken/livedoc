// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { ySyncPlugin } from 'y-prosemirror';
import * as Y from 'yjs';
import { LiveSuggestions, storyFragment, TextDocumentState } from '@livedoc/text-documents';
import { track } from '@/lib/telemetry';
import { textDocumentSchema as schema } from '@/lib/text-document/text-document-schema';
import { textDocumentUndoPlugins } from '@/lib/text-document/text-document-undo';
import type { SuggestionRights } from '@/lib/text-document/text-document-suggestion-cards';
import {
  MOVE_TO_NEXT_SUGGESTION,
  STORY_NOT_DRAWN,
  SUGGESTION_GONE,
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

describe('useTextDocumentSuggestionCards, going and settling', () => {
  it('goes to a card of the tab shown, and tells who settles it', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const w = await writing();
    const onSettled = vi.fn();
    const { result } = renderHook(() =>
      useTextDocumentSuggestionCards({
        view: w.view,
        doc: { current: w.doc },
        ready: true,
        rights: { accepts: true, ownKey: null },
        subscribe: w.subscribe,
        tab: 't.0',
        onSettled,
      }),
    );
    act(() => result.current.go('s2', 't.0'));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(result.current.selected).toBe('s2');
    vi.useRealTimers();
    act(() => result.current.reject('s2'));
    expect(onSettled).toHaveBeenCalledWith('s2');
    w.view.destroy();
  });

  it('shows another tab first, and says a suggestion is gone when it never arrives', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const w = await writing();
    const showTab = vi.fn();
    const say = vi.fn();
    const { result, rerender } = renderHook(
      ({ tab }: { tab: string }) =>
        useTextDocumentSuggestionCards({
          view: w.view,
          doc: { current: w.doc },
          ready: true,
          rights: { accepts: true, ownKey: null },
          subscribe: w.subscribe,
          tab,
          showTab,
          say,
        }),
      { initialProps: { tab: 't.0' } },
    );
    act(() => result.current.go('elsewhere', 't.b'));
    expect(showTab).toHaveBeenCalledWith('t.b');
    rerender({ tab: 't.b' });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(say).toHaveBeenCalledWith(SUGGESTION_GONE);
    expect(result.current.selected).toBeNull();
    vi.useRealTimers();
    w.view.destroy();
  });
});

// review.md "In a header, footer or note", "Going to a story's suggestion": a story's cards after the body's, read
// again when a story changes; going to one opens its story, else shows its copy; a header no page draws is said so.
describe('useTextDocumentSuggestionCards, in stories', () => {
  const headerDoc = (id: string) =>
    schema.nodes.doc!.create(null, [
      schema.nodes.paragraph!.create(null, [
        schema.text('Head', [schema.marks.insertion!.create({ id, at: 2, author: ADA })]),
      ]),
    ]);

  function storiesOf(docs: { story: string; doc: ReturnType<typeof headerDoc> }[]) {
    const listeners = new Set<() => void>();
    return {
      writings: vi.fn(() => docs),
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      open: vi.fn(() => true),
      reveal: vi.fn(() => true),
      changed: () => listeners.forEach((l) => l()),
      docs,
    };
  }

  it('reads a story’s cards after the body’s, and again when the story changes', async () => {
    const w = await writing();
    const stories = storiesOf([{ story: 'h', doc: headerDoc('h1') }]);
    const { result } = renderHook(() =>
      useTextDocumentSuggestionCards({
        view: w.view,
        doc: { current: w.doc },
        ready: true,
        rights: { accepts: true, ownKey: null },
        subscribe: w.subscribe,
        stories,
      }),
    );
    expect(result.current.cards.map((c) => [c.id, c.story])).toEqual([
      ['s1', undefined],
      ['s2', undefined],
      ['h1', 'h'],
    ]);
    stories.docs.push({ story: 'n', doc: headerDoc('n1') });
    act(() => stories.changed());
    expect(result.current.cards.map((c) => c.id)).toEqual(['s1', 's2', 'h1', 'n1']);
    w.view.destroy();
  });

  it('opens a story’s suggestion gone to, or shows its copy where it cannot be opened', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const w = await writing();
    const stories = storiesOf([{ story: 'h', doc: headerDoc('h1') }]);
    const { result } = renderHook(() =>
      useTextDocumentSuggestionCards({
        view: w.view,
        doc: { current: w.doc },
        ready: true,
        rights: { accepts: true, ownKey: null },
        subscribe: w.subscribe,
        tab: 't.0',
        stories,
      }),
    );
    act(() => result.current.go('h1', 't.0'));
    act(() => {
      vi.advanceTimersByTime(20);
    });
    expect(stories.open).toHaveBeenCalledWith('h');
    expect(stories.reveal).not.toHaveBeenCalled();
    expect(result.current.selected).toBe('h1');
    expect(result.current.focusRequest?.id).toBe('suggestion:h1');
    stories.open.mockReturnValue(false);
    act(() => result.current.select('s2'));
    act(() => result.current.step(true));
    expect(result.current.selected).toBe('h1');
    expect(stories.reveal).toHaveBeenCalledWith('h');
    vi.useRealTimers();
    w.view.destroy();
  });

  it('says a header’s suggestion no page draws is shown on pages only', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
    const w = await writing();
    TextDocumentState.setFirstHeaders(w.doc, 'odf', { header: { default: { story: 'h' } } });
    const text = new Y.XmlText();
    text.insert(0, 'Head', { insertion: { id: 'h1', at: 2, author: ADA } });
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [text]);
    storyFragment(w.doc, 'h').insert(0, [paragraph]);
    expect(LiveSuggestions.read(w.doc).find((s) => s.id === 'h1')?.story).toBe('h');
    const say = vi.fn();
    const none = storiesOf([]);
    const { result } = renderHook(() =>
      useTextDocumentSuggestionCards({
        view: w.view,
        doc: { current: w.doc },
        ready: true,
        rights: { accepts: true, ownKey: null },
        subscribe: w.subscribe,
        tab: 't.0',
        say,
        stories: none,
      }),
    );
    act(() => result.current.go('h1', 't.0'));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(say).toHaveBeenCalledWith(STORY_NOT_DRAWN);
    vi.useRealTimers();
    w.view.destroy();
  });
});
