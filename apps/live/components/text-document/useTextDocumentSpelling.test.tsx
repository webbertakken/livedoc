// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { USER_PREFERENCES_STORAGE_KEY } from '@livedoc/telemetry-client';
import { contextualEntries } from '@/lib/office/office-catalogue';
import type { SpellingChecker } from '@/lib/spelling/spelling-checker';
import {
  PERSONAL_DICTIONARY_MAX,
  readPersonalDictionary,
  savePersonalDictionary,
} from '@/lib/spelling/personal-dictionary';
import {
  textDocumentMenus,
  textDocumentTextContextMenu,
} from '@/lib/text-document/text-document-menus';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import {
  MISSPELT_CLASS,
  SPELLING_IDLE_MS,
  spellingPlugin,
} from '@/lib/text-document/text-document-spelling';
import {
  DICTIONARY_FULL,
  SPELLING_ADD_ITEM,
  SPELLING_IGNORE_ITEM,
  SPELLING_SUGGESTION_ITEMS,
  useTextDocumentSpelling,
} from './useTextDocumentSpelling';

// docs/specs/034-text-documents/tools.md "Spelling and grammar": the context menu on a misspelt word.

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('@/lib/telemetry', () => ({ track }));

const s = textDocumentSchema;
const KNOWN = new Set(['the', 'cat', 'tea', 'ten']);
const checker: SpellingChecker = {
  check: (_, words) => Promise.resolve(new Set(words.filter((w) => !KNOWN.has(w)))),
  known: () => undefined,
  suggest: (_, word) => Promise.resolve(word === 'teh' ? ['the', 'tea', 'ten'] : []),
};

function setUp(text: string, textWrites = true) {
  const hook = renderHook(
    (props: { view: EditorView | null; textWrites: boolean }) =>
      useTextDocumentSpelling({ ...props, ownerId: null, checker }),
    { initialProps: { view: null as EditorView | null, textWrites } },
  );
  const doc: PmNode = s.node('doc', null, [s.node('paragraph', null, [s.text(text)])]);
  const view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc, plugins: [spellingPlugin(hook.result.current.source)] }),
  });
  hook.rerender({ view, textWrites });
  return { hook, view };
}

const caretAt = (view: EditorView, pos: number) =>
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
const menuLabels = (hook: ReturnType<typeof setUp>['hook']) => {
  const actions = hook.result.current.actions;
  return contextualEntries(textDocumentTextContextMenu(textDocumentMenus('ooxml')), actions)
    .slice(0, 6)
    .map((e) => (e.kind === 'item' ? (actions[e.id]?.label ?? e.label) : '|'));
};
const settle = () => act(() => vi.advanceTimersByTimeAsync(SPELLING_IDLE_MS));
const underlined = (view: EditorView) =>
  [...view.dom.querySelectorAll(`.${MISSPELT_CLASS}`)].map((el) => el.textContent);

// The document is checked in the browser's language: Dutch, whose dictionary ships.
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('nl-NL');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.replaceChildren();
  track.mockClear();
});

describe('useTextDocumentSpelling', () => {
  it('opens the context menu on a misspelt word with its suggestions, Add to dictionary and Ignore', async () => {
    const { hook, view } = setUp('cat teh');
    await settle();
    caretAt(view, 6);
    expect(menuLabels(hook)).toEqual([
      'the',
      'tea',
      'ten',
      'Add to personal dictionary',
      'Ignore',
      '|',
    ]);
    caretAt(view, 2);
    expect(menuLabels(hook)[0]).toBe('Cut');
  });

  it('replaces the word with a suggestion, as one undo step', async () => {
    const { hook, view } = setUp('cat teh');
    await settle();
    caretAt(view, 6);
    act(() => hook.result.current.actions[SPELLING_SUGGESTION_ITEMS[1]!]!.run());
    expect(view.state.doc.textContent).toBe('cat tea');
    expect(track).toHaveBeenCalledWith('Document', 'Changed', 'TextDocumentSpellingAccepted');
  });

  it('adds the word to the personal dictionary, and every underline of it goes', async () => {
    const { hook, view } = setUp('teh cat teh');
    await settle();
    caretAt(view, 2);
    act(() => hook.result.current.actions[SPELLING_ADD_ITEM]!.run());
    expect(readPersonalDictionary().words).toEqual(['teh']);
    expect(track).toHaveBeenCalledWith('Document', 'Changed', 'TextDocumentDictionaryAdded');
    await settle();
    expect(underlined(view)).toEqual([]);
  });

  it('says the personal dictionary is full', async () => {
    savePersonalDictionary(
      { words: Array.from({ length: PERSONAL_DICTIONARY_MAX }, (_, i) => `w${i}`) },
      null,
    );
    const { hook, view } = setUp('teh');
    await settle();
    caretAt(view, 2);
    act(() => hook.result.current.actions[SPELLING_ADD_ITEM]!.run());
    const { container } = render(<>{hook.result.current.notice}</>);
    expect(container.textContent).toBe(DICTIONARY_FULL);
    expect(readPersonalDictionary().words).toHaveLength(PERSONAL_DICTIONARY_MAX);
  });

  it('does nothing off a misspelt word', async () => {
    const { hook, view } = setUp('cat teh');
    await settle();
    caretAt(view, 2);
    const { actions } = hook.result.current;
    for (const id of [SPELLING_SUGGESTION_ITEMS[0]!, SPELLING_ADD_ITEM, SPELLING_IGNORE_ITEM]) {
      expect(actions[id]!.disabled, id).toBe(true);
      act(() => actions[id]!.run());
    }
    expect(view.state.doc.textContent).toBe('cat teh');
    expect(readPersonalDictionary().words).toEqual([]);
    expect(underlined(view)).toEqual(['teh']);
  });

  it('reads again when the word is already in the dictionary', async () => {
    const { hook, view } = setUp('teh');
    await settle();
    caretAt(view, 2);
    // Another tab added it, unheard here yet.
    localStorage.setItem(
      USER_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ personalDictionary: ['teh'] }),
    );
    act(() => hook.result.current.actions[SPELLING_ADD_ITEM]!.run());
    await settle();
    expect(underlined(view)).toEqual([]);
  });

  it('reads again when another tab adds a word', async () => {
    const { view } = setUp('teh');
    await settle();
    expect(underlined(view)).toEqual(['teh']);
    act(() => savePersonalDictionary({ words: ['teh'] }, null));
    await settle();
    expect(underlined(view)).toEqual([]);
  });

  it('ignores the word until the document is closed', async () => {
    const { hook, view } = setUp('teh cat teh');
    await settle();
    caretAt(view, 2);
    act(() => hook.result.current.actions[SPELLING_IGNORE_ITEM]!.run());
    expect(underlined(view)).toEqual([]);
  });

  it('shows no misspellings and offers nothing to whoever cannot change the text', async () => {
    const { hook, view } = setUp('teh', false);
    await settle();
    expect(underlined(view)).toEqual([]);
    expect(hook.result.current.actions).toEqual({});
    hook.rerender({ view, textWrites: true });
    await settle();
    expect(underlined(view)).toEqual(['teh']);
  });
});
