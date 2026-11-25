'use client';

// The comments panel's body (docs/specs/012-collaboration/review-surfaces.md "The comments panel"; for a text document
// docs/specs/034-text-documents/review.md "The comments panel"): whose and which threads, and the kind's own group (a
// document tab) where there is more than one; then each thread the filters let through, its anchor's words, its first
// comment, its replies, and for a resolved one Reopen. A press on a row goes to its thread; Up, Down, Home and End move
// between rows. The kind holds the filters, so they last while the panel closes and opens again.
import type { KeyboardEvent } from 'react';
import { CheckIcon } from '@livedoc/ui';
import type { Comment } from '@livedoc/document';
import { OFFICE_PANEL_SELECT } from '@/components/office/OfficePanel';
import { CommentSummary } from '@/components/panels/CommentSummary';
import {
  countLabel,
  filterRows,
  repliesLabel,
  type ReviewFilters,
  type ReviewState,
  type ReviewThreadRow,
  type ReviewWho,
} from '@/lib/office/review/comment-filters';
import { debugLog } from '@/lib/debug-log';

const WHO: readonly (readonly [ReviewWho, string])[] = [
  ['all', 'All comments'],
  ['for-you', 'For you'],
];
const STATE: readonly (readonly [ReviewState, string])[] = [
  ['all', 'All'],
  ['open', 'Open'],
  ['resolved', 'Resolved'],
];
const ALL_GROUPS = '';
const QUOTE_SHOWN = 40;

const GO = 'data-comment-go';

/** A row's button's name: who began the thread and on what. */
export function goLabel(row: ReviewThreadRow): string {
  const by = row.comments[0]?.authorName || 'someone';
  const quote = row.label.length > QUOTE_SHOWN ? `${row.label.slice(0, QUOTE_SHOWN)}…` : row.label;
  return quote ? `Go to comment by ${by} on “${quote}”` : `Go to comment by ${by}`;
}

export function OfficeCommentsPanel({
  rows,
  groups,
  selfKey,
  canComment,
  filters,
  onFilters,
  onGo,
  onReopen,
  addHint,
  noteOf,
}: {
  rows: readonly ReviewThreadRow[];
  /** The kind's own filter's choices (document tabs); its list shows only with more than one. */
  groups: readonly { id: string; label: string }[];
  /** The session's author key ('' without one): For you reads it. */
  selfKey: string;
  /** The session may comment: Reopen and the empty state's hint. */
  canComment: boolean;
  filters: ReviewFilters;
  onFilters: (filters: ReviewFilters) => void;
  onGo: (id: string) => void;
  onReopen: (id: string) => void;
  /** How to add one, said when there are none. */
  addHint: string;
  /** A line under a comment's author ("From the file"). */
  noteOf?: (comment: Comment) => string | null;
}) {
  // A filter naming a group that went reads as every group.
  const group = groups.some((g) => g.id === filters.group) ? filters.group : null;
  const shown = filterRows(rows, { ...filters, group }, selfKey);
  const change = (next: ReviewFilters) => {
    debugLog('[office] comments filter', { ...next });
    onFilters(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(`[${GO}]`)];
    const at = buttons.indexOf(event.target as HTMLButtonElement);
    if (at < 0) return;
    const to =
      event.key === 'ArrowDown'
        ? Math.min(at + 1, buttons.length - 1)
        : event.key === 'ArrowUp'
          ? Math.max(at - 1, 0)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : null;
    if (to === null) return;
    event.preventDefault();
    buttons[to]!.focus();
  };

  return (
    <div className="flex flex-col gap-2 pt-1">
      <div className="flex gap-2 px-2">
        <select
          aria-label="Whose comments"
          value={filters.who}
          onChange={(e) => change({ ...filters, who: e.target.value as ReviewWho })}
          className={OFFICE_PANEL_SELECT}
        >
          {WHO.map(([value, words]) => (
            <option key={value} value={value}>
              {words}
            </option>
          ))}
        </select>
        <select
          aria-label="Which comments"
          value={filters.state}
          onChange={(e) => change({ ...filters, state: e.target.value as ReviewState })}
          className={OFFICE_PANEL_SELECT}
        >
          {STATE.map(([value, words]) => (
            <option key={value} value={value}>
              {words}
            </option>
          ))}
        </select>
      </div>
      {groups.length > 1 ? (
        <div className="px-2">
          <select
            aria-label="Which tab"
            value={group ?? ALL_GROUPS}
            onChange={(e) =>
              change({ ...filters, group: e.target.value === ALL_GROUPS ? null : e.target.value })
            }
            className={OFFICE_PANEL_SELECT}
          >
            <option value={ALL_GROUPS}>All tabs</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <p role="status" className="sr-only">
        {countLabel(shown.length)}
      </p>
      {shown.length === 0 ? (
        <div className="px-3 py-6 text-center text-body text-slate-600 dark:text-slate-300">
          <p>{rows.length === 0 ? 'No comments yet' : 'No comments match'}</p>
          {rows.length === 0 && canComment ? (
            <p className="mt-1 text-supporting text-slate-500 dark:text-slate-400">{addHint}</p>
          ) : null}
        </div>
      ) : (
        <ul aria-label="Threads" onKeyDown={onKeyDown}>
          {shown.map((row) => (
            <CommentsPanelRow
              key={row.id}
              row={row}
              canComment={canComment}
              onGo={() => onGo(row.id)}
              onReopen={() => onReopen(row.id)}
              noteOf={noteOf}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentsPanelRow({
  row,
  canComment,
  onGo,
  onReopen,
  noteOf,
}: {
  row: ReviewThreadRow;
  canComment: boolean;
  onGo: () => void;
  onReopen: () => void;
  noteOf?: (comment: Comment) => string | null;
}) {
  const first = row.comments[0];
  const replies = repliesLabel(row.comments.length - 1);
  return (
    // One button covers the row and names it; Reopen stands above it.
    <li className="relative border-b border-(--office-line) px-3 py-2 last:border-b-0 hover:bg-(--office-hover)">
      <button
        type="button"
        {...{ [GO]: '' }}
        aria-label={goLabel(row)}
        onClick={onGo}
        className="absolute inset-0 cursor-pointer rounded-control outline-none focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:ring-inset"
      />
      {row.deleted ? (
        <p className="text-supporting text-slate-500 dark:text-slate-400">
          Original content deleted
        </p>
      ) : null}
      {row.label ? (
        <p className="mb-1 truncate text-supporting text-slate-500 italic dark:text-slate-400">
          {row.label}
        </p>
      ) : null}
      {first ? (
        <CommentSummary comment={first} note={noteOf?.(first) ?? null}>
          {replies ? (
            <p className="mt-1 text-supporting text-slate-500 dark:text-slate-400">{replies}</p>
          ) : null}
          {row.resolved ? (
            <div className="mt-1 flex items-center gap-2 text-supporting text-slate-600 dark:text-slate-300">
              <CheckIcon size={12} aria-hidden />
              <span>Resolved</span>
              {canComment ? (
                <button
                  type="button"
                  aria-label={`Reopen comment by ${first.authorName || 'someone'}`}
                  onClick={onReopen}
                  className="relative z-10 touch-target rounded-control px-1 text-(--office-primary) outline-none hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus)"
                >
                  Reopen
                </button>
              ) : null}
            </div>
          ) : null}
        </CommentSummary>
      ) : null}
    </li>
  );
}
