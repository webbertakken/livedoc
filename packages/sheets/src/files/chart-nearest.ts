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
export type HeldChartType = Exclude<SheetChartType, 'stepped-area'>;
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
  combo: 'combo',
};
const NEAREST_SERIES_TYPE: Readonly<Record<SheetComboSeriesType, HeldSeriesType>> = {
  column: 'column',
  line: 'line',
  area: 'area',
  'stepped-area': 'area',
};

/** A record's text past this is never read: thirteen series types and a sum fit many times over. */
export const CHART_ORIGINAL_TEXT_MAX = 2_000;

/** The chart a file holds for `chart`, and the original it keeps for LiveDoc when the two differ (else null). */
export function nearestFileChart(chart: FileChart): {
  chart: HeldFileChart;
  original: ChartOriginal | null;
} {
  const held: HeldFileChart = {
    ...chart,
    // A Bubble chart with no sizes is no format's bubble: a scatter (D321).
    type: chart.type === 'bubble' && !chart.sizes ? 'scatter' : NEAREST_TYPE[chart.type],
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
export function chartRestored(read: FileChart, text: string | undefined): FileChart {
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
  const back = nearestFileChart(restored);
  return back.original && fileChartSum(back.chart) === record.sum ? restored : read;
}
