'use client';

import { eventStormingNote, type Rect } from '@livedoc/document';
import { changeSummary } from '@/lib/change-caption';
import type { ChangeMark } from '@/lib/suggested-changes';
import { suggestionKeys } from './SuggestionPlaceholder';
import { PEEK_PROTRUDE, PEEK_PROTRUDE_ACROSS } from './SuggestionPeekTab';
import {
  SUGGESTION_STROKE_BORDER,
  SUGGESTION_STROKE_TEXT,
  SUGGESTION_TINT,
  suggestionStrokeVars,
} from './suggestion-colours';

// The change mark (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides"): a small dashed
// tab on the top right corner of a note that holds suggested changes, in the family of the peek tab, with the count
// when it holds more than one. Pointing at it, or focusing it, previews the note's first change; Enter accepts that
// one and Delete dismisses it. Never paper: an outline and a faint tint of the kind's hue.

// Along the top edge: as long as a peek tab, and set in from the corner so it clears the tab an `after` suggestion
// tucks beside the note.
export const MARK_LENGTH_RATIO = 0.24;
export const MARK_INSET_RATIO = 0.04;
const STROKE_PX = 2;
// The smallest hit target, in screen px, whatever the zoom (WCAG 2.2 2.5.8).
const MIN_HIT_PX = 24;

/** The mark's box in canvas units: standing on the note's top edge, at its right end. */
export function changeMarkBox(note: Rect): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const width = note.width * MARK_LENGTH_RATIO;
  return {
    left: note.x + note.width - width - note.width * MARK_INSET_RATIO,
    top: note.y - PEEK_PROTRUDE_ACROSS,
    width,
    height: PEEK_PROTRUDE_ACROSS,
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
  zoom,
  onPreview,
  onLeave,
  onAccept,
  onDismiss,
}: {
  mark: ChangeMark;
  zoom: number;
  onPreview: () => void;
  onLeave: () => void;
  // Accept or dismiss the note's first change.
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const box = changeMarkBox(mark.note);
  const px = 1 / zoom;
  const hitW = Math.max(box.width, MIN_HIT_PX * px);
  const hitH = Math.max(box.height, MIN_HIT_PX * px);
  const count = mark.changes.length;
  const radius = PEEK_PROTRUDE * 0.5;
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
      className="group pointer-events-auto absolute flex items-end justify-center focus-visible:outline-none"
      style={{
        left: box.left + box.width / 2 - hitW / 2,
        top: box.top + box.height - hitH,
        width: hitW,
        height: hitH,
        ...suggestionStrokeVars(mark.kind),
      }}
    >
      <span
        aria-hidden
        className={`flex items-center justify-center border-dashed font-semibold tabular-nums transition duration-150 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-brand-500 motion-reduce:transition-none ${SUGGESTION_TINT} ${SUGGESTION_STROKE_BORDER} ${SUGGESTION_STROKE_TEXT}`}
        style={{
          width: box.width,
          height: box.height,
          borderWidth: STROKE_PX * px,
          // Open where it meets the paper.
          borderBottomWidth: 0,
          borderRadius: `${radius}px ${radius}px 0 0`,
          fontSize: box.height * 0.8,
          transformOrigin: 'bottom',
        }}
      >
        {count > 1 ? count : null}
      </span>
    </button>
  );
}
