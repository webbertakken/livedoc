'use client';

// The comments' margin beside the page (docs/specs/034-text-documents/review.md "Threads in the margin"): open threads'
// cards in a column to the right of the page, each level with its stretch's first line and stacked so none overlaps,
// the selected one level with its text; a draft's card where Add comment opened it; Add comment beside a selection of
// the body. While cards are shown and the window is wide enough the page moves left to make room; narrower, the column
// lies over the page's right edge. On a phone there is no column: the selected thread opens as a sheet at the bottom.
// Suggestion cards (review.md "Suggestion cards") stand in the same column, stacked with the threads'; a header's,
// footer's or note's level with its text as the page draws it (review.md "In a header, footer or note").
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { EditorView } from 'prosemirror-view';
import { lucideMessageSquarePlus } from '@livedoc/icons/lucide';
import { Tooltip, lucideGlyph } from '@livedoc/ui';
import { stackCards, type CardWanted } from '@/lib/text-document/text-document-threads';
import { TextDocumentDraftCard, TextDocumentThreadCard } from './TextDocumentThreadCard';
import type { TextDocumentCommenter } from '@/lib/text-document/text-document-commenter';
import type { TextDocumentThreads } from './useTextDocumentThreads';
import type { CardFocusRequest, TextDocumentThreadKeys } from './useTextDocumentThreadKeys';
import type { TextDocumentSuggestionCards } from './useTextDocumentSuggestionCards';
import { TextDocumentSuggestionCard } from './TextDocumentSuggestionCard';

/** A suggestion card's id in the column, apart from the threads'. */
const SUGGESTION = 'suggestion:';
const NO_SUGGESTIONS: TextDocumentSuggestionCards['cards'] = [];

/** The column's width and its gap from the page, in px (review.md, (default)). */
export const MARGIN_WIDTH_PX = 280;
export const MARGIN_GAP_PX = 16;
/** Below this width the margin is a sheet at the bottom of the window (the phone layout). */
export const MARGIN_SHEET_BELOW_PX = 640;

const AddCommentGlyph = lucideGlyph(lucideMessageSquarePlus, 18);

type Layout = {
  /** The page's room on the right, so it moves left. */
  reserve: number;
  /** The column's left edge in the wrapper. */
  left: number;
  /** Each card's top in the wrapper, by thread id (`draft` for the draft). */
  tops: ReadonlyMap<string, number>;
  /** Add comment's top beside the selection, or null. */
  add: number | null;
  sheet: boolean;
  /** The cards placed before this layout: they slide to their new tops; a new one appears in place. */
  slides: ReadonlySet<string>;
};

const NO_LAYOUT: Layout = {
  reserve: 0,
  left: 0,
  tops: new Map(),
  add: null,
  sheet: false,
  slides: new Set(),
};

