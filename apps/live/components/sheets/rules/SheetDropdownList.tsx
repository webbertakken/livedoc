'use client';

// A dropdown cell's option list (docs/specs/029-sheets/data-validation.md "Using a dropdown"): the shared option rows,
// each option with its colour's dot, the cell's own ticked; over DROPDOWN_SEARCH_FROM options a search field filters
// them; Clear at the foot empties the cell. Escape closes it and hands the keys back to the grid.
import { useMemo, useState } from 'react';
import { TextInput } from '@livedoc/ui';
import {
  formatA1,
  optionFor,
  rangeOptions,
  selectionParts,
  type ValidationRule,
} from '@livedoc/sheets';
import { OptionRows } from '@/components/plan/OptionRows';
import { AnchoredPopover } from '@/components/primitives/AnchoredPopover';
import type { SheetController } from '../sheet-controller';

// Over this many options, a search field (data-validation.md).
const DROPDOWN_SEARCH_FROM = 8;
const LIST_WIDTH_PX = 240;

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

function Dot({ colour }: { colour?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10 dark:border-white/20"
      style={{ backgroundColor: colour ?? 'transparent' }}
    />
  );
}

export function SheetDropdownList({
  c,
  rule,
  at,
  anchor,
  current,
  onPick,
  onToggle,
  onClose,
}: {
  c: SheetController;
  rule: ValidationRule;
  at: { r: number; c: number };
  anchor: HTMLElement;
  // What the cell shows now.
  current: string;
  onPick: (value: string | null) => void;
  // With Allow Multiple Selections: an option ticked or unticked, the list kept open.
  onToggle: (option: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const options = useMemo(
    () =>
      rule.is === 'list'
        ? (rule.opts ?? []).map((o) => ({ v: o.v, c: o.c }))
        : rangeOptions(c.workbook, c.sheet.id, rule).map((o) => ({ v: o.shown, c: undefined })),
    [rule, c.workbook, c.sheet.id],
  );
  const q = query.trim().toLowerCase();
  const shown = q ? options.filter((o) => o.v.toLowerCase().includes(q)) : options;
  const selected =
    (rule.is === 'list' ? optionFor(rule, current)?.v : undefined) ??
    options.find((o) => o.v.toLowerCase() === current.toLowerCase())?.v ??
    null;
  // A multiple-selection cell's options, each in the option's own spelling.
  const ticked = rule.multi
    ? selectionParts(current).flatMap((p) => {
        const o = options.find((x) => x.v.toLowerCase() === p.toLowerCase());
        return o ? [o.v] : [];
      })
    : [];
  const rows = shown.map((o) => ({ id: o.v, label: o.v, icon: <Dot colour={o.c} /> }));
  return (
    <AnchoredPopover
      anchor={anchor}
      name={`Options for ${formatA1(at.r, at.c)}`}
      width={LIST_WIDTH_PX}
      onClose={onClose}
    >
      <div
        className="flex max-h-80 flex-col gap-1 rounded-menu border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        onPointerDown={stop}
        onKeyDown={stop}
      >
        {options.length > DROPDOWN_SEARCH_FROM ? (
          <TextInput
            aria-label="Search options"
            placeholder="Search options"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && shown[0]) (rule.multi ? onToggle : onPick)(shown[0].v);
            }}
          />
        ) : null}
        <div className="min-h-0 overflow-y-auto">
          {shown.length ? (
            rule.multi ? (
              <OptionRows
                kind="multiple"
                label="Options"
                selected={ticked}
                rows={rows}
                onPick={(v) => onToggle(v)}
              />
            ) : (
              <OptionRows
                kind="single"
                label="Options"
                selected={selected}
                rows={rows}
                onPick={(v) => onPick(v)}
              />
            )
          ) : (
            <p className="px-2 py-1.5 text-supporting text-slate-500 dark:text-slate-400">
              {options.length ? `No options match “${query.trim()}”` : 'No options yet.'}
            </p>
          )}
        </div>
        <button
          type="button"
          className="min-h-row cursor-pointer rounded-control px-2 py-1 text-left text-body text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
          onClick={() => onPick(null)}
        >
          Clear
        </button>
      </div>
    </AnchoredPopover>
  );
}
