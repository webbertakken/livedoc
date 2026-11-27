'use client';

// Create Pivot Group Rule's dialog (docs/specs/029-sheets/pivot-tables.md "Grouping in the grid", D621): Minimum Value
// and Maximum Value (either empty, an open end), Interval Size, Cancel and OK. A field OK cannot read says why under it,
// an alert tied to the field, and the dialog stays open.
import { useId, useState } from 'react';
import { TextInput } from '@livedoc/ui';
import { OfficeDialog } from '@/components/office/OfficeDialog';
import {
  readPivotGroupRule,
  type PivotGroupRuleFields,
  type PivotGroupRuleRead,
} from '@/lib/spreadsheet/pivot-grouping-menu';

const LABEL = 'text-supporting text-(--office-muted)';
const WHY = 'text-supporting text-red-700 dark:text-red-300';

const FIELDS: readonly [keyof PivotGroupRuleFields, string][] = [
  ['min', 'Minimum Value'],
  ['max', 'Maximum Value'],
  ['size', 'Interval Size'],
];

export function PivotGroupRuleDialog({
  start,
  onOk,
  onClose,
}: {
  start: PivotGroupRuleFields;
  onOk: (grouping: Extract<PivotGroupRuleRead, { ok: true }>['grouping']) => void;
  onClose: () => void;
}) {
  const ids = useId();
  const [fields, setFields] = useState(start);
  const [why, setWhy] = useState<{ field: keyof PivotGroupRuleFields; text: string } | null>(null);
  const ok = () => {
    const read = readPivotGroupRule(fields);
    if (!read.ok) {
      setWhy({ field: read.field, text: read.why });
      return;
    }
    onOk(read.grouping);
  };
  return (
    <OfficeDialog
      open
      onClose={onClose}
      title="Pivot Group Rule"
      primary={{ label: 'OK', onPress: ok }}
    >
      <div className="flex flex-col gap-3 pt-1">
        {FIELDS.map(([field, label]) => (
          <div key={field} className="flex flex-col gap-1">
            <label className="flex flex-col gap-1">
              <span className={LABEL}>{label}</span>
              <TextInput
                aria-label={label}
                inputMode="decimal"
                value={fields[field]}
                onChange={(e) => {
                  setFields({ ...fields, [field]: e.target.value });
                  setWhy(null);
                }}
                {...(why?.field === field
                  ? { 'aria-invalid': true as const, 'aria-describedby': `${ids}-${field}-why` }
                  : {})}
              />
            </label>
            {why?.field === field ? (
              <p id={`${ids}-${field}-why`} role="alert" className={WHY}>
                {why.text}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </OfficeDialog>
  );
}
