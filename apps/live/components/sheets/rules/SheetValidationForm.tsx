'use client';

// The Data Validation rule form (docs/specs/029-sheets/data-validation.md "Making and changing rules"): Apply to Range,
// the Criteria (a rule kind and its fields), Advanced (Reject or Warn, Help Text), and Remove Rule, Cancel and Done.
// Done writes the rule over its range (taking the range out of every other rule), one change and one undo step. The
// Plan Sheet's popover and the spreadsheet's Data Validation Rules panel hold it.
import { useState } from 'react';
import { Button, Select, TextInput, DateInput } from '@livedoc/ui';
import {
  DROPDOWN_OPTIONS_MAX,
  DROPDOWN_OPTION_MAX,
  FORMAT_RULE_FORMULA_MAX,
  VALIDATION_HELP_MAX,
  parseRangeText,
  type ValidationKind,
  type ValidationRule,
} from '@livedoc/sheets';
import { OptionRows } from '@/components/plan/OptionRows';
import { ColourSwatchButton } from '@/components/colour/ColourSwatchButton';
import { noColour } from '@/components/colour/colour-options';
import { useSheetController } from '../sheet-controller';
import type { SheetActions } from '../useSheetActions';
import {
  KINDS,
  OPS,
  OPTION_COLOURS,
  OPTION_GROUPS,
  SHOWS,
  draftEnv,
  draftOf,
  nextKey,
  settingsOf,
  type Draft,
  type Option,
} from './validation-draft';

const label = 'block text-supporting text-slate-500 dark:text-slate-400';

