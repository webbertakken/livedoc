// Automatically correct spelling (docs/specs/034-text-documents/tools.md "Spelling and grammar"): as a word ends (a
// space, punctuation, Enter), the checker is asked for a correction it is sure of; the answer comes from the worker a
// moment later, and lands only if the word is still as typed, as its own undo step. The keystroke is never held up
// or consumed: the typing aids and the editor take it as ever.
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Mapping, type StepMap } from 'prosemirror-transform';
import type { EditorView } from 'prosemirror-view';
import { debugLog } from '@/lib/debug-log';
import { PersonalDictionary } from '@/lib/spelling/personal-dictionary';
import { spellingLanguageFor, type SpellingLanguage } from '@/lib/spelling/spelling-languages';
import { checkableWords } from '@/lib/spelling/spelling-words';
import { track } from '@/lib/telemetry';
import { spellingKey, type SpellingSource } from './text-document-spelling';
import { startUndoStep } from './text-document-undo';

/** What ends a word for correction: a space and the common punctuation (Enter is a key of its own). */
export const AUTOCORRECT_WORD_ENDS: ReadonlySet<string> = new Set([
  ' ',
  '.',
  ',',
  ';',
  ':',
  '!',
  '?',
  ')',
]);

type Held = {
  readonly from: number;
  readonly to: number;
  readonly word: string;
  readonly language: SpellingLanguage;
  /** Where in the change log it was taken: what came after maps it. */
  readonly at: number;
};

/** Every change since a correction was asked for, to place its answer; empty while none waits. */
type AutocorrectState = { readonly log: readonly StepMap[] };

const autocorrectKey = new PluginKey<AutocorrectState>('text-document-autocorrect');

export type AutocorrectInput = {
  readonly source: SpellingSource;
  /** Preferences > Automatically correct spelling. */
  readonly enabled: () => boolean;
};

/** The checkable word ending at `pos` in its paragraph, with the dictionary its language takes; null with none. */
function wordEndingAt(
  state: EditorState,
  pos: number,
  input: AutocorrectInput,
): Omit<Held, 'at'> | null {
  const $pos = state.doc.resolve(pos);
  const block: PmNode = $pos.parent;
  if (!block.isTextblock || input.source.skipped?.(block)) return null;
  const start = $pos.start();
  // An object in the line stands for a letter no word has: words never run across it.
  const before = state.doc.textBetween(start, pos, undefined, '\ufffc');
  const last = checkableWords(before).at(-1);
  if (!last || last.to !== before.length) return null;
  const text = $pos.nodeBefore;
  const tag = (text && input.source.runLanguage?.(text)) ?? input.source.language();
  const language = spellingLanguageFor(tag);
  if (!language) return null;
  return { from: start + last.from, to: start + last.to, word: last.word, language };
}

export function autocorrectPlugin(input: AutocorrectInput): Plugin<AutocorrectState> {
  let waiting = 0;

  const correct = (view: EditorView, pos: number) => {
    const { source } = input;
    if (!input.enabled() || !source.shown()) return;
    const found = wordEndingAt(view.state, pos, input);
    if (!found) return;
    const ignored = spellingKey.getState(view.state)?.ignored;
    if (PersonalDictionary.has(source.personal(), found.word) || ignored?.has(found.word)) return;
    // Known to be spelt right: nothing to ask.
    if (source.checker.known(found.language, found.word) === true) return;
    const held: Held = { ...found, at: autocorrectKey.getState(view.state)?.log.length ?? 0 };
    waiting++;
    void source.checker
      .correct(held.language, held.word)
      .then((correction) => {
        if (correction === null || view.isDestroyed) return;
        const log = autocorrectKey.getState(view.state)?.log ?? [];
        const since = new Mapping(log.slice(held.at));
        const from = since.mapResult(held.from, 1);
        const to = since.mapResult(held.to, -1);
        if (
          from.deleted ||
          to.deleted ||
          view.state.doc.textBetween(from.pos, to.pos) !== held.word
        ) {
          debugLog('[spelling] correction dropped', { reason: 'changed' });
          return;
        }
        startUndoStep(view);
        view.dispatch(view.state.tr.insertText(correction, from.pos, to.pos));
        startUndoStep(view);
        track('Document', 'Changed', 'TextDocumentSpellingCorrected');
        debugLog('[spelling] corrected', { language: held.language });
      })
      .finally(() => {
        waiting--;
        // Nothing waits: the log starts again empty.
        if (waiting === 0 && !view.isDestroyed)
          view.dispatch(view.state.tr.setMeta(autocorrectKey, 'clear'));
      });
  };

  return new Plugin<AutocorrectState>({
    key: autocorrectKey,
    state: {
      init: () => ({ log: [] }),
      apply: (tr, value) => {
        if (tr.getMeta(autocorrectKey) === 'clear') return waiting === 0 ? { log: [] } : value;
        return tr.docChanged && waiting > 0 ? { log: [...value.log, ...tr.mapping.maps] } : value;
      },
    },
    props: {
      // Seen first, never taken: the word is the one before what was typed.
      handleTextInput: (view, from, _to, text) => {
        if (AUTOCORRECT_WORD_ENDS.has(text)) correct(view, from);
        return false;
      },
      handleKeyDown: (view, event) => {
        const plainEnter =
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey;
        if (plainEnter && view.state.selection.empty) correct(view, view.state.selection.from);
        return false;
      },
    },
  });
}
