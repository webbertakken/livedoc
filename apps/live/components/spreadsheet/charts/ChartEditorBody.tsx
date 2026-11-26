'use client';

// The Chart Editor side panel's body (docs/specs/029-sheets/charts.md "Chart Editor"): Setup (the chart type, the data
// range, the series, a scatter's series drawn as lines) and Customise (titles, legend, values, the value axis, the
// palette, each series' colour, alt text) for the chart being edited. Each control writes at once, one undo step; a
// text writes when it is left or Enter is pressed.
import { useId, useState, type ReactNode } from 'react';
import { Button, Select, Switch, TextInput } from '@livedoc/ui';
import { CHART_PALETTES, CHART_TYPE_LABELS, lineFieldsFromTable } from '@livedoc/document';
import {
  AGENT_LOCALE,
  formatRange,
  idRangeOf,
  parseRangeText,
  posRangeOf,
  SHEET_CHART_ALT_MAX,
  SHEET_CHART_LEGENDS,
  SHEET_CHART_TEXT_MAX,
  SHEET_CHART_TYPES,
  sheetChartTable,
  type SheetChart,
  type SheetChartLegend,
  type SheetChartSeriesLook,
  type SheetChartType,
} from '@livedoc/sheets';
import { ColourSwatchButton } from '@/components/colour/ColourSwatchButton';
import { OFFICE_COLOUR_ROWS } from '@/components/office/OfficeColourControl';
import { useDocumentColours } from '@/hooks/ui/useDocumentColours';
import { useSheetController } from '@/components/sheets/sheet-controller';

export const CHART_GONE = 'This chart is no longer on the sheet.';
export const CHART_RANGE = 'Type a range like A1:D20';

const NO_THEME: readonly never[] = [];
const LEGEND_LABELS: Record<SheetChartLegend, string> = {
  top: 'Top',
  right: 'Right',
  bottom: 'Bottom',
  left: 'Left',
  none: 'None',
};

type Tab = 'setup' | 'customise';

// A text that writes when it is left or Enter is pressed, and goes back to what is stored on Escape.
function CommitText({
  label,
  value,
  max,
  onCommit,
  area = false,
}: {
  label: string;
  value: string;
  max: number;
  onCommit: (next: string) => void;
  area?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  // A stored value that changes (another person, an undo) replaces the draft, during render.
  const [stored, setStored] = useState(value);
  if (stored !== value) {
    setStored(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onCommit(draft.slice(0, max));
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-supporting text-slate-600 dark:text-slate-300">{label}</span>
      {area ? (
        <textarea
          aria-label={label}
          maxLength={max}
          rows={3}
          className="rounded-control border border-slate-200 bg-white p-2 text-body dark:border-slate-700 dark:bg-slate-800"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
      ) : (
        <TextInput
          aria-label={label}
          maxLength={max}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setDraft(value);
          }}
        />
      )}
    </label>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-supporting text-slate-600 dark:text-slate-300">{label}</span>
      {children}
    </label>
  );
}

// A chart with one optional key set or dropped (undefined drops it).
function withKey<K extends keyof SheetChart>(
  chart: SheetChart,
  key: K,
  value: SheetChart[K] | undefined,
): SheetChart {
  const { [key]: _gone, ...rest } = chart;
  return (value === undefined ? rest : { ...rest, [key]: value }) as SheetChart;
}

