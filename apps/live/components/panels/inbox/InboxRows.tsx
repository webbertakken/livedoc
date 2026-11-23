'use client';

// The Inbox's list (docs/specs/013-workspace/inbox.md §1.2, §1.3): the filter bar, the rows under their date
// dividers, and the skeleton in the list's shape. Each row is three lines: who and when; what; why, then the
// document. The rows are a listbox's options: the list keeps focus while the choice moves.

import { memo, type ReactNode } from 'react';
import { GlyphDisc, IDENTITY_FILL, identityVars, lucideGlyph, SOLID_BRAND_DARK } from '@livedoc/ui';
import {
  lucideAtSign,
  lucideClipboardList,
  lucideClock,
  lucideFileText,
  lucideListTodo,
  lucideMessageSquare,
} from '@livedoc/icons/lucide';
import { initialsOf } from '@/lib/identity';
import { formatRelativeTimeShort, useRelativeNow } from '@/lib/relative-time';
import {
  bucketEdges,
  bucketOf,
  entryFacts,
  INBOX_BUCKET_LABEL,
  INBOX_FILTER_LABEL,
  INBOX_FILTERS,
  type InboxBucket,
  type InboxEntry,
  type InboxFacts,
  type InboxFilter,
  type InboxReason,
} from './inbox-entries';
import { InboxDocumentChip } from './inbox-states';

const REASON_GLYPH: Record<InboxReason['kind'], ReturnType<typeof lucideGlyph>> = {
  assigned: lucideGlyph(lucideListTodo, 12),
  waiting: lucideGlyph(lucideClock, 12),
  mention: lucideGlyph(lucideAtSign, 12),
  yours: lucideGlyph(lucideFileText, 12),
  commented: lucideGlyph(lucideMessageSquare, 12),
  responses: lucideGlyph(lucideClipboardList, 12),
};

export function ReasonIcon({ kind }: { kind: InboxReason['kind'] }) {
  const Glyph = REASON_GLYPH[kind];
  return <Glyph />;
}

const FormDiscGlyph = lucideGlyph(lucideClipboardList, 14);
const CardDiscGlyph = lucideGlyph(lucideListTodo, 14);

/** The row's disc: the person behind it, else the kind's glyph. */
export function PersonDisc({ facts, size = 28 }: { facts: InboxFacts; size?: number }) {
  const p = facts.person;
  if (!p) {
    return (
      <GlyphDisc
        size={size}
        className="bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"
      >
        {facts.who === 'Form Responses' ? <FormDiscGlyph /> : <CardDiscGlyph />}
      </GlyphDisc>
    );
  }
  return (
    <GlyphDisc
      size={size}
      className={`text-glyph text-white ${
        p.color ? IDENTITY_FILL : p.self ? `bg-brand-700 ${SOLID_BRAND_DARK}` : 'bg-slate-500'
      }`}
      style={p.color ? identityVars(p.color) : undefined}
    >
      {initialsOf(p.name)}
    </GlyphDisc>
  );
}

// ---------- The filter bar ------------------------------------------------------------------------------------

/** All, My Actions, Assigned by Me, Comments, Form Responses, each with its count. Stacked, a strip of chips that
 *  scrolls sideways inside itself, so the page never does. */
