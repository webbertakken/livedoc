'use client';

// One flow in the Flows table (docs/specs/009-elements/sankey.md "The Flows dialog"). Inside a node's group
// the From is the group's, so a row is → To and its Amount; a loose row (no From yet) is written in full. A
// row that cannot be drawn is outlined in amber, with its reason beneath it for eyes and screen readers alike.

import type { InputHTMLAttributes, Ref } from 'react';
import { SANKEY_NAME_MAX } from '@livedoc/document';
import { lucideGlyph, Tooltip } from '@livedoc/ui';
import { lucideArrowRight, lucidePlus, lucideX } from '@livedoc/icons/lucide';

const ArrowIcon = lucideGlyph(lucideArrowRight, 15);
const PlusIcon = lucideGlyph(lucidePlus, 15);
const RemoveIcon = lucideGlyph(lucideX, 14);

export type FlowField = 'from' | 'to' | 'value';

const CELL =
  'h-field w-full min-w-0 rounded-control border bg-white px-2 text-body text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-200 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400 dark:focus:ring-brand-500/30';
const CELL_OK = 'border-slate-200 dark:border-slate-700';
const CELL_WARN = 'border-amber-300 dark:border-amber-500/60';

export function SankeyFlowRow({
  n,
  from,
  to,
  value,
  withFrom,
  reason,
  reasonId,
  listId,
  cell,
  onRemove,
  onCarryOn,
}: {
  // The flow's number in the draft (1-based), which names its cells.
  n: number;
  from: string;
  to: string;
  value: string;
  // A loose row writes its own From; a row in a node's group takes the group's.
  withFrom: boolean;
  reason?: string;
  reasonId: string;
  listId: string;
  // A cell's ref and handlers, from the table, which owns focus, Enter and paste.
  cell: (field: FlowField) => InputHTMLAttributes<HTMLInputElement> & {
    ref: Ref<HTMLInputElement>;
  };
  // Absent for the Add a Flow area's blank line: there is nothing to remove.
  onRemove?: () => void;
  // Present when the row's To sends nothing on yet: adds a flow from it.
  onCarryOn?: () => void;
}) {
  const tone = reason ? CELL_WARN : CELL_OK;
  const invalid = reason ? true : undefined;
  return (
    <li>
      <div
        className={`grid items-center gap-x-2 ${
          withFrom
            ? // A phone gives the From its own line, so From and To are never squeezed side by side.
              'grid-cols-[minmax(0,1fr)_5rem_2rem] gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_6.5rem_2rem] sm:gap-y-0'
            : 'grid-cols-[auto_minmax(0,1fr)_5rem_2rem_2rem] sm:grid-cols-[auto_minmax(0,1fr)_6.5rem_2rem_2rem]'
        }`}
      >
        {withFrom ? (
          <input
            {...cell('from')}
            className={`${CELL} ${tone} col-span-3 sm:col-span-1`}
            value={from}
            list={listId}
            maxLength={SANKEY_NAME_MAX}
            placeholder="From"
            aria-label={`Flow ${n} from`}
            aria-invalid={invalid}
          />
        ) : null}
        <span
          aria-hidden
          className={`${withFrom ? 'hidden sm:flex' : 'flex'} text-slate-400 dark:text-slate-400`}
        >
          <ArrowIcon />
        </span>
        <input
          {...cell('to')}
          className={`${CELL} ${tone}`}
          value={to}
          list={listId}
          maxLength={SANKEY_NAME_MAX}
          placeholder="To"
          aria-label={`Flow ${n} to`}
          aria-invalid={invalid}
        />
        <input
          {...cell('value')}
          className={`${CELL} ${tone} text-right tabular-nums`}
          value={value}
          inputMode="decimal"
          placeholder="Amount"
          aria-label={`Flow ${n} amount`}
          aria-invalid={invalid}
          aria-describedby={reason ? reasonId : undefined}
        />
        {withFrom ? null : onCarryOn ? (
          <Tooltip label={`Send On From ${to.trim()}`}>
            <button
              type="button"
              aria-label={`Send on from ${to.trim()}`}
              onClick={onCarryOn}
              className="touch-target relative flex size-row cursor-pointer items-center justify-center rounded-control text-brand-700 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/15"
            >
              <PlusIcon />
            </button>
          </Tooltip>
        ) : (
          <span aria-hidden />
        )}
        {onRemove ? (
          <button
            type="button"
            aria-label={`Remove flow ${n}`}
            onClick={onRemove}
            className="touch-target relative flex size-row cursor-pointer items-center justify-center rounded-control text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <RemoveIcon />
          </button>
        ) : (
          <span aria-hidden />
        )}
      </div>
      {reason ? (
        <p
          id={reasonId}
          className="mt-0.5 px-0.5 text-supporting text-amber-700 dark:text-amber-400"
        >
          {reason}
        </p>
      ) : null}
    </li>
  );
}
