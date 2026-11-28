'use client';

// The Pivot Table Editor's entries (docs/specs/029-sheets/pivot-tables.md "Pivot Table Editor"): a row or column
// group's Order, Sort By, Show Totals and Repeat Row Labels; a value's Summarise By and Show As, a calculated field's
// Formula; a filter's Status, its Filter by Condition and its items, each a tick box. Each control hands back the entry
// set whole; what it does not show (a custom name, a grouping) stays as it is.
import { useId, useState, type ReactNode } from 'react';
import { Select, TextInput } from '@livedoc/ui';
import {
  PIVOT_BLANK_ITEM,
  PIVOT_SUMMARIES,
  pivotFilterStatus,
  type PivotShowAs,
  type PivotSummary,
  type FilterCondition,
  type SheetPivotFilter,
  type SheetPivotGroup,
  type SheetPivotValue,
} from '@livedoc/sheets';
import { FilterByCondition } from '@/components/sheets/FilterByCondition';
import { takesValue } from '@/components/sheets/filter-condition-draft';
import { draftOfPivotFilter, pivotFilterOfDraft } from '@/lib/spreadsheet/pivot-filter-draft';
import { ChartEditorField as Field } from '../charts/ChartEditorField';

/** Why a calculated field's typed formula is not written. */
export const PIVOT_FORMULA_WHY = 'A formula starts with =';
const WHY = 'text-supporting text-red-700 dark:text-red-300';

// A text field holding `shown` until it is left or Enter is pressed, then handing back what was typed.
function useCommittedText(shown: string) {
  const [text, setText] = useState(shown);
  const [before, setBefore] = useState(shown);
  if (before !== shown) {
    setBefore(shown);
    setText(shown);
  }
  return [text, setText] as const;
}