export function InboxFilterBar({
  filter,
  counts,
  onChange,
  stacked,
}: {
  filter: InboxFilter;
  counts: Record<InboxFilter, number>;
  onChange: (f: InboxFilter) => void;
  stacked: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Inbox filters"
      data-inbox-filters=""
      className={`flex min-w-0 shrink-0 gap-1 border-b border-slate-200 px-3 py-2 dark:border-slate-700 ${
        stacked ? 'overflow-x-auto [scrollbar-width:none]' : 'flex-wrap'
      }`}
    >
      {INBOX_FILTERS.map((f) => {
        const on = f === filter;
        return (
          <button
            key={f}
            type="button"
            aria-pressed={on}
            data-inbox-filter={f}
            onClick={() => onChange(f)}
            className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 text-body transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600 motion-reduce:transition-none ${
              stacked ? 'min-h-11' : 'min-h-row'
            } ${
              on
                ? 'bg-slate-900 font-medium text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-50'
            }`}
          >
            {INBOX_FILTER_LABEL[f]}{' '}
            <span
              className={`tabular-nums ${on ? 'opacity-80' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {counts[f]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------- The rows ------------------------------------------------------------------------------------------

/** One sentence for a screen reader: what, why, who, where. */
function rowLabel(f: InboxFacts): string {
  const where = [f.document.name, ...f.where].join(', ');
  return [f.title, f.reason?.label, f.who, `In ${where}${f.local ? ', This Browser' : ''}`]
    .filter(Boolean)
    .join('. ');
}

type RowProps = {
  entry: InboxEntry;
  id: string;
  selected: boolean;
  stacked: boolean;
  now: number;
  onPick: (key: string) => void;
};

export const InboxRow = memo(function InboxRow({
  entry,
  id,
  selected,
  stacked,
  now,
  onPick,
}: RowProps) {
  const f = entryFacts(entry);
  return (
    <li
      id={id}
      role="option"
      aria-selected={selected}
      aria-label={rowLabel(f)}
      data-inbox-row={entry.kind}
      data-inbox-key={entry.key}
      onClick={() => onPick(entry.key)}
      className={`flex cursor-pointer select-none items-start gap-3 border-l-2 px-4 py-2.5 transition-colors motion-reduce:transition-none ${
        stacked ? 'min-h-11' : ''
      } ${
        selected
          ? 'border-brand-600 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/15'
          : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50'
      }`}
    >
      <span aria-hidden className="mt-0.5 shrink-0">
        <PersonDisc facts={f} />
      </span>
      <span aria-hidden className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            data-inbox-who=""
            className={`min-w-0 flex-1 truncate text-body ${
              f.needsYou
                ? 'font-medium text-slate-900 dark:text-slate-50'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            {f.who}
          </span>
          <span className="shrink-0 text-supporting tabular-nums text-slate-500 dark:text-slate-400">
            {formatRelativeTimeShort(now - entry.at)}
          </span>
        </span>
        <span className="block truncate text-body text-slate-900 dark:text-slate-100">
          {f.title}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-supporting text-slate-500 dark:text-slate-400">
          {f.reason ? (
            <span
              data-inbox-reason={f.reason.kind}
              className="inline-flex shrink-0 items-center gap-1 font-medium text-slate-600 dark:text-slate-300"
            >
              <ReasonIcon kind={f.reason.kind} />
              {f.reason.label}
            </span>
          ) : null}
          <InboxDocumentChip document={f.document} local={f.local} />
        </span>
      </span>
    </li>
  );
});

/** The list's rows under their date dividers. */
export function InboxRowList({
  visible,
  selectedKey,
  rowId,
  stacked,
  onPick,
}: {
  visible: readonly InboxEntry[];
  selectedKey: string | null;
  rowId: (i: number) => string;
  stacked: boolean;
  onPick: (key: string) => void;
}) {
  const now = useRelativeNow();
  const edges = bucketEdges(now);
  const out: ReactNode[] = [];
  let last: InboxBucket | null = null;
  visible.forEach((e, i) => {
    const b = bucketOf(e.at, edges);
    if (b !== last) {
      last = b;
      out.push(
        <li
          key={`h:${b}`}
          role="presentation"
          data-inbox-bucket={b}
          className="px-4 pb-1 pt-3 text-supporting text-slate-500 dark:text-slate-400"
        >
          {INBOX_BUCKET_LABEL[b]}
        </li>,
      );
    }
    out.push(
      <InboxRow
        key={e.key}
        entry={e}
        id={rowId(i)}
        selected={e.key === selectedKey}
        stacked={stacked}
        now={now}
        onPick={onPick}
      />,
    );
  });
  return <>{out}</>;
}

/** Loading: rows in the list's shape, so nothing jumps when the read lands. */
export function InboxSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-hidden
      data-inbox-skeleton=""
      className="divide-y divide-slate-100 dark:divide-slate-700/60"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-2.5">
          <span className="size-row shrink-0 animate-pulse rounded-full bg-slate-200 motion-reduce:animate-none dark:bg-slate-700" />
          <span className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
            <span className="h-2.5 w-1/3 animate-pulse rounded-full bg-slate-200 motion-reduce:animate-none dark:bg-slate-700" />
            <span className="h-2.5 w-2/3 animate-pulse rounded-full bg-slate-200 motion-reduce:animate-none dark:bg-slate-700" />
            <span className="h-2.5 w-1/2 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none dark:bg-slate-700/60" />
          </span>
        </div>
      ))}
    </div>
  );
}