export function ChartEditorBody({
  chartId,
  onChange,
  onClose,
}: {
  chartId: string | null;
  onChange: (next: SheetChart) => void;
  onClose: () => void;
}) {
  const c = useSheetController();
  const yours = useDocumentColours();
  const [tab, setTab] = useState<Tab>('setup');
  const ids = useId();
  const chart = (c.sheet.layout.objects ?? []).find(
    (x): x is SheetChart => x.kind === 'chart' && x.id === chartId,
  );
  const layout = c.sheet.layout;
  const p = chart?.range ? posRangeOf(layout, chart.range) : null;
  const shown = p ? formatRange(p) : '';
  const [range, setRange] = useState(shown);
  const [why, setWhy] = useState<string | null>(null);
  const [shownBefore, setShownBefore] = useState(shown);
  if (shownBefore !== shown) {
    setShownBefore(shown);
    setRange(shown);
    setWhy(null);
  }

  if (!chart)
    return <p className="text-supporting text-slate-500 dark:text-slate-400">{CHART_GONE}</p>;

  const set = <K extends keyof SheetChart>(key: K, value: SheetChart[K] | undefined) =>
    onChange(withKey(chart, key, value));
  const commitRange = () => {
    if (range.trim() === shown) return;
    const g = parseRangeText(range);
    const picked =
      g && g.r2 < layout.rows.length && g.c2 < layout.cols.length
        ? idRangeOf(layout, g.r1, g.c1, g.r2, g.c2)
        : null;
    if (!g || !picked) return setWhy(CHART_RANGE);
    setWhy(null);
    // A new range reads every one of its columns; the looks of columns it keeps stay.
    const { cols: _cols, ...rest } = chart;
    onChange({ ...rest, range: picked });
  };
  const table = chart.range
    ? sheetChartTable(
        c.workbook,
        { sheetId: c.sheet.id, range: chart.range, ...(chart.cols ? { cols: chart.cols } : {}) },
        AGENT_LOCALE,
      )
    : null;
  // The series drawn, as the chart code reads them: a scatter's first column of numbers is its x, no series.
  const drawn = table
    ? lineFieldsFromTable({ shape: 'line-chart', chartVariant: 'scatter' }, table).lineSeries.length
    : 0;
  const series =
    chart.type === 'scatter' && table
      ? table.series.slice(table.series.length - drawn)
      : (table?.series ?? []);
  const look = (col: string): SheetChartSeriesLook => chart.series?.[col] ?? {};
  const setLook = (col: string, next: SheetChartSeriesLook) => {
    const all = { ...chart.series };
    if (Object.keys(next).length) all[col] = next;
    else delete all[col];
    set('series', Object.keys(all).length ? all : undefined);
  };
  const tabButton = (id: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`${ids}-${id}`}
      aria-selected={tab === id}
      aria-controls={`${ids}-${id}-panel`}
      tabIndex={tab === id ? 0 : -1}
      className="flex-1 cursor-pointer border-b-2 border-transparent px-2 py-1 text-body aria-selected:border-brand-500 aria-selected:font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      onClick={() => setTab(id)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
          setTab(tab === 'setup' ? 'customise' : 'setup');
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Chart Editor" className="flex">
        {tabButton('setup', 'Setup')}
        {tabButton('customise', 'Customise')}
      </div>
      {tab === 'setup' ? (
        <div
          role="tabpanel"
          id={`${ids}-setup-panel`}
          aria-labelledby={`${ids}-setup`}
          className="flex flex-col gap-3"
        >
          <Field label="Chart Type">
            <Select
              aria-label="Chart Type"
              value={chart.type}
              onChange={(e) => set('type', e.target.value as SheetChartType)}
            >
              {SHEET_CHART_TYPES.map((t) => (
                <option key={t} value={t}>
                  {`${CHART_TYPE_LABELS[t]} Chart`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data Range">
            <TextInput
              aria-label="Data Range"
              aria-invalid={why ? true : undefined}
              aria-describedby={why ? `${ids}-why` : undefined}
              value={range}
              placeholder="A1:D20"
              onChange={(e) => setRange(e.target.value)}
              onBlur={commitRange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRange();
              }}
            />
          </Field>
          {why ? (
            <p
              id={`${ids}-why`}
              role="alert"
              className="text-supporting text-red-700 dark:text-red-300"
            >
              {why}
            </p>
          ) : null}
          {series.length ? (
            <div role="group" aria-label="Series" className="flex flex-col gap-2">
              <span className="text-supporting text-slate-600 dark:text-slate-300">Series</span>
              {series.map((s) => (
                <div key={s.col} className="flex items-center justify-between gap-2">
                  <span className="truncate">{s.name}</span>
                  {chart.type === 'scatter' ? (
                    <span className="flex items-center gap-2 text-supporting">
                      <Switch
                        size="sm"
                        checked={look(s.col).line === true}
                        label={`Draw ${s.name} as a Line`}
                        onChange={(on) => {
                          const { line: _line, ...rest } = look(s.col);
                          setLook(s.col, on ? { ...rest, line: true } : rest);
                        }}
                      />
                      Line
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-supporting text-slate-500 dark:text-slate-400">No data</p>
          )}
        </div>
      ) : (
        <div
          role="tabpanel"
          id={`${ids}-customise-panel`}
          aria-labelledby={`${ids}-customise`}
          className="flex flex-col gap-3"
        >
          <CommitText
            label="Chart Title"
            value={chart.title ?? ''}
            max={SHEET_CHART_TEXT_MAX}
            onCommit={(v) => set('title', v.trim() || undefined)}
          />
          <CommitText
            label="Horizontal Axis Title"
            value={chart.xTitle ?? ''}
            max={SHEET_CHART_TEXT_MAX}
            onCommit={(v) => set('xTitle', v.trim() || undefined)}
          />
          <CommitText
            label="Vertical Axis Title"
            value={chart.yTitle ?? ''}
            max={SHEET_CHART_TEXT_MAX}
            onCommit={(v) => set('yTitle', v.trim() || undefined)}
          />
          <Field label="Legend">
            <Select
              aria-label="Legend"
              value={chart.legend ?? 'bottom'}
              onChange={(e) => {
                const v = e.target.value as SheetChartLegend;
                set('legend', v === 'bottom' ? undefined : v);
              }}
            >
              {SHEET_CHART_LEGENDS.map((l) => (
                <option key={l} value={l}>
                  {LEGEND_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Palette">
            <Select
              aria-label="Palette"
              value={chart.palette ?? ''}
              onChange={(e) => set('palette', e.target.value || undefined)}
            >
              <option value="">Theme</option>
              {CHART_PALETTES.map((pal) => (
                <option key={pal.id} value={pal.id}>
                  {pal.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-wrap gap-4">
            <span className="flex items-center gap-2">
              <Switch
                size="sm"
                checked={chart.axis !== false}
                label="Value Axis"
                onChange={(on) => set('axis', on ? undefined : false)}
              />
              Value Axis
            </span>
            <span className="flex items-center gap-2">
              <Switch
                size="sm"
                checked={chart.values === true}
                label="Data Labels"
                onChange={(on) => set('values', on ? true : undefined)}
              />
              Data Labels
            </span>
          </div>
          {series.length ? (
            <div role="group" aria-label="Series Colours" className="flex flex-wrap gap-3">
              {series.map((s, i) => {
                const colour = look(s.col).color;
                const fallback =
                  CHART_PALETTES.find((x) => x.id === chart.palette)?.colors ??
                  CHART_PALETTES[0]!.colors;
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
                        if (/^#[0-9a-f]{6}$/.test(hex))
                          setLook(s.col, { ...look(s.col), color: hex });
                      }}
                    />
                    <span className="max-w-20 truncate">{s.name}</span>
                  </span>
                );
              })}
            </div>
          ) : null}
          <CommitText
            label="Alt Text"
            area
            value={chart.alt ?? ''}
            max={SHEET_CHART_ALT_MAX}
            onCommit={(v) => set('alt', v.trim() || undefined)}
          />
        </div>
      )}
      <div className="flex justify-end">
        <Button size="xs" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}