// A calculated field's Formula (D622): read when left or Enter is pressed; one not starting with = says why.
function FormulaField({
  name,
  formula,
  onCommit,
}: {
  name: string;
  formula: string;
  onCommit: (next: string) => void;
}) {
  const whyId = useId();
  const [text, setText] = useCommittedText(formula);
  const [why, setWhy] = useState(false);
  const commit = () => {
    const next = text.trim();
    if (next === formula) return;
    if (!next.startsWith('=')) {
      setWhy(true);
      return;
    }
    setWhy(false);
    onCommit(next);
  };
  return (
    <Field label="Formula">
      <TextInput
        aria-label={`${name} Formula`}
        value={text}
        spellCheck={false}
        autoComplete="off"
        className="font-mono"
        onChange={(e) => {
          setText(e.target.value);
          setWhy(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        {...(why ? { 'aria-invalid': true as const, 'aria-describedby': whyId } : {})}
      />
      {why ? (
        <p id={whyId} role="alert" className={WHY}>
          {PIVOT_FORMULA_WHY}
        </p>
      ) : null}
    </Field>
  );
}

const BOX = 'size-icon-row shrink-0 accent-(--office-primary)';
const OPTION = 'flex min-h-row items-center gap-2 text-body pointer-coarse:min-h-11';
const LINK =
  'min-h-row cursor-pointer rounded-control px-1 text-supporting font-medium text-(--office-primary) hover:underline focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none';

const SHOW_AS: readonly { value: PivotShowAs | ''; label: string }[] = [
  { value: '', label: 'Default' },
  { value: 'row', label: '% of Row' },
  { value: 'column', label: '% of Column' },
  { value: 'total', label: '% of Grand Total' },
];

// An entry's frame: its name, its Remove button and its options, a group named by its column.
function Entry({
  name,
  onRemove,
  children,
}: {
  name: string;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={name}
      className="flex flex-col gap-2 rounded-control border border-(--office-line) p-2"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">{name}</span>
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          className="flex size-chip shrink-0 cursor-pointer items-center justify-center rounded-full text-(--office-icon) hover:bg-(--office-hover) focus-visible:ring-2 focus-visible:ring-(--office-focus) focus-visible:outline-none"
        >
          <span aria-hidden>×</span>
        </button>
      </div>
      {children}
    </div>
  );
}

// One of an entry's tick boxes.
function Tick({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className={OPTION}>
      <input
        type="checkbox"
        className={BOX}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

// A group with one optional key set or dropped.
function withKey<K extends keyof SheetPivotGroup>(
  g: SheetPivotGroup,
  key: K,
  value: SheetPivotGroup[K] | undefined,
): SheetPivotGroup {
  const { [key]: _gone, ...rest } = g;
  return (value === undefined ? rest : { ...rest, [key]: value }) as SheetPivotGroup;
}

export function PivotGroupEntry({
  name,
  group,
  rows,
  valueNames,
  onChange,
  onRemove,
}: {
  name: string;
  group: SheetPivotGroup;
  // A row group: Repeat Row Labels is its.
  rows: boolean;
  // Each value's name, for Sort By.
  valueNames: readonly string[];
  onChange: (next: SheetPivotGroup) => void;
  onRemove: () => void;
}) {
  return (
    <Entry name={name} onRemove={onRemove}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Order">
          <Select
            aria-label={`${name} Order`}
            value={group.desc ? 'desc' : 'asc'}
            onChange={(e) =>
              onChange(withKey(group, 'desc', e.target.value === 'desc' || undefined))
            }
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </Select>
        </Field>
        <Field label="Sort By">
          <Select
            aria-label={`${name} Sort By`}
            value={group.sortBy ? String(group.sortBy.value) : ''}
            onChange={(e) =>
              onChange(
                withKey(
                  group,
                  'sortBy',
                  e.target.value === '' ? undefined : { value: Number(e.target.value) },
                ),
              )
            }
          >
            <option value="">{name}</option>
            {valueNames.map((v, i) => (
              <option key={i} value={String(i)}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Tick
        label="Show Totals"
        checked={group.totals !== false}
        onChange={(on) => onChange(withKey(group, 'totals', on ? undefined : false))}
      />
      {rows ? (
        <Tick
          label="Repeat Row Labels"
          checked={group.repeat === true}
          onChange={(on) => onChange(withKey(group, 'repeat', on || undefined))}
        />
      ) : null}
    </Entry>
  );
}

export function PivotValueEntry({
  name,
  value,
  onChange,
  onRemove,
}: {
  name: string;
  value: SheetPivotValue;
  onChange: (next: SheetPivotValue) => void;
  onRemove: () => void;
}) {
  const summaries: readonly string[] =
    value.formula === undefined ? PIVOT_SUMMARIES : [...PIVOT_SUMMARIES, 'CUSTOM'];
  return (
    <Entry name={name} onRemove={onRemove}>
      {value.formula !== undefined ? (
        <FormulaField
          name={name}
          formula={value.formula}
          onCommit={(formula) => onChange({ ...value, formula })}
        />
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Summarise By">
          <Select
            aria-label={`${name} Summarise By`}
            value={value.summary}
            onChange={(e) => onChange({ ...value, summary: e.target.value as PivotSummary })}
          >
            {summaries.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Show As">
          <Select
            aria-label={`${name} Show As`}
            value={value.showAs ?? ''}
            onChange={(e) => {
              const { showAs: _was, ...rest } = value;
              const next = e.target.value as PivotShowAs | '';
              onChange(next ? { ...rest, showAs: next } : rest);
            }}
          >
            {SHOW_AS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Entry>
  );
}

export function PivotFilterEntry({
  name,
  filter,
  items,
  onChange,
  onRemove,
}: {
  name: string;
  filter: SheetPivotFilter;
  // The column's items as the source shows them (pivotFilterItems).
  items: readonly string[];
  onChange: (next: SheetPivotFilter) => void;
  onRemove: () => void;
}) {
  // The condition as it is typed, written as its fields are left or Enter is pressed.
  const opened = draftOfPivotFilter(filter);
  const [draft, setDraft] = useState(opened);
  const [openedKey, setOpenedKey] = useState(JSON.stringify(opened));
  if (openedKey !== JSON.stringify(opened)) {
    setOpenedKey(JSON.stringify(opened));
    setDraft(opened);
  }
  const commit = (from = draft) => {
    const next = pivotFilterOfDraft(filter, from);
    if (next && JSON.stringify(next) !== JSON.stringify(filter)) onChange(next);
  };
  return (
    <Entry name={name} onRemove={onRemove}>
      <p className="text-supporting text-(--office-muted)">
        Status: <span className="text-(--office-ink)">{pivotFilterStatus(filter)}</span>
      </p>
      <div
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
      >
        <FilterByCondition
          draft={draft}
          problem={null}
          onChange={(next) => {
            setDraft(next);
            // A condition taking no value (None, Is empty, Is not empty) is whole as soon as it is picked.
            if (next.op !== draft.op && next.op !== 'formula' && !takesValue({ ...next, d: '' }))
              commit(next);
          }}
          periods={false}
          formulaPlaceholder="=Units>8"
        />
      </div>
      {filter.formula === undefined ? (
        <PivotFilterItems
          name={name}
          cond={filter.cond}
          items={items}
          onChange={(cond) => onChange({ col: filter.col, cond })}
        />
      ) : null}
    </Entry>
  );
}

// A filter by values' items, each a tick box, with Select All and Clear; the ticked items go beside the condition
// (D622).
function PivotFilterItems({
  name,
  cond,
  items,
  onChange,
}: {
  name: string;
  cond: FilterCondition;
  items: readonly string[];
  onChange: (next: FilterCondition) => void;
}) {
  // A blank item is kept as the empty text it shows.
  const kept = (item: string) => (item === PIVOT_BLANK_ITEM ? '' : item);
  const shown = new Set(cond.values ?? items.map(kept));
  const set = (values: string[] | null) => {
    const { values: _was, ...condition } = cond;
    onChange(values === null ? condition : { ...condition, values });
  };
  const toggle = (item: string, on: boolean) => {
    const next = items.map(kept).filter((x) => (x === kept(item) ? on : shown.has(x)));
    set(next.length === items.length ? null : next);
  };
  return (
    <>
      <div className="flex gap-2">
        <button type="button" className={LINK} onClick={() => set(null)}>
          Select All
        </button>
        <button type="button" className={LINK} onClick={() => set([])}>
          Clear
        </button>
      </div>
      <div
        className="flex max-h-48 flex-col overflow-auto"
        role="group"
        aria-label={`${name} items`}
      >
        {items.map((item) => (
          <Tick
            key={item}
            label={item}
            checked={shown.has(kept(item))}
            onChange={(on) => toggle(item, on)}
          />
        ))}
      </div>
    </>
  );
}