export function TextDocumentMargin({
  view,
  threads,
  keys,
  commenter,
  selfUserId = null,
  subscribe,
  subscribeCaret,
  suggestions = null,
  storyTop,
  children,
}: {
  view: EditorView | null;
  threads: TextDocumentThreads;
  /** Going between threads from the keyboard: the card asked for the focus, J and K, U. */
  keys: Pick<TextDocumentThreadKeys, 'focusRequest' | 'step' | 'exit'>;
  commenter: TextDocumentCommenter | null;
  /** The reader's account, so a thread assigned to them reads "Assigned to you" (review.md "Assigning"). */
  selfUserId?: string | null;
  subscribe: (listener: () => void) => () => void;
  subscribeCaret: (listener: () => void) => () => void;
  /** The suggestions' cards, beside the threads'; none where the surface has none. */
  suggestions?: TextDocumentSuggestionCards | null;
  /** Where a position of a story's writing is drawn (its client top), or null where it is not. */
  storyTop?: (story: string, pos: number) => number | null;
  children: ReactNode;
}) {
  const wrapper = useRef<HTMLDivElement | null>(null);
  const column = useRef<HTMLElement | null>(null);
  const [layout, setLayout] = useState<Layout>(NO_LAYOUT);
  const { stretches, selected, draft } = threads;
  const suggestionCards = suggestions?.cards ?? NO_SUGGESTIONS;
  // A thread tied to a suggestion whose card is here is drawn in that card, never as a card of its own.
  const tiedTo = new Map(
    threads.threads.flatMap((t) =>
      t.suggestion !== undefined && suggestionCards.some((c) => c.id === t.suggestion)
        ? [[t.suggestion, t] as const]
        : [],
    ),
  );
  const tied = new Set([...tiedTo.values()].map((t) => t.id));
  const byId = new Map(threads.threads.filter((t) => !tied.has(t.id)).map((t) => [t.id, t]));
  const shown = stretches.filter((s) => byId.has(s.id));
  const cards = shown.length > 0 || draft !== null || suggestionCards.length > 0;
  // One card is selected: a thread, else a suggestion.
  const raised =
    selected ?? (suggestions?.selected ? `${SUGGESTION}${suggestions.selected}` : null);

  const measure = useCallback(() => {
    const box = wrapper.current;
    const page = box?.querySelector<HTMLElement>('[data-page-format]');
    if (!box || !page || !view || view.isDestroyed) return;
    const frame = box.getBoundingClientRect();
    const width = box.clientWidth;
    const sheet = width < MARGIN_SHEET_BELOW_PX;
    const pageWidth = page.getBoundingClientRect().width;
    const room = MARGIN_WIDTH_PX + MARGIN_GAP_PX;
    const reserve =
      cards && !sheet ? Math.max(0, Math.min(pageWidth + 2 * room - width, width - pageWidth)) : 0;
    const pageRight = (width - reserve + pageWidth) / 2;
    const left = Math.min(pageRight + MARGIN_GAP_PX, width - MARGIN_WIDTH_PX - 8);
    const topOf = (pos: number) => {
      try {
        return view.coordsAtPos(Math.min(pos, view.state.doc.content.size)).top - frame.top;
      } catch {
        return null;
      }
    };
    const height = (id: string) =>
      column.current?.querySelector<HTMLElement>(`[data-thread-card="${CSS.escape(id)}"]`)
        ?.offsetHeight ?? 0;
    const wanted: CardWanted[] = [];
    for (const s of shown) {
      const top = topOf(s.from);
      if (top !== null) wanted.push({ id: s.id, top, height: height(s.id) });
    }
    for (const c of suggestionCards) {
      const id = `${SUGGESTION}${c.id}`;
      const drawn = c.story === undefined ? null : (storyTop?.(c.story, c.from) ?? null);
      const top = c.story === undefined ? topOf(c.from) : drawn === null ? null : drawn - frame.top;
      if (top !== null) wanted.push({ id, top, height: height(id) });
    }
    wanted.sort((a, b) => a.top - b.top);
    if (draft) {
      const top = topOf(draft.from);
      if (top !== null) {
        const at = wanted.findIndex((w) => w.top > top);
        const card = { id: 'draft', top, height: height('draft') };
        wanted.splice(at < 0 ? wanted.length : at, 0, card);
      }
    }
    const { selection } = view.state;
    const add =
      commenter && !draft && !selection.empty && view.hasFocus() ? topOf(selection.from) : null;
    setLayout((was) => ({
      reserve,
      left,
      tops: stackCards(wanted, draft ? 'draft' : raised),
      add,
      sheet,
      slides: new Set(was.tops.keys()),
    }));
  }, [view, shown, suggestionCards, draft, raised, cards, commenter, storyTop]);

  // Measured again after any change that moves a card: the writing, the selection, the threads, a resize.
  const measureNow = useRef(measure);
  useEffect(() => {
    measureNow.current = measure;
  });
  useEffect(() => {
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => measureNow.current());
    };
    soon();
    const offBody = subscribe(soon);
    const offCaret = subscribeCaret(soon);
    const resized = new ResizeObserver(soon);
    if (wrapper.current) resized.observe(wrapper.current);
    if (column.current) resized.observe(column.current);
    return () => {
      cancelAnimationFrame(frame);
      offBody();
      offCaret();
      resized.disconnect();
    };
  }, [subscribe, subscribeCaret, stretches, suggestionCards, draft, raised, cards]);

  // A card asked for the focus takes it once it is placed (it is hidden until then), once per ask.
  useCardFocus(wrapper, keys.focusRequest, layout.tops);
  useCardFocus(wrapper, suggestions?.focusRequest ?? null, layout.tops);

  const card = (id: string) => {
    if (id.startsWith(SUGGESTION) && suggestions) {
      const suggestion = suggestionCards.find((c) => `${SUGGESTION}${c.id}` === id);
      return suggestion ? (
        <TextDocumentSuggestionCard
          card={suggestion}
          selected={raised === id}
          offers={suggestions.offers(suggestion)}
          onSelect={() => suggestions.select(suggestion.id)}
          onAccept={() => suggestions.accept(suggestion.id)}
          onReject={() => suggestions.reject(suggestion.id)}
          onStep={suggestions.step}
          onExit={suggestions.exit}
          replies={{
            thread: tiedTo.get(suggestion.id) ?? null,
            commenter,
            onReply: (text, mentions, assignee) =>
              threads.replyToSuggestion(suggestion, text, mentions, assignee),
            onEdit: threads.edit,
            onRemove: threads.remove,
            onReact: threads.react,
            names: threads.names,
          }}
        />
      ) : null;
    }
    if (id === 'draft')
      return draft && commenter ? (
        <TextDocumentDraftCard
          commenter={commenter}
          placed={layout.tops.has('draft')}
          onSend={threads.send}
          onCancel={threads.cancel}
        />
      ) : null;
    const thread = byId.get(id);
    const stretch = stretches.find((s) => s.id === id);
    if (!thread || !stretch) return null;
    return (
      <TextDocumentThreadCard
        thread={thread}
        deleted={stretch.deleted}
        selected={selected === id}
        commenter={commenter}
        onSelect={() => threads.select(id)}
        onReply={(text, mentions, assignee) => threads.reply(id, text, mentions, assignee)}
        selfUserId={selfUserId}
        onEdit={(commentId, text) => threads.edit(id, commentId, text)}
        onRemove={(commentId) => threads.remove(id, commentId)}
        onResolve={(resolved) => threads.resolve(id, resolved)}
        onStep={keys.step}
        onExit={keys.exit}
        onReact={(commentId, emoji, on) => threads.react(id, commentId, emoji, on)}
        names={threads.names}
      />
    );
  };

  const ids = [
    ...shown.map((s) => s.id),
    ...suggestionCards.map((c) => `${SUGGESTION}${c.id}`),
    ...(draft ? ['draft'] : []),
  ];
  // On a phone the selected card, or the draft, opens as a sheet at the bottom.
  const sheetId = draft ? 'draft' : raised;
  return (
    <div
      ref={wrapper}
      className="relative"
      style={{ paddingRight: layout.reserve }}
      data-comments-margin={cards ? 'shown' : 'none'}
    >
      {children}
      {layout.sheet ? (
        sheetId ? (
          <aside
            aria-label="Comment threads"
            className="fixed inset-x-0 bottom-0 z-20 max-h-[60vh] overflow-y-auto p-2"
          >
            {card(sheetId)}
          </aside>
        ) : null
      ) : (
        <aside
          ref={column}
          aria-label="Comment threads"
          className="absolute top-0"
          style={{ left: layout.left, width: MARGIN_WIDTH_PX }}
        >
          {ids.map((id) => (
            <div
              key={id}
              className={`absolute inset-x-0 ${layout.slides.has(id) ? 'transition-[top] duration-150 motion-reduce:transition-none' : ''}`}
              style={{
                top: layout.tops.get(id) ?? 0,
                visibility: layout.tops.has(id) ? 'visible' : 'hidden',
                zIndex: id === raised || id === 'draft' ? 2 : 1,
              }}
            >
              {card(id)}
            </div>
          ))}
          {layout.add !== null ? (
            <Tooltip label="Add comment">
              <button
                type="button"
                aria-label="Add comment"
                onMouseDown={(event) => event.preventDefault()}
                onClick={threads.addComment}
                className="absolute flex size-prominent cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                style={{ top: layout.add, left: 0 }}
              >
                <AddCommentGlyph />
              </button>
            </Tooltip>
          ) : null}
        </aside>
      )}
    </div>
  );
}

/** Focuses the card a request names once the margin has placed it, once per ask. */
function useCardFocus(
  wrapper: RefObject<HTMLDivElement | null>,
  request: CardFocusRequest | null,
  tops: ReadonlyMap<string, number>,
): void {
  const served = useRef(0);
  useEffect(() => {
    if (!request || served.current === request.n || !tops.has(request.id)) return;
    const frame = requestAnimationFrame(() => {
      served.current = request.n;
      wrapper.current
        ?.querySelector<HTMLElement>(`[data-thread-card="${CSS.escape(request.id)}"]`)
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [wrapper, request, tops]);
}
