// Charts written as the nearest type (docs/specs/029-sheets/standard-mapping.md "Charts in the file", "Written as the
// nearest type", D290): a chart no format holds is written as the nearest one that does, which every suite draws, and
// its original travels with it for LiveDoc as a record in the chart's own document: what the nearest type lost, and
// the sum of the chart as written. Reading restores the original only while the chart still sums so, so a chart
// changed in another suite reads as what it now is.
import {
  SHEET_CHART_TYPES,
  SHEET_COMBO_SERIES_TYPES,
  type SheetChartType,
  type SheetComboSeriesType,
} from '../objects/sheet-objects';
import { fileChartSum, type FileChart } from './file-charts';

/** A chart type a file holds: every type built but those written as their nearest. */
export type HeldChartType = Exclude<
  SheetChartType,
  'stepped-area' | 'histogram' | 'waterfall' | 'treemap' | 'gauge' | 'scorecard' | 'timeline'
>;
export type HeldSeriesType = Exclude<SheetComboSeriesType, 'stepped-area'>;
export type HeldFileChart = Omit<FileChart, 'type' | 'series'> & {
  type: HeldChartType;
  series: (Omit<FileChart['series'][number], 'type'> & { type?: HeldSeriesType })[];
};

/** What the nearest type lost: the original type, a Combo chart's series types in order, the written chart's sum. */
export type ChartOriginal = { type: SheetChartType; series?: SheetComboSeriesType[]; sum: string };

// Each type no file holds, and the nearest one that does (D290).
const NEAREST_TYPE: Readonly<Record<SheetChartType, HeldChartType>> = {
  column: 'column',
  bar: 'bar',
  line: 'line',
  area: 'area',
  'stepped-area': 'area',
  scatter: 'scatter',
  bubble: 'bubble',
  pie: 'pie',
  doughnut: 'doughnut',
  radar: 'radar',
  candlestick: 'candlestick',
  ohlc: 'ohlc',
  // Excel's own histogram is a `cx:chart` part no other suite reads; ODF has none (D325).
  histogram: 'column',
  // Excel's waterfall is a `cx:chart` part as well (D327).
  waterfall: 'column',
  // Excel's treemap is a `cx:chart` part too; a pie shows the same shares of a whole (D329).
  treemap: 'pie',
  // No format holds a gauge; a bar per dial reads each value against the others (D331).
  gauge: 'bar',
  // No format holds a scorecard; a column per series shows the key value beside its baseline (D346).
  scorecard: 'column',
  // A timeline is a line over dates; its dates are written as the line chart's labels (D348).
  timeline: 'line',
  combo: 'combo',
};
const NEAREST_SERIES_TYPE: Readonly<Record<SheetComboSeriesType, HeldSeriesType>> = {
  column: 'column',
  line: 'line',
  area: 'area',
  'stepped-area': 'area',
};

/** The file format a chart is written to: its nearest type may differ between them (D323). */
export type ChartFileForm = 'xlsx' | 'odf';

// The type a file holds for `chart`: by type (NEAREST_TYPE), but a Bubble chart with no sizes is no format's bubble, a
// scatter (D321); a stock chart holds three or four series, a Candlestick four; ODF's four-series OHLC (ticks) is drawn
// by no suite, so it is written as a Candlestick (D323).
function heldType(chart: FileChart, form: ChartFileForm): HeldChartType {
  if (chart.type === 'bubble' && !chart.sizes) return 'scatter';
  if (chart.type === 'candlestick' || chart.type === 'ohlc') {
    const n = chart.series.length;
    if (n < 3 || n > 4) return 'line';
    if (n === 3) return 'ohlc';
    if (form === 'odf') return 'candlestick';
  }
  return NEAREST_TYPE[chart.type];
}

/** A record's text past this is never read: thirteen series types and a sum fit many times over. */
export const CHART_ORIGINAL_TEXT_MAX = 2_000;

/** The chart a file holds for `chart`, and the original it keeps for LiveDoc when the two differ (else null). */
export function nearestFileChart(
  chart: FileChart,
  form: ChartFileForm,
): {
  chart: HeldFileChart;
  original: ChartOriginal | null;
} {
  const held: HeldFileChart = {
    ...chart,
    type: heldType(chart, form),
    series: chart.series.map(({ type, ...s }) =>
      type ? { ...s, type: NEAREST_SERIES_TYPE[type] } : s,
    ),
  };
  const changed =
    held.type !== chart.type || held.series.some((s, i) => s.type !== chart.series[i]!.type);
  if (!changed) return { chart: held, original: null };
  const series = chart.type === 'combo' ? chart.series.map((s) => s.type!) : null;
  return {
    chart: held,
    original: {
      type: chart.type,
      ...(series ? { series } : {}),
      sum: fileChartSum(held),
    },
  };
}

/** A record as the file keeps it: JSON. */
export const chartOriginalText = (original: ChartOriginal): string => JSON.stringify(original);

const isType = (v: unknown): v is SheetChartType =>
  (SHEET_CHART_TYPES as readonly unknown[]).includes(v);
const isSeriesType = (v: unknown): v is SheetComboSeriesType =>
  (SHEET_COMBO_SERIES_TYPES as readonly unknown[]).includes(v);

function parsed(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The chart a file's chart is read as: its original, when the record kept beside it parses, names a built type (and on
 * a Combo chart a series type for each series), and the chart still sums as it was written; else the chart as read.
 */
export function chartRestored(
  read: FileChart,
  text: string | undefined,
  form: ChartFileForm,
): FileChart {
  if (text === undefined || text.length > CHART_ORIGINAL_TEXT_MAX) return read;
  const record = parsed(text) as Partial<Record<keyof ChartOriginal, unknown>> | null;
  if (!record || typeof record !== 'object' || !isType(record.type)) return read;
  if (record.sum !== fileChartSum(read)) return read;
  const series = record.type === 'combo' ? record.series : undefined;
  if (
    series !== undefined &&
    (!Array.isArray(series) || series.length !== read.series.length || !series.every(isSeriesType))
  )
    return read;
  const restored: FileChart = {
    ...read,
    type: record.type,
    series: read.series.map((s, i) => (series ? { ...s, type: series[i] } : s)),
  };
  // The original must be one this chart is the nearest type of.
  const back = nearestFileChart(restored, form);
  return back.original && fileChartSum(back.chart) === record.sum ? restored : read;
}
