// Comment threads in the editor (docs/specs/034-text-documents/review.md "Threads in the margin", "How a comment is
// kept"): each open thread's stretch as positions in the writing the editor shows, the stretch Add comment comments
// on, the anchors a new thread is kept by, the margin's cards stacked so none overlaps, and the plugin that tints each
// stretch and selects a thread when its text is pressed.
import type { EditorState } from 'prosemirror-state';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { absolutePositionToRelativePosition } from 'y-prosemirror';
import * as Y from 'yjs';
import { LiveThreads, type TextDocumentThread } from '@livedoc/text-documents';
import { bindingOf, resolveBytes } from './text-document-relative-positions';

/** An open thread's stretch in the writing shown: `deleted` once every character of it is gone. */
export type ThreadStretch = {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly deleted: boolean;
};

/**
 * The open threads whose stretch lies in the writing the editor shows, in the writing's order (then by id); a thread
 * of another document tab, or whose positions no longer resolve, is not among them.
 */
export function threadStretches(
  state: EditorState,
  threads: readonly TextDocumentThread[],
): ThreadStretch[] {
  const y = bindingOf(state);
  if (!y || y.binding!.mapping.size === 0) return [];
  const size = state.doc.content.size;
  const out: ThreadStretch[] = [];
  for (const thread of threads) {
    if (thread.resolved) continue;
    const from = resolveBytes(thread.start, y, size);
    const to = resolveBytes(thread.end, y, size);
    if (from === null || to === null) continue;
    const deleted = LiveThreads.anchor(y.doc, thread)?.deleted ?? false;
    out.push({ id: thread.id, from, to: deleted ? from : Math.max(from, to), deleted });
  }
  return out.sort((a, b) => a.from - b.from || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const WORD = /[\p{L}\p{N}_'’]/u;
/** A leaf inline (a picture, a field) read as one character, so offsets in the text match positions. */
const LEAF = '\ufffc';

/** What Add comment comments on: the selection when there is one, else the word at the caret, else nothing. */
export function stretchToComment(state: EditorState): { from: number; to: number } | null {
  const { from, to, $from, empty } = state.selection;
  if (!empty) return { from, to };
  const parent = $from.parent;
  if (!parent.isTextblock) return null;
  const text = parent.textBetween(0, parent.content.size, undefined, LEAF);
  let start = $from.parentOffset;
  let end = start;
  while (start > 0 && WORD.test(text[start - 1]!)) start -= 1;
  while (end < text.length && WORD.test(text[end]!)) end += 1;
  if (start === end) return null;
  const at = $from.start();
  return { from: at + start, to: at + end };
}

/**
 * The anchor a new thread on `from`..`to` is kept by: its start tied to the stretch's first character, so text typed
 * before it stays out; its end to its last, so text typed after it stays out (review.md "How a comment is kept"); and
 * the stretch's text as its quote. Null before the binding has mapped the writing.
 */
export function anchorsOf(
  state: EditorState,
  from: number,
  to: number,
): { start: Uint8Array; end: Uint8Array; quote: string } | null {
  const y = bindingOf(state);
  if (!y || y.binding!.mapping.size === 0) return null;
  const mapping = y.binding!.mapping as never;
  // y-prosemirror types its answer as any; it is a Yjs relative position, tied to the character after it.
  const relative = (pos: number) =>
    absolutePositionToRelativePosition(pos, y.type, mapping) as unknown as Y.RelativePosition;
  const end = Y.createAbsolutePositionFromRelativePosition(relative(to), y.doc);
  if (!end) return null;
  return {
    start: Y.encodeRelativePosition(relative(from)),
    end: Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(end.type, end.index, -1)),
    quote: state.doc.textBetween(from, to, '\n', ''),
  };
}

/** A card the margin places: the top it wants (level with its stretch) and its height. */
export type CardWanted = { readonly id: string; readonly top: number; readonly height: number };

/** The gap between two cards that would overlap, in px (review-surfaces.md "Comment threads"). */
export const CARD_GAP_PX = 8;

/**
 * Each card's top, in the order given (the stretches' order): none overlapping, each at least `gap` below the one
 * before; the selected card level with its stretch, the cards above it moved up to make room, those below it down.
 */
export function stackCards(
  wanted: readonly CardWanted[],
  selected: string | null,
  gap = CARD_GAP_PX,
): Map<string, number> {
  const tops = new Map<string, number>();
  const at = selected === null ? -1 : wanted.findIndex((c) => c.id === selected);
  const pivot = Math.max(at, 0);
  if (wanted.length === 0) return tops;
  tops.set(wanted[pivot]!.id, wanted[pivot]!.top);
  for (let i = pivot + 1; i < wanted.length; i += 1) {
    const above = wanted[i - 1]!;
    tops.set(wanted[i]!.id, Math.max(wanted[i]!.top, tops.get(above.id)! + above.height + gap));
  }
  for (let i = pivot - 1; i >= 0; i -= 1) {
    const below = wanted[i + 1]!;
    tops.set(
      wanted[i]!.id,
      Math.min(wanted[i]!.top, tops.get(below.id)! - wanted[i]!.height - gap),
    );
  }
  return tops;
}

/** What the highlight shows: the open threads' stretches, the selected one, and a draft's stretch. */
export type ThreadHighlight = {
  readonly stretches: readonly ThreadStretch[];
  readonly selected: string | null;
  readonly draft: { readonly from: number; readonly to: number } | null;
};

export const threadHighlightKey = new PluginKey<ThreadHighlight>('text-document-threads');

const EMPTY: ThreadHighlight = { stretches: [], selected: null, draft: null };

/**
 * Sets what the highlight shows. The step changes no writing, so it carries no `addToHistory`: y-prosemirror ends the
 * undo step being gathered on any update marked so, which would split a run of typing into steps.
 */
export function setThreadHighlight(view: EditorView, highlight: ThreadHighlight): void {
  if (view.isDestroyed) return;
  view.dispatch(view.state.tr.setMeta(threadHighlightKey, highlight));
}

/** The innermost stretch holding `pos`: the shortest, for threads that overlap. */
export function threadAt(stretches: readonly ThreadStretch[], pos: number): string | null {
  let best: ThreadStretch | null = null;
  for (const s of stretches)
    if (
      !s.deleted &&
      s.from <= pos &&
      pos <= s.to &&
      (!best || s.to - s.from < best.to - best.from)
    )
      best = s;
  return best?.id ?? null;
}

/**
 * Tints each thread's stretch, the selected one and a draft's darker; pressing in a stretch selects its thread, and
 * pressing elsewhere lets a selected one go. The stretches move with the writing until they are set again.
 */
export function threadHighlightPlugin(deps: { onSelect: (id: string | null) => void }): Plugin {
  return new Plugin<ThreadHighlight>({
    key: threadHighlightKey,
    state: {
      init: () => EMPTY,
      apply: (tr, value) => {
        const set = tr.getMeta(threadHighlightKey) as ThreadHighlight | undefined;
        if (set) return set;
        if (!tr.docChanged) return value;
        const map = (from: number, to: number) => ({
          from: tr.mapping.map(from, 1),
          to: Math.max(tr.mapping.map(from, 1), tr.mapping.map(to, -1)),
        });
        return {
          ...value,
          stretches: value.stretches.map((s) => ({ ...s, ...map(s.from, s.to) })),
          draft: value.draft && map(value.draft.from, value.draft.to),
        };
      },
    },
    props: {
      decorations: (state) => {
        const { stretches, selected, draft } = threadHighlightKey.getState(state) ?? EMPTY;
        const size = state.doc.content.size;
        const tint = (from: number, to: number, attrs: Record<string, string>) =>
          to > from && to <= size ? [Decoration.inline(from, to, attrs)] : [];
        return DecorationSet.create(state.doc, [
          ...stretches.flatMap((s) =>
            s.deleted
              ? []
              : tint(s.from, s.to, {
                  class:
                    s.id === selected
                      ? 'text-document-comment text-document-comment-selected'
                      : 'text-document-comment',
                  'data-thread': s.id,
                }),
          ),
          ...(draft
            ? tint(draft.from, draft.to, {
                class: 'text-document-comment text-document-comment-selected',
              })
            : []),
        ]);
      },
      handleClick: (view, pos) => {
        const { stretches, selected } = threadHighlightKey.getState(view.state) ?? EMPTY;
        const id = threadAt(stretches, pos);
        if (id !== selected) deps.onSelect(id);
        return false;
      },
    },
  });
}
