'use client';

import type { KeyboardEvent } from 'react';
import { CheckIcon, CloseIcon } from '@livedoc/ui';
import { eventStormingNote, type Rect } from '@livedoc/document';
import type { SuggestionElement } from '@/lib/suggestion-hints';
import { suggestionStrokeVars } from './suggestion-colours';

// A placeholder (docs/specs/021-event-storming/suggestions.md "How a person sees them"): a suggestion drawn where it
// would land, as pale paper (the kind's paper over white, in either scheme) inside a dashed border in the kind's
// darker stroke, the kind named small above its words, with ✓ and ✕. Pale and dashed so it never reads as a note
// someone wrote; the darker stroke and the words keep their contrast on the pale paper in either scheme.
//
// `zoom` keeps the outline, the actions and the caption at screen size whatever the zoom.

const ACTION_PX = 28;
// The kind's paper over white: pale enough to read as not-yet-a-note.
const PAPER_ALPHA = '66';

export function suggestionName(s: SuggestionElement): string {
  return `${eventStormingNote(s.esKind).label} “${s.label ?? ''}”`;
}

// Enter applies, Delete or Backspace dismisses (docs/specs/021-event-storming/suggestions.md "Keyboard"). The keys
// stop here, so the canvas never reads Delete as "delete the selection".
export function suggestionKeys(e: KeyboardEvent, onApply: () => void, onDismiss: () => void): void {
  if (e.key === 'Enter') onApply();
  else if (e.key === 'Delete' || e.key === 'Backspace') onDismiss();
  else return;
  e.preventDefault();
  e.stopPropagation();
}

export function SuggestionPlaceholder({
  suggestion,
  spot,
  zoom,
  caption,
  onApply,
  onDismiss,
  onPreview,
  onLeave,
}: {
  suggestion: SuggestionElement;
  spot: Rect;
  zoom: number;
  // The agent's reason and who suggested it, under the placeholder.
  caption: boolean;
  onApply: (id: string) => void;
  onDismiss: (id: string) => void;
  // Pointing at or focusing the placeholder keeps (or starts) its preview.
  onPreview: () => void;
  onLeave: () => void;
}) {
  const note = eventStormingNote(suggestion.esKind);
  const px = 1 / zoom;
  const name = suggestionName(suggestion);
  const { reason, by } = suggestion.esSuggestion;
  const apply = () => onApply(suggestion.id);
  const dismiss = () => onDismiss(suggestion.id);
  return (
    <div
      role="group"
      tabIndex={0}
      aria-label={`Suggestion: ${name}`}
      aria-description="Enter applies it, Delete dismisses it"
      data-suggestion-placeholder={suggestion.id}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={onPreview}
      onPointerLeave={onLeave}
      onFocus={onPreview}
      onBlur={onLeave}
      onKeyDown={(e) => suggestionKeys(e, apply, dismiss)}
      className="group pointer-events-auto absolute focus-visible:outline-none"
      style={{
        left: spot.x,
        top: spot.y,
        width: spot.width,
        height: spot.height,
        ...suggestionStrokeVars(suggestion.esKind),
      }}
    >
      <div
        className="flex h-full w-full flex-col items-center justify-center border-dashed bg-white [border-color:var(--suggestion-stroke-light)] group-focus-visible:ring-2 group-focus-visible:ring-brand-500 group-focus-visible:ring-offset-2"
        style={{
          borderWidth: 2 * px,
          borderRadius: spot.height * 0.03,
          backgroundImage: `linear-gradient(${note.fill}${PAPER_ALPHA}, ${note.fill}${PAPER_ALPHA})`,
          padding: spot.height * 0.08,
          gap: spot.height * 0.03,
        }}
      >
        <span
          className="font-semibold uppercase tracking-wide [color:var(--suggestion-stroke-light)]"
          style={{ fontSize: spot.height * 0.06 }}
        >
          {note.label}
        </span>
        <span
          className="text-balance text-center font-semibold leading-tight text-slate-900"
          style={{ fontSize: spot.height * 0.1 }}
        >
          {suggestion.label}
        </span>
      </div>
      <div className="absolute flex" style={{ right: 6 * px, bottom: 6 * px, gap: 4 * px }}>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Apply suggestion: ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            apply();
          }}
          className="flex items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm shadow-slate-900/20 transition hover:bg-emerald-800"
          style={{ width: ACTION_PX * px, height: ACTION_PX * px }}
        >
          <CheckIcon size={14 * px} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Dismiss suggestion: ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          className="flex items-center justify-center rounded-full bg-white text-slate-700 shadow-sm shadow-slate-900/20 ring-1 ring-slate-300 transition hover:bg-slate-100"
          style={{ width: ACTION_PX * px, height: ACTION_PX * px }}
        >
          <CloseIcon size={14 * px} />
        </button>
      </div>
      {caption && (reason || by) ? (
        <div
          data-suggestion-caption
          className="absolute left-0 rounded-md border border-slate-200 bg-white text-slate-700 shadow-md shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:shadow-slate-950/40"
          style={{
            top: spot.height + 8 * px,
            width: Math.max(spot.width, 240 * px),
            padding: `${8 * px}px ${10 * px}px`,
            fontSize: 13 * px,
            lineHeight: 1.4,
          }}
        >
          {reason ? <p>{reason}</p> : null}
          {by ? (
            <p
              className="text-slate-600 dark:text-slate-400"
              style={{ marginTop: reason ? 4 * px : 0, fontSize: 12 * px }}
            >
              Suggested by {by}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
