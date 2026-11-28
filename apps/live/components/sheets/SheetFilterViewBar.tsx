// The view bar (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers"): above the grid while a
// filter view is open, drawn dark so a view is never mistaken for the sheet. Name and Range are an Editor's fields
// (a temporary view's its maker's), committed on Enter or on leaving them; Duplicate, Delete (an Editor's saved view)
// and Close. Escape on the bar closes the view. A group by view's Range is its table's, read-only, and its bar adds
// Collapse All and Expand All, its opener's alone (data-tools.md "Group by view").
import { useState, type KeyboardEvent } from 'react';
import { Tooltip } from '@livedoc/ui';
import { useSheetController } from './sheet-controller';
import type { FilterViewActions } from './useFilterViewActions';

const FIELD =
  'h-field min-w-0 rounded-control border border-white/40 bg-transparent px-2 text-body text-white outline-none focus:border-white';
const BUTTON =
  'h-field shrink-0 cursor-pointer rounded-control px-2 hover:bg-white/15 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent';

// A field holding its draft until committed: Enter or leaving it commits, Escape puts the value back.
function BarField({
  label,
  value,
  readOnly,
  commit,
  width,
}: {
  label: string;
  value: string;
  readOnly: boolean;
  commit: (text: string) => string | null;
  width: string;
}) {
  const [draft, setDraft] = useState<{ from: string; text: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const text = draft && draft.from === value ? draft.text : value;
  const done = () => {
    if (!draft || draft.from !== value) return;
    const why = commit(draft.text);
    setProblem(why);
    if (!why) setDraft(null);
  };
  const id = `filter-view-${label.toLowerCase()}`;
  return (
    <label className="flex min-w-0 items-center gap-1">
      <span className="shrink-0 text-supporting text-white/80">{label}</span>
      <span className="relative flex min-w-0 flex-col">
        <input
          aria-label={label}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? id : undefined}
          readOnly={readOnly}
          className={`${FIELD} ${width}`}
          value={text}
          onChange={(e) => {
            setDraft({ from: value, text: e.target.value });
            setProblem(null);
          }}
          onBlur={done}
          onKeyDown={(e) => {
            if (e.key === 'Enter') done();
            if (e.key === 'Escape' && draft) {
              e.stopPropagation();
              setDraft(null);
              setProblem(null);
            }
          }}
        />
        {problem ? (
          <span
            id={id}
            role="alert"
            className="absolute top-full z-30 mt-1 whitespace-nowrap rounded-control bg-red-700 px-2 py-0.5 text-supporting text-white"
          >
            {problem}
          </span>
        ) : null}
      </span>
    </label>
  );
}

export function SheetFilterViewBar({ actions }: { actions: FilterViewActions }) {
  const c = useSheetController();
  const { open, temporary } = c.filterViews;
  if (!open) return null;
  const mayChange = temporary || c.canShape;
  const groups = open.group ? (c.geometry.order?.groups ?? []) : [];
  const { collapsed, setCollapsed } = c.filterViews;
  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') actions.close();
  };
  return (
    <div
      role="toolbar"
      aria-label="Filter view"
      data-keeps-escape
      className="flex shrink-0 items-center gap-3 bg-slate-800 px-3 py-1 text-body text-white dark:bg-slate-950"
      onKeyDown={onKeyDown}
    >
      <BarField
        key={`name-${open.id}`}
        label="Name"
        value={open.title}
        readOnly={!mayChange}
        commit={actions.rename}
        width="w-48"
      />
      <BarField
        key={`range-${open.id}`}
        label="Range"
        value={actions.rangeText}
        readOnly={!mayChange || !!open.group}
        commit={actions.setRange}
        width="w-28"
      />
      {temporary ? (
        <span className="text-supporting text-white/80">Only you see this view</span>
      ) : null}
      <span className="flex-1" />
      {groups.length ? (
        <>
          <button
            type="button"
            className={BUTTON}
            disabled={groups.every((g) => collapsed.has(g.key))}
            onClick={() => setCollapsed(new Set(groups.map((g) => g.key)))}
          >
            Collapse All
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={!groups.some((g) => collapsed.has(g.key))}
            onClick={() => setCollapsed(new Set())}
          >
            Expand All
          </button>
        </>
      ) : null}
      <button type="button" className={BUTTON} onClick={actions.duplicate}>
        Duplicate
      </button>
      {c.canShape && !temporary ? (
        <button type="button" className={BUTTON} onClick={actions.remove}>
          Delete
        </button>
      ) : null}
      <Tooltip label="Close Filter View">
        <button
          type="button"
          aria-label="Close Filter View"
          className="size-field shrink-0 cursor-pointer rounded-control hover:bg-white/15"
          onClick={actions.close}
        >
          ✕
        </button>
      </Tooltip>
    </div>
  );
}
