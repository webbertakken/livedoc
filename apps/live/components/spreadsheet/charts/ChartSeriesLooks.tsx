'use client';

// The Chart Editor's Customise › Series (docs/specs/029-sheets/charts.md "Chart Editor"): each series' colour (the one
// colour picker), and on a Combo chart each series' Type and Axis (pie-chart.md "Combo"). Each writes the chart at
// once, one undo step.
import { Select } from '@livedoc/ui';
import { CHART_PALETTES, COMBO_SERIES_TYPE_LABELS } from '@livedoc/document';
import {
  SHEET_COMBO_SERIES_TYPES,
  sheetComboSeriesTypes,
  type SheetChart,
  type SheetChartSeriesLook,
  type SheetComboSeriesType,
} from '@livedoc/sheets';
import { ColourSwatchButton } from '@/components/colour/ColourSwatchButton';
import { OFFICE_COLOUR_ROWS } from '@/components/office/OfficeColourControl';

const NO_THEME: readonly never[] = [];

type Series = { col: string; name: string };

export function ChartSeriesLooks({
  chart,
  series,
  yours,
  setLook,
}: {
  chart: SheetChart;
  series: readonly Series[];
  yours: readonly string[];
  setLook: (col: string, next: SheetChartSeriesLook) => void;
}) {
  if (!series.length) return null;
  const look = (col: string): SheetChartSeriesLook => chart.series?.[col] ?? {};
  const fallback =
    CHART_PALETTES.find((x) => x.id === chart.palette)?.colors ?? CHART_PALETTES[0]!.colors;
  // The default's type is never stored: a series typed as the default reads as one with none (D286).
  const defaults = sheetComboSeriesTypes(series.map(() => undefined));
  const types = sheetComboSeriesTypes(series.map((s) => look(s.col)));
  const setType = (s: Series, i: number, type: SheetComboSeriesType) => {
    const { type: _type, ...rest } = look(s.col);
    setLook(s.col, type === defaults[i] ? rest : { ...rest, type });
  };
  const setRight = (s: Series, right: boolean) => {
    const { right: _right, ...rest } = look(s.col);
    setLook(s.col, right ? { ...rest, right: true } : rest);
  };
  return (
    <>
      <div role="group" aria-label="Series Colours" className="flex flex-wrap gap-3">
        {series.map((s, i) => {
          const colour = look(s.col).color;
          return (
            <span key={s.col} className="flex flex-col items-center gap-1 text-supporting">
              <ColourSwatchButton
                label={`${s.name} Colour`}
                swatch={colour ?? fallback[i % fallback.length]!}
                value={colour ?? ''}
                theme={NO_THEME}
                standard={OFFICE_COLOUR_ROWS}
                yours={yours}
                onPick={(id) => {
                  // A series takes a colour as #rrggbb (charts.md "The model").
                  const hex = id.toLowerCase();
                  if (/^#[0-9a-f]{6}$/.test(hex)) setLook(s.col, { ...look(s.col), color: hex });
                }}
              />
              <span className="max-w-20 truncate">{s.name}</span>
            </span>
          );
        })}
      </div>
      {chart.type === 'combo' ? (
        <div role="group" aria-label="Series Types" className="flex flex-col gap-2">
          <span className="text-supporting text-slate-600 dark:text-slate-300">Series</span>
          {series.map((s, i) => (
            <div key={s.col} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <Select
                aria-label={`${s.name} Type`}
                value={types[i]}
                onChange={(e) => setType(s, i, e.target.value as SheetComboSeriesType)}
              >
                {SHEET_COMBO_SERIES_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {COMBO_SERIES_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
              <Select
                aria-label={`${s.name} Axis`}
                value={look(s.col).right ? 'right' : 'left'}
                onChange={(e) => setRight(s, e.target.value === 'right')}
              >
                <option value="left">Left</option>
                <option value="right">Right</option>
              </Select>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
