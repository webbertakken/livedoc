// @vitest-environment jsdom
// docs/specs/034-text-documents/tools.md "Word count": the dialog (counts, a selection's part, Pages only with pages,
// the checkbox), the count while typing (kept current, a press shows the next count), the setting kept per person.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { readUserPreferences } from '@/lib/user-preferences';
import { track } from '@/lib/telemetry';
import { nextShows, wordCountLine } from './TextDocumentWordCountBox';
import {
  WORD_COUNT_ITEM,
  WORD_COUNT_SETTLE_MS,
  useTextDocumentWordCount,
} from './useTextDocumentWordCount';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const s = textDocumentSchema;
const views: EditorView[] = [];
beforeEach(() => localStorage.clear());
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  vi.useRealTimers();
  vi.mocked(track).mockClear();
});

function editor(text = 'one two three') {
  const view = new EditorView(document.createElement('div'), {
    state: EditorState.create({
      doc: s.node('doc', null, [s.node('paragraph', null, [s.text(text)])]),
    }),
  });
  views.push(view);
  return view;
}

function setup({ pages = 2 }: { pages?: number | null } = {}) {
  const view = editor();
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  };
  let result: ReturnType<typeof useTextDocumentWordCount> | null = null;
  function Harness() {
    result = useTextDocumentWordCount({
      view,
      activeView: view,
      subscribe,
      subscribeCaret: subscribe,
      pages,
      ownerId: null,
    });
    return (
      <>
        {result.box}
        {result.dialog}
      </>
    );
  }
  render(<Harness />);
  const open = () => act(() => result!.actions[WORD_COUNT_ITEM]!.run());
  const tell = () => act(() => listeners.forEach((l) => l()));
  return { view, open, tell };
}

const cell = (row: string) =>
  screen.getByRole('rowheader', { name: row }).parentElement!.querySelector('td')!.textContent;

describe('useTextDocumentWordCount', () => {
  it('opens on the counts as they are, Pages with the pages laid out, and OK closes', () => {
    const { open } = setup();
    open();
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TextDocumentWordCount');
    expect(screen.getByRole('dialog', { name: 'Word count' })).toBeTruthy();
    expect([
      cell('Pages'),
      cell('Words'),
      cell('Characters'),
      cell('Characters excluding spaces'),
    ]).toEqual(['2', '3', '13', '11']);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^OK$/ }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('counts a selection as the part of the whole, and shows no Pages without pages', () => {
    const { view, open } = setup({ pages: null });
    act(() =>
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 8))),
    );
    open();
    expect(screen.queryByRole('rowheader', { name: 'Pages' })).toBeNull();
    expect(cell('Words')).toBe('2 of 3');
  });

  it('keeps the count while typing as the person\u2019s own, counted before it is kept, and current as the writing changes', () => {
    vi.useFakeTimers();
    const { view, open, tell } = setup();
    open();
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Display word count while typing' }));
    });
    expect(track).toHaveBeenCalledWith('UI', 'Toggled', 'TextDocumentWordCountWhileTypingOn');
    expect(readUserPreferences().textDocumentWordCountWhileTyping).toBe(true);
    const box = () => screen.getByRole('button', { name: /words\. Show another count$/ });
    expect(box().textContent).toBe('3 words');
    act(() => view.dispatch(view.state.tr.insertText(' four', view.state.doc.content.size - 1)));
    tell();
    expect(box().textContent).toBe('3 words');
    act(() => {
      vi.advanceTimersByTime(WORD_COUNT_SETTLE_MS);
    });
    expect(box().textContent).toBe('4 words');
    act(() => {
      fireEvent.click(box());
    });
    expect(
      screen.getByRole('button', { name: /characters\. Show another count$/ }).textContent,
    ).toBe('18 characters');
    act(() => {
      fireEvent.click(screen.getByRole('checkbox', { name: 'Display word count while typing' }));
    });
    expect(track).toHaveBeenCalledWith('UI', 'Toggled', 'TextDocumentWordCountWhileTypingOff');
    expect(screen.queryByRole('button', { name: /Show another count$/ })).toBeNull();
  });
});

describe('wordCountLine and nextShows', () => {
  const counts = { words: 340, characters: 1204, charactersExcludingSpaces: 1050 };
  const one = { words: 1, characters: 1, charactersExcludingSpaces: 1 };

  it('says each count, a selection\u2019s part, and one in the singular', () => {
    expect(wordCountLine('words', counts, null, 3)).toBe('340 words');
    expect(wordCountLine('words', counts, { ...counts, words: 12 }, 3)).toBe('12 of 340 words');
    expect(wordCountLine('charactersExcludingSpaces', counts, null, 3)).toBe(
      '1,050 characters excluding spaces',
    );
    expect(wordCountLine('pages', counts, one, 1)).toBe('1 page');
    expect(wordCountLine('words', one, null, null)).toBe('1 word');
    expect(wordCountLine('pages', counts, null, null)).toBe('0 pages');
  });

  it('steps through the counts, pages only where laid out', () => {
    expect(nextShows('words', 2)).toBe('characters');
    expect(nextShows('charactersExcludingSpaces', 2)).toBe('pages');
    expect(nextShows('pages', 2)).toBe('words');
    expect(nextShows('charactersExcludingSpaces', null)).toBe('words');
  });
});
