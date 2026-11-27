'use client';

// A filter column's Filter by Condition (docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers"):
// Google's list of conditions; for a date, a period from today or an exact date; a second value for Is between and Is
// not between; and Custom formula is, typed for the first row under the header, with why it cannot be read.
import { useId } from 'react';
import type { DatePeriod } from '@livedoc/sheets';
import { useSheetController } from './sheet-controller';
import {
  CONDITION_CHOICES,
  CONDITION_LABELS,
  PERIOD_CHOICES,
  PERIOD_LABELS,
  isDateOp,
  takesTwo,
  takesValue,
  type ConditionDraft,
} from './filter-condition-draft';

const FIELD = 'h-field w-full rounded-control border bg-transparent px-2 text-body outline-none';

export function FilterByCondition({
  draft,
  problem,
  onChange,
  periods = true,
  formulaPlaceholder = '=A2>5',
}: {
  draft: ConditionDraft;
  // Why the typed formula cannot be read, after OK.
  problem: string | null;
  onChange: (next: ConditionDraft) => void;
  // Whether a date condition offers periods from today (a pivot table's filter takes an exact date alone).
  periods?: boolean;
  formulaPlaceholder?: string;
}) {
  const c = useSheetController();
  const problemId = useId();
  const border = { borderColor: c.palette.border };
  const set = (patch: Partial<ConditionDraft>) => onChange({ ...draft, ...patch });
  const value = takesValue(draft);
  return (
    <>
      <div className="mb-1 mt-2 text-supporting text-slate-500 dark:text-slate-400">
        Filter by Condition
      </div>
      <select
        aria-label="Condition"
        className={FIELD}
        style={border}
        value={draft.op}
        onChange={(e) => set({ op: e.target.value as ConditionDraft['op'] })}
      >
        <option value="">None</option>
        {CONDITION_CHOICES.map((o) => (
          <option key={o} value={o}>
            {CONDITION_LABELS[o]}
          </option>
        ))}
      </select>
      {periods && isDateOp(draft.op) ? (
        <select
          aria-label="Date"
          className={`${FIELD} mt-1`}
          style={border}
          value={draft.d}
          onChange={(e) => set({ d: e.target.value as DatePeriod | '' })}
        >
          {PERIOD_CHOICES.map((d) => (
            <option key={d} value={d}>
              {PERIOD_LABELS[d]}
            </option>
          ))}
          <option value="">Exact date</option>
        </select>
      ) : null}
      {value ? (
        <input
          aria-label="Value"
          placeholder={isDateOp(draft.op) ? 'Date' : 'Value'}
          className={`${FIELD} mt-1`}
          style={border}
          value={draft.a}
          onChange={(e) => set({ a: e.target.value })}
        />
      ) : null}
      {value && takesTwo(draft.op) ? (
        <input
          aria-label="And"
          placeholder="And"
          className={`${FIELD} mt-1`}
          style={border}
          value={draft.b}
          onChange={(e) => set({ b: e.target.value })}
        />
      ) : null}
      {draft.op === 'formula' ? (
        <>
          <input
            aria-label="Formula"
            placeholder={formulaPlaceholder}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={problem !== null}
            aria-describedby={problemId}
            className={`${FIELD} mt-1 font-mono`}
            style={border}
            value={draft.fx}
            onChange={(e) => set({ fx: e.target.value })}
          />
          <p
            id={problemId}
            role="status"
            className="mt-1 text-supporting text-red-600 dark:text-red-400"
          >
            {problem ?? ''}
          </p>
        </>
      ) : null}
    </>
  );
}
