'use client';

import { useRef } from 'react';
import { CheckIcon, CloseIcon } from '@livedoc/ui';
import type { EventStormingNoteKind, Rect } from '@livedoc/document';
import type { ChangeCaption as Caption } from '@/lib/change-caption';
import { useKeepInWindow } from '@/hooks/canvas/useKeepInWindow';
import { SUGGESTION_STROKE_TEXT, suggestionStrokeVars } from './suggestion-colours';

// The caption of a previewed note change (docs/specs/021-event-storming/suggested-changes.md "How a person sees and
// decides"): what changes, the agent's reason, how far a reword reaches, who suggested it, and the decision: ✓, ✕,
// and Everywhere for a reword that notes beyond its context hold. It sits under the note, never on its paper, so the
// previewed note reads whole. Canvas units, kept at screen size whatever the zoom, and moved back inside the window
// while its note stands at an edge (useKeepInWindow): a decision is never offered out of reach.

const WIDTH_PX = 300;
const ACTION_PX = 28;
const GAP_PX = 8;

const ICON_BUTTON =
  'flex shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-brand-600';

export function ChangeCaption({
  caption,
  summary,
  kind,
  anchor,
  zoom,
  onAccept,
  onEverywhere,
  onDismiss,
  onPreview,
  onPreviewEverywhere,
  onLeave,
}: {
  caption: Caption;
  // The change in one line, for the buttons' names.
  summary: string;
  // The note's kind: the hue the change is named in.
  kind: EventStormingNoteKind;
  // The note's box, canvas units.
  anchor: Rect;
  zoom: number;
  onAccept: () => void;
  onEverywhere: () => void;
  onDismiss: () => void;
  // Pointing at or focusing the caption keeps the preview; Everywhere previews the reword across the board.
  onPreview: () => void;
  onPreviewEverywhere: () => void;
  onLeave: () => void;
}) {
  const px = 1 / zoom;
  const ref = useRef<HTMLDivElement>(null);
  useKeepInWindow(ref, px);
  const action = { width: ACTION_PX * px, height: ACTION_PX * px };
  const small = { fontSize: 12 * px };
  return (
    <div
      ref={ref}
      role="group"
      aria-label={`Suggested change: ${summary}`}
      data-change-caption
      onPointerDown={(e) => e.stopPropagation()}
      onPointerEnter={onPreview}
      onPointerLeave={onLeave}
      className="pointer-events-auto absolute rounded-md border border-slate-200 bg-white text-slate-700 shadow-md shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:shadow-slate-950/40"
      style={{
        left: anchor.x,
        top: anchor.y + anchor.height + GAP_PX * px,
        width: Math.max(anchor.width, WIDTH_PX * px),
        padding: `${10 * px}px ${12 * px}px ${8 * px}px`,
        fontSize: 13 * px,
        lineHeight: 1.4,
        ...suggestionStrokeVars(kind),
      }}
    >
      <p>
        <span className={`font-semibold ${SUGGESTION_STROKE_TEXT}`} style={small}>
          {caption.title}
        </span>{' '}
        <span className="font-semibold text-slate-900 dark:text-slate-50">{caption.what}</span>
      </p>
      {caption.reason ? <p style={{ marginTop: 4 * px }}>{caption.reason}</p> : null}
      {caption.ripple ? (
        <p className="text-slate-600 dark:text-slate-400" style={{ ...small, marginTop: 4 * px }}>
          {caption.ripple}
        </p>
      ) : null}
      <div className="flex items-center" style={{ gap: 4 * px, marginTop: 6 * px }}>
        <span className="min-w-0 flex-1 text-slate-600 dark:text-slate-400" style={small}>
          {caption.by ? `Suggested by ${caption.by}` : null}
        </span>
        {caption.everywhere ? (
          <button
            type="button"
            aria-label={`Accept everywhere: ${summary}`}
            onClick={onEverywhere}
            onPointerEnter={onPreviewEverywhere}
            onPointerLeave={onPreview}
            onFocus={onPreviewEverywhere}
            onBlur={onLeave}
            className="shrink-0 rounded-md border border-slate-300 font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
            style={{ ...small, height: ACTION_PX * px, padding: `0 ${10 * px}px` }}
          >
            Everywhere
          </button>
        ) : null}
        <button
          type="button"
          aria-label={`Accept: ${summary}`}
          onClick={onAccept}
          onFocus={onPreview}
          onBlur={onLeave}
          className={`${ICON_BUTTON} text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950`}
          style={action}
        >
          <CheckIcon size={14 * px} />
        </button>
        <button
          type="button"
          aria-label={`Dismiss: ${summary}`}
          onClick={onDismiss}
          onFocus={onPreview}
          onBlur={onLeave}
          className={`${ICON_BUTTON} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`}
          style={action}
        >
          <CloseIcon size={14 * px} />
        </button>
      </div>
    </div>
  );
}
