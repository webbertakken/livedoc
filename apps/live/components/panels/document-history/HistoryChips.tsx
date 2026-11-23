'use client';

// History's filter (docs/specs/013-workspace/timeline.md §2.10): All, then one chip per kind of
// event loaded, the feed's own categories in their fixed order. One at a time, each a toggle.

import { CATEGORY_LABELS, type HistoryChip, type TimelineCategory } from '@livedoc/ui';
import { FOCUS_RING, INSET, MUTED } from './history-styles';

export function HistoryChips({
  chips,
  total,
  active,
  onChange,
}: {
  chips: HistoryChip[];
  total: number;
  active: TimelineCategory | null;
  onChange: (category: TimelineCategory | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by kind"
      className={`flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 py-2.5 sm:flex-wrap dark:border-slate-800 ${INSET}`}
    >
      <Chip label="All" count={total} on={active === null} onClick={() => onChange(null)} />
      {chips.map((c) => (
        <Chip
          key={c.category}
          label={CATEGORY_LABELS[c.category]}
          count={c.count}
          on={active === c.category}
          onClick={() => onChange(active === c.category ? null : c.category)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  count,
  on,
  onClick,
}: {
  label: string;
  count: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-row shrink-0 items-center gap-1 rounded-full border px-3 text-body transition duration-micro ${FOCUS_RING} ${
        on
          ? 'font-medium border-brand-700 bg-brand-700 text-white dark:border-brand-600 dark:bg-brand-600'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:text-white'
      }`}
    >
      {label}
      <span className={`tabular-nums ${on ? 'text-white/80' : MUTED}`}>{count}</span>
    </button>
  );
}
