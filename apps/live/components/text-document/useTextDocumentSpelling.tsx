'use client';

// Spelling in a text document (docs/specs/034-text-documents/tools.md "Spelling and grammar"): what the writing's
// spelling plugin reads (the checker, the language, the personal dictionary, whether misspellings show), and the context
// menu's suggestions, Add to dictionary and Ignore on a misspelt word.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EditorView } from 'prosemirror-view';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import {
  onPersonalDictionaryChange,
  PersonalDictionary,
  readPersonalDictionary,
  savePersonalDictionary,
} from '@/lib/spelling/personal-dictionary';
import {
  spellingChecker,
  SPELLING_SUGGESTIONS_MAX,
  type SpellingChecker,
} from '@/lib/spelling/spelling-checker';
import { documentSpellingTag } from '@/lib/spelling/spelling-languages';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { focusWriting } from '@/lib/text-document/text-document-focus';
import {
  ignoreMisspelling,
  misspellingAt,
  rescanSpelling,
  type Misspelling,
  type SpellingSource,
} from '@/lib/text-document/text-document-spelling';
import { startUndoStep } from '@/lib/text-document/text-document-undo';

export const DICTIONARY_FULL = 'Your personal dictionary is full. Remove a word to add another.';
/** How long the notice stays (safe 3,000..10,000 ms). */
export const SPELLING_NOTICE_MS = 6_000;
/** The most misspelt words a read fetches suggestions for ahead of a right-click (safe 10..200). */
export const SPELLING_PREFETCH_MAX = 50;

export const SPELLING_SUGGESTION_ITEMS = Array.from(
  { length: SPELLING_SUGGESTIONS_MAX },
  (_, i) => `spelling-suggestion-${i + 1}`,
);
export const SPELLING_ADD_ITEM = 'spelling-add-to-dictionary';
export const SPELLING_IGNORE_ITEM = 'spelling-ignore';

const keyOf = (m: Pick<Misspelling, 'language' | 'word'>) => `${m.language}\u0000${m.word}`;
const sameWords = (a: PersonalDictionary, b: PersonalDictionary) =>
  a.words.length === b.words.length && a.words.every((w, i) => w === b.words[i]);

export function useTextDocumentSpelling({
  view,
  textWrites,
  ownerId,
  checker = spellingChecker(),
}: {
  /** The body's editor, once bound. */
  view: EditorView | null;
  /** Whether the person can change the text (Editing or Suggesting): only then do misspellings show. */
  textWrites: boolean;
  ownerId: string | null;
  checker?: SpellingChecker;
}) {
  const personal = useRef(readPersonalDictionary());
  const shown = useRef(textWrites);
  useLayoutEffect(() => {
    shown.current = textWrites;
  });
  // Each misspelt word's suggestions, fetched when a read finds it, so a right-click has them at once.
  const suggestions = useRef(new Map<string, readonly string[]>());
  const [notice, setNotice] = useState<string | null>(null);

  const [source] = useState<SpellingSource>(() => ({
    checker,
    language: documentSpellingTag,
    personal: () => personal.current,
    shown: () => shown.current,
    onFound: (misspelt) => {
      const fresh = [...new Map(misspelt.map((m) => [keyOf(m), m])).values()]
        .filter((m) => !suggestions.current.has(keyOf(m)))
        .slice(0, SPELLING_PREFETCH_MAX);
      for (const m of fresh)
        void checker
          .suggest(m.language, m.word)
          .then((list) => suggestions.current.set(keyOf(m), list));
    },
  }));

  // Misspellings show while the text can be changed: read again when that changes.
  useEffect(() => {
    if (view) rescanSpelling(view);
  }, [view, textWrites]);

  // A word added or removed, here or in another tab: every paragraph read again.
  useEffect(
    () =>
      onPersonalDictionaryChange(() => {
        const next = readPersonalDictionary();
        if (sameWords(next, personal.current)) return;
        personal.current = next;
        if (view) rescanSpelling(view);
      }),
    [view],
  );

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), SPELLING_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const actions = useMemo((): OfficeActions => {
    if (!view || !textWrites) return {};
    const here = () => misspellingAt(view.state, view.state.selection.from);
    const offered = () => {
      const m = here();
      return m ? (suggestions.current.get(keyOf(m)) ?? []) : [];
    };
    const suggestion = (n: number): OfficeAction => ({
      run: () => {
        const m = here();
        const word = offered()[n];
        if (!m || word === undefined) return;
        // Its own undo step, never joined to the typing before or after.
        startUndoStep(view);
        view.dispatch(view.state.tr.insertText(word, m.from, m.to).scrollIntoView());
        startUndoStep(view);
        focusWriting(view);
        track('Document', 'Changed', 'TextDocumentSpellingAccepted');
        debugLog('[spelling] suggestion taken', { place: n + 1, of: offered().length });
      },
      get label() {
        return offered()[n];
      },
      get disabled() {
        return offered()[n] === undefined;
      },
    });
    return {
      ...Object.fromEntries(SPELLING_SUGGESTION_ITEMS.map((id, n) => [id, suggestion(n)])),
      [SPELLING_ADD_ITEM]: {
        run: () => {
          const m = here();
          if (!m) return;
          const added = PersonalDictionary.add(readPersonalDictionary(), m.word);
          debugLog(
            '[spelling] add to dictionary',
            added.ok ? { added: true } : { refused: added.refusal },
          );
          if (added.ok) {
            savePersonalDictionary(added.dictionary, ownerId);
            track('Document', 'Changed', 'TextDocumentDictionaryAdded');
          } else if (added.refusal === 'full') setNotice(DICTIONARY_FULL);
          // Already kept (another tab added it, unheard here): the underline was stale.
          else if (added.refusal === 'present') {
            personal.current = readPersonalDictionary();
            rescanSpelling(view);
          }
          focusWriting(view);
        },
        get disabled() {
          return here() === null;
        },
      },
      [SPELLING_IGNORE_ITEM]: {
        run: () => {
          const m = here();
          if (m) ignoreMisspelling(view, m.word);
          focusWriting(view);
        },
        get disabled() {
          return here() === null;
        },
      },
    };
  }, [view, textWrites, ownerId]);

  const noticeBar =
    notice !== null ? (
      <p
        role="status"
        className="border-b border-(--office-line) bg-(--office-chrome) px-4 py-2 text-center text-body text-(--office-ink)"
      >
        {notice}
      </p>
    ) : null;

  return { source, actions, notice: noticeBar };
}
