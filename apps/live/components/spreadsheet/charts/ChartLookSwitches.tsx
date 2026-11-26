'use client';

// The Chart Editor's Customise switches (docs/specs/029-sheets/charts.md "Chart Editor"): Value Axis, Data Labels, and
// Smooth on a Line or Combo chart (pie-chart.md "Smooth Line"). Each writes the chart at once, one undo step.
import { Switch } from '@livedoc/ui';
import type { SheetChart } from '@livedoc/sheets';

type Set = <K extends keyof SheetChart>(key: K, value: SheetChart[K] | undefined) => void;

function LookSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <Switch size="sm" checked={checked} label={label} onChange={onChange} />
      {label}
    </span>
  );
}

export function ChartLookSwitches({ chart, set }: { chart: SheetChart; set: Set }) {
  return (
    <div className="flex flex-wrap gap-4">
      <LookSwitch
        label="Value Axis"
        checked={chart.axis !== false}
        onChange={(on) => set('axis', on ? undefined : false)}
      />
      <LookSwitch
        label="Data Labels"
        checked={chart.values === true}
        onChange={(on) => set('values', on ? true : undefined)}
      />
      {chart.type === 'line' || chart.type === 'combo' ? (
        <LookSwitch
          label="Smooth"
          checked={chart.smooth === true}
          onChange={(on) => set('smooth', on ? true : undefined)}
        />
      ) : null}
    </div>
  );
}
