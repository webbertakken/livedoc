'use client';

import { ES_NOTE_GAP, eventStormingNote } from '@livedoc/document';
import type { SuggestionHint } from '@/lib/suggestion-hints';
import { suggestionKeys, suggestionName } from './SuggestionPlaceholder';
import {
  SUGGESTION_STROKE_BORDER,
  SUGGESTION_STROKE_TEXT,
  SUGGESTION_TINT,
  suggestionStrokeVars,
} from './suggestion-colours';

// A peek tab (docs/specs/021-event-storming/suggestions.md "How a person sees them"): a dashed tab tucked behind the
// anchor on the side the suggestion would land, open where it meets the paper, as if the note-to-be were waiting
// behind this one. One per anchor side, with a count when it holds several. Never paper: an outline and a faint tint.

// Beside the note it stays inside the gutter, so it never lies on the note beside.
export const PEEK_PROTRUDE = ES_NOTE_GAP * 0.75;
// Above and below, where lanes leave more room than the gutter (default).
export const PEEK_PROTRUDE_ACROSS = 18;
// A quarter of the anchor's edge, set towards the top beside the note so the next-note tab keeps the middle.
export const PEEK_LENGTH_RATIO = 0.24;
export const PEEK_OFFSET_RATIO = 0.1;
const STROKE_PX = 2;
// The smallest hit target, in screen px, whatever the zoom (WCAG 2.2 target size).
const MIN_HIT_PX = 24;

const SIDE_WORD = { before: 'before', after: 'after', above: 'above', below: 'below' } as const;

export function hintLabel(hint: SuggestionHint): string {
  const more = hint.suggestions.length - 1;
  const anchorKind = eventStormingNote(hint.anchor.esKind!).label.toLowerCase();
  const first = suggestionName(hint.suggestions[0]!);
  return `Suggested ${SIDE_WORD[hint.side]} this ${anchorKind}: ${first}${more > 0 ? ` and ${more} more` : ''}`;
}

// The tab's box in canvas units, and the edge it is open on.
export function peekTabBox(hint: SuggestionHint) {
  const a = hint.anchor;
  const along = hint.side === 'before' || hint.side === 'after';
  const edge = along ? a.height : a.width;
  const length = edge * PEEK_LENGTH_RATIO;
  const out = along ? PEEK_PROTRUDE : PEEK_PROTRUDE_ACROSS;
  const top = a.y + edge * PEEK_OFFSET_RATIO;
  const centredX = a.x + a.width / 2 - length / 2;
  switch (hint.side) {
    case 'before':
      return { left: a.x - out, top, width: out, height: length, open: 'Right' };
    case 'after':
      return { left: a.x + a.width, top, width: out, height: length, open: 'Left' };
    case 'above':
      return { left: centredX, top: a.y - out, width: length, height: out, open: 'Bottom' };
    case 'below':
      return { left: centredX, top: a.y + a.height, width: length, height: out, open: 'Top' };
  }
}

const RADIUS = {
  Right: (r: number) => `${r}px 0 0 ${r}px`,
  Left: (r: number) => `0 ${r}px ${r}px 0`,
  Bottom: (r: number) => `${r}px ${r}px 0 0`,
  Top: (r: number) => `0 0 ${r}px ${r}px`,
};

export function SuggestionPeekTab({
  hint,
  zoom,
  onPreview,
  onLeave,
  onApply,
  onDismiss,
}: {
  hint: SuggestionHint;
  zoom: number;
  onPreview: () => void;
  onLeave: () => void;
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const box = peekTabBox(hint);
  const px = 1 / zoom;
  const hitW = Math.max(box.width, MIN_HIT_PX * px);
  const hitH = Math.max(box.height, MIN_HIT_PX * px);
  const borders = Object.fromEntries(
    ['Top', 'Right', 'Bottom', 'Left'].map((edge) => [
      `border${edge}Width`,
      edge === box.open ? 0 : STROKE_PX * px,
    ]),
  );
  const count = hint.suggestions.length;
  const first = hint.suggestions[0]!.id;
  return (
    <button
      type="button"
      aria-label={hintLabel(hint)}
      aria-description="Enter applies it, Delete dismisses it"
      data-suggestion-hint={hint.key}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={onPreview}
      onPointerLeave={onLeave}
      onFocus={onPreview}
      onBlur={onLeave}
      // A click (a touch has no hover) shows the preview, whose ✓ and ✕ act; Enter applies straight away.
      onClick={(e) => {
        e.stopPropagation();
        onPreview();
      }}
      onKeyDown={(e) =>
        suggestionKeys(
          e,
          () => onApply(first),
          () => onDismiss(first),
        )
      }
      className="group pointer-events-auto absolute flex items-center justify-center focus-visible:outline-none"
      style={{
        left: box.left + box.width / 2 - hitW / 2,
        top: box.top + box.height / 2 - hitH / 2,
        width: hitW,
        height: hitH,
        ...suggestionStrokeVars(hint.kind),
      }}
    >
      <span
        aria-hidden
        data-suggestion-peek={hint.side}
        className={`flex items-center justify-center border-dashed font-semibold tabular-nums transition duration-150 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-brand-500 motion-reduce:transition-none ${SUGGESTION_TINT} ${SUGGESTION_STROKE_BORDER} ${SUGGESTION_STROKE_TEXT}`}
        style={{
          width: box.width,
          height: box.height,
          ...borders,
          borderRadius: RADIUS[box.open as keyof typeof RADIUS](PEEK_PROTRUDE * 0.5),
          fontSize: Math.min(box.width, box.height) * 0.8,
        }}
      >
        {count > 1 ? count : null}
      </span>
    </button>
  );
}
