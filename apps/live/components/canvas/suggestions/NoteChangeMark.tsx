'use client';

import { eventStormingNote, type Rect } from '@livedoc/document';
import { changeSummary } from '@/lib/change-caption';
import type { ChangeMark } from '@/lib/suggested-changes';
import { suggestionKeys } from './SuggestionPlaceholder';
import { PEEK_LENGTH_RATIO } from './SuggestionPeekTab';
import {
  SUGGESTION_INK_TEXT,
  SUGGESTION_STROKE_BORDER,
  SUGGESTION_TINT,
  suggestionStrokeVars,
} from './suggestion-colours';

// The change mark (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides"): a worded
// dashed tab on the top edge of a note that holds suggested changes, at its right end, in the family of the peek tab.
// It says what the first change is ("Reword", "Split", "Remove", "To Policy") and how many more the note holds
// ("Split +1"). Pointing at it, or focusing it, previews the note's first change; Enter accepts that one and Delete
// dismisses it. Never paper: an outline and a faint tint of the kind's hue.

// Canvas units, as the note's own words are: the tab is part of the board.
export const MARK_HEIGHT = 20;
// Set in from the corner, so it clears the tab an `after` suggestion tucks beside the note.
export const MARK_INSET = 8;
// The room kept to a peek tab standing above the note, in the middle of the same edge.
export const MARK_CLEAR = 4;
const MARK_PAD_X = 8;
const MARK_FONT = 12;
const MARK_RADIUS = 6;
const STROKE_PX = 2;
// The smallest hit target, in screen px, whatever the zoom (WCAG 2.2 2.5.8).
const MIN_HIT_PX = 24;

const WORD = { reword: 'Reword', split: 'Split', remove: 'Remove' } as const;
const titled = (label: string) => label.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

/** What the tab says: the first change, a kind change by the kind the note would become, and how many more. */
export function changeMarkWords(mark: Pick<ChangeMark, 'changes'>): string {
  const first = mark.changes[0]!;
  const word =
    first.change === 'kind'
      ? `To ${titled(eventStormingNote(first.kind).label)}`
      : WORD[first.change];
  const more = mark.changes.length - 1;
  return more > 0 ? `${word} +${more}` : word;
}

/** Where the mark stands, in canvas units: on the note's top edge, ending `right`, at most `maxWidth` long.
 *  `above`: a suggestion waits above the note, so the mark keeps clear of its peek tab. */
export function changeMarkPlace(
  note: Rect,
  above: boolean,
): { right: number; top: number; height: number; maxWidth: number } {
  const right = note.x + note.width - MARK_INSET;
  const peekRight = note.x + note.width / 2 + (note.width * PEEK_LENGTH_RATIO) / 2;
  return {
    right,
    top: note.y - MARK_HEIGHT,
    height: MARK_HEIGHT,
    maxWidth: above ? right - peekRight - MARK_CLEAR : note.width - 2 * MARK_INSET,
  };
}

export function changeMarkLabel(mark: ChangeMark): string {
  const more = mark.changes.length - 1;
  const kind = eventStormingNote(mark.kind).label.toLowerCase();
  const first = changeSummary(mark.note, mark.changes[0]!);
  return `Suggested change to this ${kind}: ${first}${more > 0 ? ` and ${more} more` : ''}`;
}

export function NoteChangeMark({
  mark,
  above,
  zoom,
  onPreview,
  onLeave,
  onAccept,
  onDismiss,
}: {
  mark: ChangeMark;
  // A suggestion waits above the note: keep clear of its peek tab.
  above: boolean;
  zoom: number;
  onPreview: () => void;
  onLeave: () => void;
  // Accept or dismiss the note's first change.
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const place = changeMarkPlace(mark.note, above);
  const px = 1 / zoom;
  const hit = MIN_HIT_PX * px;
  const hitH = Math.max(place.height, hit);
  return (
    <button
      type="button"
      aria-label={changeMarkLabel(mark)}
      aria-description="Enter accepts it, Delete dismisses it"
      data-change-mark={mark.note.id}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={onPreview}
      onPointerLeave={onLeave}
      onFocus={onPreview}
      onBlur={onLeave}
      // A click (a touch has no hover) shows the preview, whose caption decides; Enter accepts straight away.
      onClick={(e) => {
        e.stopPropagation();
        onPreview();
      }}
      onKeyDown={(e) => suggestionKeys(e, onAccept, onDismiss)}
      className="group pointer-events-auto absolute flex items-end justify-end focus-visible:outline-none"
      style={{
        // Its right end is the anchor: the words decide how far left it reaches.
        left: place.right,
        top: place.top + place.height - hitH,
        transform: 'translateX(-100%)',
        height: hitH,
        minWidth: hit,
        maxWidth: place.maxWidth,
        ...suggestionStrokeVars(mark.kind),
      }}
    >
      <span
        aria-hidden
        className={`block max-w-full truncate border-dashed font-semibold tabular-nums transition duration-150 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-brand-500 motion-reduce:transition-none ${SUGGESTION_TINT} ${SUGGESTION_STROKE_BORDER} ${SUGGESTION_INK_TEXT}`}
        style={{
          height: place.height,
          paddingInline: MARK_PAD_X,
          borderWidth: STROKE_PX * px,
          // Open where it meets the paper.
          borderBottomWidth: 0,
          borderRadius: `${MARK_RADIUS}px ${MARK_RADIUS}px 0 0`,
          fontSize: MARK_FONT,
          lineHeight: `${place.height - STROKE_PX * px}px`,
          transformOrigin: 'bottom right',
        }}
      >
        {changeMarkWords(mark)}
      </span>
    </button>
  );
}
