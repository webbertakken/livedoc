'use client';

// The Chart Editor's Stacking (docs/specs/029-sheets/charts.md "Chart Editor"; pie-chart.md "Stacking"): None,
// Standard or 100%, on a Column, Bar, Area or Stepped Area chart; another type keeps its stacking unused, so shows none here.
import { Select } from '@livedoc/ui';
import { SHEET_CHART_STACKS, type SheetChart, type SheetChartStack } from '@livedoc/sheets';
import { ChartEditorField } from './ChartEditorField';

const STACKING_LABELS: Record<SheetChartStack, string> = { stacked: 'Standard', percent: '100%' };
const STACKED_TYPES: readonly SheetChart['type'][] = ['column', 'bar', 'area', 'stepped-area'];

export function ChartStackingField({
  chart,
  onStack,
}: {
  chart: SheetChart;
  onStack: (stack: SheetChartStack | undefined) => void;
}) {
  if (!STACKED_TYPES.includes(chart.type)) return null;
  return (
    <ChartEditorField label="Stacking">
      <Select
        aria-label="Stacking"
        value={chart.stack ?? ''}
        onChange={(e) => onStack((e.target.value || undefined) as SheetChartStack | undefined)}
      >
        <option value="">None</option>
        {SHEET_CHART_STACKS.map((s) => (
          <option key={s} value={s}>
            {STACKING_LABELS[s]}
          </option>
        ))}
      </Select>
    </ChartEditorField>
  );
}
