'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { eventStormingNote, type EventStormingNoteKind } from '@livedoc/document';

// The small parts the Review panel's tabs share (docs/specs/021-event-storming/board-review.md): a note kind's
// swatch, the quiet pill an act is pressed on, a group's heading and the line an empty tab says.

/** A note kind, as the paper it is written on. */
export function KindSwatch({ kind, size = 9 }: { kind: EventStormingNoteKind; size?: number }) {
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-[2px] border border-black/10"
      style={{ width: size, height: size, backgroundColor: eventStormingNote(kind).fill }}
    />
  );
}

/** An act on a row: a quiet pill, 28 px tall. */
export function RowAct({
  lead,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { lead?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-slate-300 px-2.5 text-xs font-medium text-slate-800 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
    >
      {lead ? <span className="flex shrink-0">{lead}</span> : null}
      <span className="text-optical-centre">{children}</span>
    </button>
  );
}

export const REVIEW_HEADING =
  'px-3.5 pb-1 pt-3 text-[11px] font-semibold text-slate-600 dark:text-slate-400';
export const REVIEW_MUTED = 'text-xs text-slate-600 dark:text-slate-400';
// A row that is pointed at, focused or in hand.
export const REVIEW_ROW =
  'mx-1 rounded-lg outline-none hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800';

/** What a tab says when it has nothing to list. */
export function ReviewEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="px-3.5 py-6 text-center text-sm text-slate-600 dark:text-slate-400">{children}</p>
  );
}
