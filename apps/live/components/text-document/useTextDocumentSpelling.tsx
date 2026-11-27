'use client';

// Spelling in a text document (docs/specs/034-text-documents/tools.md "Spelling and grammar"), over what its plugins
// read (useTextDocumentSpellingSource): the context menu on a misspelt word; Tools > Spelling and grammar (the card, Show spelling suggestions, the personal
// dictionary's dialog); and the next and previous misspelling keys.
import { useEffect, useMemo, useState } from 'react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { OfficeAction, OfficeActions } from '@/lib/office/office-catalogue';
import {
  DICTIONARY_FULL,
  PersonalDictionary,
  readPersonalDictionary,
  savePersonalDictionary,
  type PersonalDictionaryRefusal,
} from '@/lib/spelling/personal-dictionary';
import { SPELLING_SUGGESTIONS_MAX } from '@/lib/spelling/spelling-checker';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { readUserPreferences, writeUserPreferences } from '@/lib/user-preferences';
import { focusWriting } from '@/lib/text-document/text-document-focus';
import {
  dropMisspelling,
  ignoreMisspelling,
  misspellingAt,
  nearMisspelling,
  type Misspelling,
} from '@/lib/text-document/text-document-spelling';
import { startUndoStep } from '@/lib/text-document/text-document-undo';
import { TextDocumentPersonalDictionaryDialog } from './TextDocumentPersonalDictionaryDialog';
import { TextDocumentSpellingCard } from './TextDocumentSpellingCard';
import { TOO_MANY_SUBSTITUTIONS } from './TextDocumentPreferencesDialog';
import {
  isKeepable,
  readTypingAids,
  saveTypingAids,
  SUBSTITUTIONS_OWN_MAX,
  TypingAids,
} from '@/lib/text-document/text-document-typing-aids';
import {
  readSpellingShown,
  suggestionKey,
  type TextDocumentSpellingSource,
} from './useTextDocumentSpellingSource';

/** How long the notice stays (safe 3,000..10,000 ms). */
export const SPELLING_NOTICE_MS = 6_000;

export const SPELLING_SUGGESTION_ITEMS = Array.from(
  { length: SPELLING_SUGGESTIONS_MAX },
  (_, i) => `spelling-suggestion-${i + 1}`,
);
export const SPELLING_ADD_ITEM = 'spelling-add-to-dictionary';
export const SPELLING_ALWAYS_ITEM = 'spelling-always-correct';
export const SPELLING_IGNORE_ITEM = 'spelling-ignore';
/** Tools > Spelling and grammar's items: the card (also the toolbar's button and ⌘⌥X), the switch, the dialog. */
export const SPELLING_CHECK_ITEM = 'spelling-and-grammar';
export const SPELLING_CHECK_ROW = 'open-spelling-and-grammar';
export const SPELLING_SHOW_ITEM = 'spelling-show';
export const PERSONAL_DICTIONARY_ITEM = 'spelling-personal-dictionary';
/** ⌘' and ⌘;, bound by their rows' own ids. */
export const MISSPELLING_KEY_ACTIONS = {
  next: 'move-to-next-misspelling',
  previous: 'move-to-previous-misspelling',
} as const;

const keyOf = suggestionKey;

// The word shown in the writing: selected and scrolled to.
const selectWord = (view: EditorView, m: Misspelling) =>
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, m.from, m.to)).scrollIntoView(),
  );

type Card = { readonly misspelling: Misspelling | null; readonly suggestions: readonly string[] };

