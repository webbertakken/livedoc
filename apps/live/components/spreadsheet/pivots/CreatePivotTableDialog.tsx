'use client';

// Insert › Pivot Table's Create Pivot Table dialog (docs/specs/029-sheets/pivot-tables.md "Making one"): Data Range,
// Insert To (New Sheet, or Existing Sheet with its Location), Cancel and Create. A field Create cannot read says why
// under it, an alert tied to the field, and the dialog stays open.
import { useId, useState } from 'react';
import { TextInput } from '@livedoc/ui';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import type { PivotCreatePlan, PivotInsertTo } from '@/lib/spreadsheet/pivot-create';

const BOX = 'size-icon-row shrink-0 accent-(--office-primary)';
const OPTION = 'flex min-h-row items-center gap-2 text-body pointer-coarse:min-h-11';
const LABEL = 'text-supporting text-(--office-muted)';
const WHY = 'text-supporting text-red-700 dark:text-red-300';

export function CreatePivotTableDialog({
  start,
  read,
  onCreate,
  onClose,
}: {
  // The Data Range it opens with.
  start: string;
  // What Create would do with the fields as they stand.
  read: (range: string, to: PivotInsertTo, location: string) => PivotCreatePlan;
  onCreate: (plan: Extract<PivotCreatePlan, { ok: true }>) => void;
  onClose: () => void;
}) {
  const ids = useId();
  const [range, setRange] = useState(start);
  const [to, setTo] = useState<PivotInsertTo>('new');
  const [location, setLocation] = useState('');
  const [why, setWhy] = useState<{ field: 'range' | 'location'; text: string } | null>(null);
  const create = () => {
    const plan = read(range, to, location);
    if (!plan.ok) {
      setWhy({ field: plan.field, text: plan.why });
      return;
    }
    onCreate(plan);
  };
  const whyOf = (field: 'range' | 'location') =>
    why?.field === field ? (
      <p id={`${ids}-${field}-why`} role="alert" className={WHY}>
        {why.text}
      </p>
    ) : null;
  const invalid = (field: 'range' | 'location') =>
    why?.field === field
      ? { 'aria-invalid': true as const, 'aria-describedby': `${ids}-${field}-why` }
      : {};
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Create Pivot Table"
      primary={{ label: 'Create', onPress: create }}
    >
      <div className="flex flex-col gap-3 pt-1">
        <label className="flex flex-col gap-1">
          <span className={LABEL}>Data Range</span>
          <TextInput
            aria-label="Data Range"
            value={range}
            placeholder="Sheet1!A1:F25"
            onChange={(e) => {
              setRange(e.target.value);
              setWhy(null);
            }}
            {...invalid('range')}
          />
        </label>
        {whyOf('range')}
        <fieldset className="flex flex-col gap-1">
          <legend className={LABEL}>Insert To</legend>
          {(
            [
              ['new', 'New Sheet'],
              ['existing', 'Existing Sheet'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className={OPTION}>
              <input
                type="radio"
                name={`${ids}-to`}
                className={BOX}
                checked={to === value}
                onChange={() => {
                  setTo(value);
                  setWhy(null);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
        {to === 'existing' ? (
          <label className="flex flex-col gap-1">
            <span className={LABEL}>Location</span>
            <TextInput
              aria-label="Location"
              value={location}
              placeholder="Sheet1!H1"
              onChange={(e) => {
                setLocation(e.target.value);
                setWhy(null);
              }}
              {...invalid('location')}
            />
          </label>
        ) : null}
        {whyOf('location')}
      </div>
    </OfficeDialog>
  );
}