export function SheetValidationForm({
  actions,
  existing,
  inPanel = false,
  onClose,
}: {
  actions: SheetActions;
  // The rule edited; none for a new one over the selection.
  existing: ValidationRule | undefined;
  // In a side panel, whose frame and title it takes; else a popover's own card and heading.
  inPanel?: boolean;
  onClose: () => void;
}) {
  const c = useSheetController();
  const palette = OPTION_COLOURS;
  const [d, setD] = useState<Draft>(() => draftOf(c, existing, palette));
  const [why, setWhy] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(!!(existing?.warn || existing?.help));
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const set = (patch: Partial<Draft>) => {
    setWhy(null);
    setD((x) => ({ ...x, ...patch }));
  };
  const setOpt = (key: number, patch: Partial<Option>) =>
    set({ opts: d.opts.map((o) => (o.key === key ? { ...o, ...patch } : o)) });
  const addOptAfter = (key?: number) => {
    if (d.opts.length >= DROPDOWN_OPTIONS_MAX) return;
    const at = key === undefined ? d.opts.length : d.opts.findIndex((o) => o.key === key) + 1;
    const next = [...d.opts];
    next.splice(at, 0, { key: nextKey(), v: '', c: palette[d.opts.length % palette.length] });
    set({ opts: next });
  };
  const done = () => {
    const g = parseRangeText(d.range);
    if (!g || g.r2 >= c.sheet.layout.rows.length || g.c2 >= c.sheet.layout.cols.length)
      return setWhy('Type a range like B2:B20');
    const made = settingsOf(
      d,
      draftEnv(c, (x) => actions.rangeIds(x)),
    );
    if (!made.ok) return setWhy(made.why);
    if (actions.setValidation(g, made.settings, existing?.id)) onClose();
  };
  const ops = d.is === 'num' || d.is === 'date' || d.is === 'text' ? OPS[d.is] : null;
  const op = ops ? (ops.find((o) => o.id === d.op) ?? ops[0]!) : null;
  const valueField = (key: 'a' | 'b', name: string) =>
    d.is === 'date' ? (
      <DateInput
        aria-label={name}
        value={d[key] || undefined}
        onCommit={(day) => set({ [key]: day ?? '' })}
      />
    ) : (
      <TextInput
        aria-label={name}
        placeholder={d.is === 'num' ? 'A number' : 'Text'}
        value={d[key]}
        onChange={(e) => set({ [key]: e.target.value })}
      />
    );
  return (
    <div
      className={
        inPanel
          ? 'flex flex-col gap-3'
          : 'flex flex-col gap-3 rounded-menu border border-slate-200 bg-white p-3 text-body text-slate-700 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
      }
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {inPanel ? null : <h2 className="text-panel-title">Data Validation</h2>}
      <label className="flex flex-col gap-1">
        <span className={label}>Apply to Range</span>
        <TextInput value={d.range} onChange={(e) => set({ range: e.target.value })} />
      </label>
      <div className="flex flex-col gap-1">
        <span className={label}>Criteria</span>
        <Select
          aria-label="Criteria"
          value={d.is}
          onChange={(e) => set({ is: e.target.value as ValidationKind, op: '', a: '', b: '' })}
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </Select>
      </div>
      {d.is === 'list' ? (
        <div className="flex flex-col gap-2" role="list" aria-label="Options">
          {d.opts.map((o, i) => (
            <div
              key={o.key}
              role="listitem"
              className="flex items-center gap-2"
              draggable={false}
              onDragOver={(e) => dragFrom !== null && e.preventDefault()}
              onDrop={() => {
                if (dragFrom === null || dragFrom === i) return;
                const next = [...d.opts];
                const [moved] = next.splice(dragFrom, 1);
                next.splice(i, 0, moved!);
                setDragFrom(null);
                set({ opts: next });
              }}
            >
              <span
                aria-hidden
                draggable
                onDragStart={() => setDragFrom(i)}
                onDragEnd={() => setDragFrom(null)}
                className="cursor-grab select-none px-0.5 text-slate-400"
              >
                ⋮⋮
              </span>
              <ColourSwatchButton
                label={`Colour for ${o.v || `Option ${i + 1}`}`}
                swatch={o.c ?? 'transparent'}
                none={!o.c}
                value={o.c ?? 'none'}
                leading={[noColour('none', 'No Colour')]}
                standard={OPTION_GROUPS}
                onPick={(id) => setOpt(o.key, { c: id === 'none' ? undefined : id.toLowerCase() })}
              />
              <TextInput
                aria-label={`Option ${i + 1}`}
                className="min-w-0 flex-1"
                maxLength={DROPDOWN_OPTION_MAX}
                value={o.v}
                placeholder={`Option ${i + 1}`}
                onChange={(e) => setOpt(o.key, { v: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addOptAfter(o.key);
                  }
                }}
              />
              <Button
                variant="ghost"
                size="xs"
                aria-label={`Remove ${o.v || `Option ${i + 1}`}`}
                onClick={() => set({ opts: d.opts.filter((x) => x.key !== o.key) })}
              >
                ✕
              </Button>
            </div>
          ))}
          <Button variant="secondary" size="xs" onClick={() => addOptAfter()}>
            Add Another Option
          </Button>
        </div>
      ) : null}
      {d.is === 'check' ? (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-current"
              checked={d.custom}
              onChange={(e) => set({ custom: e.target.checked })}
            />
            <span>Use Custom Cell Values</span>
          </label>
          {d.custom ? (
            <>
              <label className="flex flex-col gap-1">
                <span className={label}>Ticked Value</span>
                <TextInput
                  maxLength={DROPDOWN_OPTION_MAX}
                  value={d.on}
                  placeholder="Yes"
                  onChange={(e) => set({ on: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={label}>Unticked Value</span>
                <TextInput
                  maxLength={DROPDOWN_OPTION_MAX}
                  value={d.off}
                  placeholder="Optional"
                  onChange={(e) => set({ off: e.target.value })}
                />
              </label>
            </>
          ) : null}
        </div>
      ) : null}
      {d.is === 'formula' ? (
        <label className="flex flex-col gap-1">
          <span className={label}>Formula</span>
          <TextInput
            className="font-mono"
            maxLength={FORMAT_RULE_FORMULA_MAX}
            value={d.fx}
            placeholder="=B2>A2"
            onChange={(e) => set({ fx: e.target.value })}
          />
        </label>
      ) : null}
      {d.is === 'range' ? (
        <label className="flex flex-col gap-1">
          <span className={label}>Options From</span>
          <TextInput
            placeholder="A2:A20"
            value={d.src}
            onChange={(e) => set({ src: e.target.value })}
          />
        </label>
      ) : null}
      {d.is === 'list' || d.is === 'range' ? (
        <div className="flex flex-col gap-1">
          <span className={label}>Display</span>
          <OptionRows
            kind="single"
            label="Display"
            selected={d.show}
            rows={SHOWS.map((s) => ({ id: s.id, label: s.label }))}
            onPick={(id) => set({ show: id as Draft['show'] })}
          />
        </div>
      ) : null}
      {ops && op ? (
        <div className="flex flex-col gap-2">
          <Select
            aria-label="Condition"
            value={op.id}
            onChange={(e) => set({ op: e.target.value })}
          >
            {ops.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
          {op.values >= 1 ? valueField('a', op.values === 2 ? 'From' : 'Value') : null}
          {op.values === 2 ? valueField('b', 'To') : null}
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={advanced}
        className="flex h-row cursor-pointer items-center gap-1 text-left text-body text-slate-600 dark:text-slate-300"
        onClick={() => setAdvanced(!advanced)}
      >
        <span aria-hidden>{advanced ? '▾' : '▸'}</span> Advanced
      </button>
      {advanced ? (
        <div className="flex flex-col gap-2">
          <OptionRows
            kind="single"
            label="If the Value Isn't Allowed"
            selected={d.warn ? 'warn' : 'reject'}
            rows={[
              { id: 'reject', label: 'Reject the Value' },
              { id: 'warn', label: 'Show a Warning' },
            ]}
            onPick={(id) => set({ warn: id === 'warn' })}
          />
          <label className="flex flex-col gap-1">
            <span className={label}>Help Text</span>
            <TextInput
              maxLength={VALIDATION_HELP_MAX}
              value={d.help}
              placeholder="Shown when a value isn't allowed"
              onChange={(e) => set({ help: e.target.value })}
            />
          </label>
        </div>
      ) : null}
      <div className="flex items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        {existing ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              actions.removeValidationRule(existing.id);
              onClose();
            }}
          >
            Remove Rule
          </Button>
        ) : null}
        <span className="flex-1 text-supporting text-red-600 dark:text-red-400" role="alert">
          {why}
        </span>
        <Button variant="secondary" size="xs" onClick={onClose}>
          Cancel
        </Button>
        <Button size="xs" onClick={done}>
          Done
        </Button>
      </div>
    </div>
  );
}