export function useTextDocumentSpelling({
  view,
  activeView,
  spelling,
  textWrites,
  ownerId,
}: {
  /** What the plugins read (useTextDocumentSpellingSource). */
  spelling: TextDocumentSpellingSource;
  /** The body's editor, once bound: the card walks it. */
  view: EditorView | null;
  /** The editor being written in (a header, a note), else the body: the context menu and the keys act on it. */
  activeView?: EditorView | null;
  /** Whether the person can change the text (Editing or Suggesting): only then do misspellings show. */
  textWrites: boolean;
  ownerId: string | null;
}) {
  const active = activeView ?? view;
  const {
    source,
    checker,
    refreshPersonal,
    suggestions,
    personalWords,
    showSuggestions,
    setShowSuggestions,
  } = spelling;
  const [notice, setNotice] = useState<string | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), SPELLING_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const ops = useMemo(() => {
    // Keeps `word` in the personal dictionary; its underlines in `where` go at once, the rest with the re-read.
    const addWord = (word: string, where: EditorView | null): PersonalDictionaryRefusal | null => {
      const added = PersonalDictionary.add(readPersonalDictionary(), word);
      debugLog(
        '[spelling] add to dictionary',
        added.ok ? { added: true } : { refused: added.refusal },
      );
      if (!added.ok) {
        // Already kept (another tab added it, unheard here): the underline was stale.
        if (added.refusal === 'present') refreshPersonal();
        return added.refusal;
      }
      if (where) dropMisspelling(where, word);
      savePersonalDictionary(added.dictionary, ownerId);
      track('Document', 'Changed', 'TextDocumentDictionaryAdded');
      return null;
    };

    // A suggestion put in the misspelling's place: its own undo step, never joined to the typing around it.
    const replaceWith = (where: EditorView, m: Misspelling, word: string) => {
      startUndoStep(where);
      where.dispatch(where.state.tr.insertText(word, m.from, m.to).scrollIntoView());
      startUndoStep(where);
    };

    // The card on `m` (or on none left): the word selected in the writing, its suggestions fetched.
    const showOnCard = (m: Misspelling | null) => {
      if (!view) return;
      if (m) selectWord(view, m);
      const known = m ? suggestions.current.get(keyOf(m)) : undefined;
      setCard({ misspelling: m, suggestions: known ?? [] });
      if (m && !known)
        void checker.suggest(m.language, m.word).then((list) => {
          suggestions.current.set(keyOf(m), list);
          setCard((now) =>
            now?.misspelling?.from === m.from && now.misspelling.word === m.word
              ? { misspelling: m, suggestions: list }
              : now,
          );
        });
    };
    const step = (direction: 1 | -1) => view && showOnCard(nearMisspelling(view.state, direction));
    return { addWord, replaceWith, showOnCard, step };
  }, [view, ownerId, checker, refreshPersonal, suggestions]);
  const { addWord, replaceWith, showOnCard, step } = ops;

  const actions = useMemo((): OfficeActions => {
    const tools: OfficeActions = {
      [SPELLING_SHOW_ITEM]: {
        run: () => {
          const on = !readSpellingShown();
          // Tracked before it is kept, so turning it off still reaches the wire.
          track(
            'UI',
            'Toggled',
            on ? 'TextDocumentSpellingSuggestionsOn' : 'TextDocumentSpellingSuggestionsOff',
          );
          writeUserPreferences({ ...readUserPreferences(), spellingSuggestionsShown: on }, ownerId);
          setShowSuggestions(on);
        },
        checked: showSuggestions,
      },
      [PERSONAL_DICTIONARY_ITEM]: { run: () => setDialogOpen(true) },
    };
    if (!view || !active || !textWrites) return tools;

    const here = () => misspellingAt(active.state, active.state.selection.from);
    const offered = () => {
      const m = here();
      return m ? (suggestions.current.get(keyOf(m)) ?? []) : [];
    };
    const suggestion = (n: number): OfficeAction => ({
      run: () => {
        const m = here();
        const word = offered()[n];
        if (!m || word === undefined) return;
        replaceWith(active, m, word);
        track('Document', 'Changed', 'TextDocumentSpellingAccepted');
        focusWriting(active);
        debugLog('[spelling] suggestion taken', { place: n + 1, of: offered().length });
      },
      get label() {
        return offered()[n];
      },
      get disabled() {
        return offered()[n] === undefined;
      },
    });
    const openCard = () => {
      track('UI', 'Opened', 'TextDocumentSpelling');
      const { from } = view.state.selection;
      showOnCard(misspellingAt(view.state, from) ?? nearMisspelling(view.state, 1));
    };
    const move = (direction: 1 | -1) => () => {
      const m = nearMisspelling(active.state, direction);
      if (m) selectWord(active, m);
    };
    return {
      ...tools,
      ...Object.fromEntries(SPELLING_SUGGESTION_ITEMS.map((id, n) => [id, suggestion(n)])),
      // Google's Always correct to: the first suggestion now, and a substitution from then on.
      [SPELLING_ALWAYS_ITEM]: {
        run: () => {
          const m = here();
          const first = offered()[0];
          if (!m || first === undefined || !isKeepable(m.word, first)) return;
          const aids = readTypingAids();
          if (TypingAids.ownCount(aids) >= SUBSTITUTIONS_OWN_MAX) {
            setNotice(TOO_MANY_SUBSTITUTIONS);
            focusWriting(active);
            return;
          }
          replaceWith(active, m, first);
          track('Document', 'Changed', 'TextDocumentAlwaysCorrect');
          const pairs = aids.pairs.filter((p) => p.replace !== m.word);
          saveTypingAids(
            { ...aids, pairs: [{ replace: m.word, with: first, on: true }, ...pairs] },
            ownerId,
          );
          focusWriting(active);
        },
        get label() {
          const first = offered()[0];
          return first === undefined ? undefined : `Always correct to “${first}”`;
        },
        get disabled() {
          const m = here();
          const first = offered()[0];
          return !m || first === undefined || !isKeepable(m.word, first);
        },
      },
      [SPELLING_ADD_ITEM]: {
        run: () => {
          const m = here();
          if (m && addWord(m.word, active) === 'full') setNotice(DICTIONARY_FULL);
          focusWriting(active);
        },
        get disabled() {
          return here() === null;
        },
      },
      [SPELLING_IGNORE_ITEM]: {
        run: () => {
          const m = here();
          if (m) ignoreMisspelling(active, m.word);
          focusWriting(active);
        },
        get disabled() {
          return here() === null;
        },
      },
      [SPELLING_CHECK_ITEM]: { run: openCard },
      [SPELLING_CHECK_ROW]: { run: openCard },
      [MISSPELLING_KEY_ACTIONS.next]: { run: move(1) },
      [MISSPELLING_KEY_ACTIONS.previous]: { run: move(-1) },
    };
  }, [
    view,
    active,
    textWrites,
    ownerId,
    showSuggestions,
    setShowSuggestions,
    suggestions,
    addWord,
    replaceWith,
    showOnCard,
  ]);

  const closeCard = () => {
    setCard(null);
    focusWriting(view);
  };
  const cardShown =
    card && view && textWrites ? (
      <TextDocumentSpellingCard
        current={
          card.misspelling ? { word: card.misspelling.word, suggestions: card.suggestions } : null
        }
        onAccept={(word) => {
          if (!card.misspelling) return;
          replaceWith(view, card.misspelling, word);
          track('Document', 'Changed', 'TextDocumentSpellingAccepted');
          step(1);
        }}
        onIgnore={() => {
          if (!card.misspelling) return;
          ignoreMisspelling(view, card.misspelling.word);
          step(1);
        }}
        onAdd={() => {
          if (!card.misspelling) return;
          if (addWord(card.misspelling.word, view) === 'full') setNotice(DICTIONARY_FULL);
          else step(1);
        }}
        onNext={() => step(1)}
        onPrevious={() => step(-1)}
        onClose={closeCard}
      />
    ) : null;

  const dialog = dialogOpen ? (
    <TextDocumentPersonalDictionaryDialog
      words={personalWords.words}
      onAdd={(word) => addWord(word, active)}
      onRemove={(word) =>
        savePersonalDictionary(PersonalDictionary.remove(readPersonalDictionary(), word), ownerId)
      }
      onClose={() => {
        setDialogOpen(false);
        focusWriting(active);
      }}
    />
  ) : null;

  const noticeBar =
    notice !== null ? (
      <p
        role="status"
        className="border-b border-(--office-line) bg-(--office-chrome) px-4 py-2 text-center text-body text-(--office-ink)"
      >
        {notice}
      </p>
    ) : null;

  return { source, actions, notice: noticeBar, card: cardShown, dialog };
}
