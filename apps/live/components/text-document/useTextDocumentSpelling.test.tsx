// @vitest-environment jsdom
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node as PmNode } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { USER_PREFERENCES_STORAGE_KEY } from '@livedoc/telemetry-client';
import { contextualEntries } from '@/lib/office/office-catalogue';
import type { SpellingChecker } from '@/lib/spelling/spelling-checker';
import {
  DICTIONARY_FULL,
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
  SPELLING_ADD_ITEM,
  SPELLING_IGNORE_ITEM,
  SPELLING_SUGGESTION_ITEMS,
  MISSPELLING_KEY_ACTIONS,
  PERSONAL_DICTIONARY_ITEM,
  SPELLING_CHECK_ITEM,
  SPELLING_CHECK_ROW,
  SPELLING_SHOW_ITEM,
  useTextDocumentSpelling,
} from './useTextDocumentSpelling';
import { useTextDocumentSpellingSource } from './useTextDocumentSpellingSource';

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

// The editors' own hosts, taken away after each test (Testing Library unmounts its own).
const hosts: HTMLElement[] = [];

function setUp(text: string, textWrites = true) {
  const hook = renderHook(
    (props: { view: EditorView | null; textWrites: boolean }) =>
      useTextDocumentSpelling({
        ...props,
        spelling: useTextDocumentSpellingSource({ textWrites: props.textWrites, checker }),
        ownerId: null,
      }),
    { initialProps: { view: null as EditorView | null, textWrites } },
  );
  const doc: PmNode = s.node('doc', null, [s.node('paragraph', null, [s.text(text)])]);
  const view = new EditorView(
    document.body.appendChild(hosts[hosts.push(document.createElement('div')) - 1]!),
    {
      state: EditorState.create({ doc, plugins: [spellingPlugin(hook.result.current.source)] }),
    },
  );
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
  hosts.splice(0).forEach((host) => host.remove());
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
    // The switch and the personal dictionary are the person's own; nothing touches the text.
    expect(Object.keys(hook.result.current.actions).sort()).toEqual([
      PERSONAL_DICTIONARY_ITEM,
      SPELLING_SHOW_ITEM,
    ]);
    hook.rerender({ view, textWrites: true });
    await settle();
    expect(underlined(view)).toEqual(['teh']);
  });

  it('walks the misspellings on the card from the caret: accept, ignore, add, then none left', async () => {
    const { hook, view } = setUp('teh cat mta xqz');
    await settle();
    caretAt(view, 5);
    act(() => hook.result.current.actions[SPELLING_CHECK_ITEM]!.run());
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TextDocumentSpelling');
    const card = () => render(<>{hook.result.current.card}</>);
    // From the caret: "mta" first, selected in the writing.
    let shown = card();
    expect(shown.getByRole('dialog').textContent).toContain('Change mta to');
    expect(view.state.doc.textBetween(view.state.selection.from, view.state.selection.to)).toBe(
      'mta',
    );
    act(() => {
      fireEvent.click(shown.getByRole('button', { name: /^Ignore$/ }));
    });
    shown.unmount();
    shown = card();
    expect(shown.getByRole('dialog').textContent).toContain('Change xqz to');
    act(() => {
      fireEvent.click(shown.getByRole('button', { name: /^Add to personal dictionary$/ }));
    });
    expect(readPersonalDictionary().words).toEqual(['xqz']);
    shown.unmount();
    shown = card();
    // Wrapped round to the first.
    expect(shown.getByRole('dialog').textContent).toContain('Change teh to');
    await act(() => vi.advanceTimersByTimeAsync(0));
    shown.unmount();
    shown = card();
    act(() => {
      fireEvent.click(shown.getByRole('button', { name: /^Accept$/ }));
    });
    expect(view.state.doc.textContent).toBe('the cat mta xqz');
    shown.unmount();
    shown = card();
    expect(shown.getByRole('status').textContent).toBe('No spelling suggestions');
    act(() => {
      fireEvent.click(shown.getByRole('button', { name: /^Close$/ }));
    });
    expect(hook.result.current.card).toBeNull();
  });

  it('opens the card from its shortcut row too, and steps back and on', async () => {
    const { hook, view } = setUp('teh cat mta');
    await settle();
    caretAt(view, 1);
    act(() => hook.result.current.actions[SPELLING_CHECK_ROW]!.run());
    const shown = render(<>{hook.result.current.card}</>);
    expect(shown.getByRole('dialog').textContent).toContain('Change teh to');
    act(() => {
      fireEvent.click(shown.getByRole('button', { name: /^Previous$/ }));
    });
    shown.rerender(<>{hook.result.current.card}</>);
    expect(shown.getByRole('dialog').textContent).toContain('Change mta to');
    act(() => {
      fireEvent.click(shown.getByRole('button', { name: /^Next$/ }));
    });
    shown.rerender(<>{hook.result.current.card}</>);
    expect(shown.getByRole('dialog').textContent).toContain('Change teh to');
  });

  it('selects the next and the previous misspelling with their keys', async () => {
    const { hook, view } = setUp('teh cat mta');
    await settle();
    caretAt(view, 5);
    const selected = () =>
      view.state.doc.textBetween(view.state.selection.from, view.state.selection.to);
    act(() => hook.result.current.actions[MISSPELLING_KEY_ACTIONS.next]!.run());
    expect(selected()).toBe('mta');
    act(() => hook.result.current.actions[MISSPELLING_KEY_ACTIONS.next]!.run());
    expect(selected()).toBe('teh');
    act(() => hook.result.current.actions[MISSPELLING_KEY_ACTIONS.previous]!.run());
    expect(selected()).toBe('mta');
  });

  it('hides every underline with Show spelling suggestions off, tracked before it is kept', async () => {
    const { hook, view } = setUp('teh');
    await settle();
    expect(hook.result.current.actions[SPELLING_SHOW_ITEM]!.checked).toBe(true);
    act(() => hook.result.current.actions[SPELLING_SHOW_ITEM]!.run());
    expect(track).toHaveBeenCalledWith('UI', 'Toggled', 'TextDocumentSpellingSuggestionsOff');
    expect(hook.result.current.actions[SPELLING_SHOW_ITEM]!.checked).toBe(false);
    expect(underlined(view)).toEqual([]);
    expect(view.dom.getAttribute('spellcheck')).toBe('false');
    act(() => hook.result.current.actions[SPELLING_SHOW_ITEM]!.run());
    await settle();
    expect(underlined(view)).toEqual(['teh']);
  });

  it('adds and removes words in the personal dictionary’s dialog, the underlines following', async () => {
    const { hook, view } = setUp('teh mta');
    await settle();
    act(() => hook.result.current.actions[PERSONAL_DICTIONARY_ITEM]!.run());
    const dialog = render(<>{hook.result.current.dialog}</>);
    act(() => {
      fireEvent.change(dialog.getByRole('textbox', { name: 'Word' }), { target: { value: 'teh' } });
    });
    act(() => {
      fireEvent.click(dialog.getByRole('button', { name: /^Add$/ }));
    });
    await settle();
    expect(underlined(view)).toEqual(['mta']);
    dialog.rerender(<>{hook.result.current.dialog}</>);
    act(() => {
      fireEvent.click(dialog.getByRole('button', { name: 'Remove teh' }));
    });
    await settle();
    expect(underlined(view)).toEqual(['teh', 'mta']);
    act(() => {
      fireEvent.click(dialog.getByRole('button', { name: /^Close/ }));
    });
    expect(hook.result.current.dialog).toBeNull();
  });
});
