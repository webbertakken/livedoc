// A sheet's objects (docs/specs/029-sheets/charts.md "The model", sheet-store.md "Objects"): what floats over its
// cells, kept in its layout in paint order, each set whole or removed by its id with a layout write. Charts are the
// first kind built, then pivot tables (sheet-pivot.ts); images, drawings, slicers and timelines join the union as they are built.
import { isAxisId } from '../ids';
import type { IdRange } from '../sheet';
import { inRange, isIdRange, isRecord, onlyKeys, textUpTo } from './object-checks';
import { isSheetPivot, type SheetPivot } from './sheet-pivot';

// The chart types a spreadsheet's chart draws as (charts.md "Chart types", those built), named as
// @livedoc/document CHART_TYPES names them; restated, as this package never imports that one (a test keeps them equal).
export const SHEET_CHART_TYPES = [
  'column',
  'bar',
  'line',
  'area',
  'stepped-area',
  'scatter',
  'bubble',
  'pie',
  'doughnut',
  'radar',
  'candlestick',
  'ohlc',
  'histogram',
  'waterfall',
  'treemap',
  'gauge',
  'scorecard',
  'timeline',
  'table',
  'combo',
] as const;
export type SheetChartType = (typeof SHEET_CHART_TYPES)[number];

// Stacking (charts.md "The model"): Standard or 100%, as @livedoc/document CHART_STACKS names them (a test keeps
// them equal); a Column, Bar, Area or Stepped Area chart draws it, another type keeps it unused.
export const SHEET_CHART_STACKS = ['stacked', 'percent'] as const;
export type SheetChartStack = (typeof SHEET_CHART_STACKS)[number];

export const SHEET_CHART_LEGENDS = ['top', 'right', 'bottom', 'left', 'none'] as const;
export type SheetChartLegend = (typeof SHEET_CHART_LEGENDS)[number];

// Where an object sits: the cell its top-left corner is in, by row and column ids, and the px into that cell (at 100%).
export type CellAnchor = { r: string; c: string; dx: number; dy: number };

// A Combo chart's series types (charts.md "The model"), as @livedoc/document COMBO_SERIES_TYPES names them (a test
// keeps them equal).
export const SHEET_COMBO_SERIES_TYPES = ['column', 'line', 'area', 'stepped-area'] as const;
export type SheetComboSeriesType = (typeof SHEET_COMBO_SERIES_TYPES)[number];

// A series' own look, by its column's id: its colour, a scatter series drawn as a line, the right-hand axis, and its
// type on a Combo chart.
/**
 * Each series' type on a Combo chart, from its columns' looks in series order: its own, else the default (pie-chart.md
 * "Combo", D286), the first half, rounded up, columns and the rest lines. As @livedoc/document comboSeriesTypes (a test
 * keeps them equal).
 */
export function sheetComboSeriesTypes(
  looks: readonly (SheetChartSeriesLook | undefined)[],
): SheetComboSeriesType[] {
  const columns = Math.ceil(looks.length / 2);
  return looks.map((look, i) => look?.type ?? (i < columns ? 'column' : 'line'));
}

export type SheetChartSeriesLook = {
  color?: string;
  line?: true;
  right?: true;
  type?: SheetComboSeriesType;
};

export type SheetChart = {
  id: string;
  kind: 'chart';
  at: CellAnchor;
  width: number;
  height: number;
  type: SheetChartType;
  // The data, by ids; absent when every cell of it was deleted ("No data").
  range?: IdRange;
  // Only these of the range's columns, by id.
  cols?: string[];
  palette?: string;
  legend?: SheetChartLegend;
  values?: true;
  // The value axis: shown unless false (Google shows it).
  axis?: false;
  stack?: SheetChartStack;
  // A line chart's Smooth Line (charts.md "The model"); another type keeps it unused.
  smooth?: true;
  title?: string;
  xTitle?: string;
  yTitle?: string;
  alt?: string;
  series?: Record<string, SheetChartSeriesLook>;
  // Read from a file: its file XML, a kept part by name, and the sum of what it was read as; written in its place while
  // the chart sums the same (standard-mapping.md "Charts in the file", D276).
  kept?: SheetChartKept;
};

/** A read chart's kept file XML: the kept part's name and the sum of the chart it was read as. */
export type SheetChartKept = { part: string; sum: string };

export type SheetObject = SheetChart | SheetPivot;

export const SHEET_OBJECTS_MAX = 100;
export const SHEET_CHART_SIZE_MIN = { width: 160, height: 120 } as const;
export const SHEET_CHART_SIZE_MAX = 2000;
// The farthest an anchor's offset reaches into its cell: a column or a row is never wider than this.
export const OBJECT_OFFSET_MAX = 2000;
export const SHEET_CHART_TEXT_MAX = 200;
export const SHEET_CHART_ALT_MAX = 1000;
// The series cap and a label column (chart-data CHART_SERIES_MAX + 1).
export const SHEET_CHART_COLS_MAX = 13;
const PALETTE_ID_MAX = 40;

const HEX = /^#[0-9a-f]{6}$/;
const KEPT_SUM = /^[0-9a-f]{8}$/;
export const SHEET_CHART_KEPT_PART_MAX = 200;

const CHART_KEYS = [
  'id',
  'kind',
  'at',
  'width',
  'height',
  'type',
  'range',
  'cols',
  'palette',
  'legend',
  'values',
  'axis',
  'stack',
  'smooth',
  'title',
  'xTitle',
  'yTitle',
  'alt',
  'series',
  'kept',
] as const;

function isAnchor(x: unknown): x is CellAnchor {
  return (
    isRecord(x) &&
    onlyKeys(x, ['r', 'c', 'dx', 'dy']) &&
    isAxisId(x.r) &&
    isAxisId(x.c) &&
    inRange(x.dx, 0, OBJECT_OFFSET_MAX) &&
    inRange(x.dy, 0, OBJECT_OFFSET_MAX)
  );
}

function isSeriesLook(x: unknown): x is SheetChartSeriesLook {
  return (
    isRecord(x) &&
    onlyKeys(x, ['color', 'line', 'right', 'type']) &&
    (x.color === undefined || (typeof x.color === 'string' && HEX.test(x.color))) &&
    (x.line === undefined || x.line === true) &&
    (x.right === undefined || x.right === true) &&
    (x.type === undefined || (SHEET_COMBO_SERIES_TYPES as readonly unknown[]).includes(x.type))
  );
}

function isKept(x: unknown): x is SheetChartKept {
  return (
    isRecord(x) &&
    onlyKeys(x, ['part', 'sum']) &&
    typeof x.part === 'string' &&
    x.part.length > 0 &&
    x.part.length <= SHEET_CHART_KEPT_PART_MAX &&
    typeof x.sum === 'string' &&
    KEPT_SUM.test(x.sum)
  );
}

// Whether a value is a chart of this id, whole and within its bounds (charts.md "The model").
function isSheetChart(x: Record<string, unknown>): boolean {
  const { cols, series } = x;
  return (
    onlyKeys(x, CHART_KEYS) &&
    isAnchor(x.at) &&
    inRange(x.width, SHEET_CHART_SIZE_MIN.width, SHEET_CHART_SIZE_MAX) &&
    inRange(x.height, SHEET_CHART_SIZE_MIN.height, SHEET_CHART_SIZE_MAX) &&
    (SHEET_CHART_TYPES as readonly unknown[]).includes(x.type) &&
    (x.range === undefined || isIdRange(x.range)) &&
    (cols === undefined ||
      (Array.isArray(cols) &&
        cols.length > 0 &&
        cols.length <= SHEET_CHART_COLS_MAX &&
        new Set(cols).size === cols.length &&
        cols.every(isAxisId))) &&
    textUpTo(x.palette, PALETTE_ID_MAX) &&
    (x.legend === undefined || (SHEET_CHART_LEGENDS as readonly unknown[]).includes(x.legend)) &&
    (x.values === undefined || x.values === true) &&
    (x.axis === undefined || x.axis === false) &&
    (x.stack === undefined || (SHEET_CHART_STACKS as readonly unknown[]).includes(x.stack)) &&
    (x.smooth === undefined || x.smooth === true) &&
    textUpTo(x.title, SHEET_CHART_TEXT_MAX) &&
    textUpTo(x.xTitle, SHEET_CHART_TEXT_MAX) &&
    textUpTo(x.yTitle, SHEET_CHART_TEXT_MAX) &&
    textUpTo(x.alt, SHEET_CHART_ALT_MAX) &&
    (series === undefined ||
      (isRecord(series) &&
        Object.keys(series).length <= SHEET_CHART_COLS_MAX &&
        Object.entries(series).every(([k, v]) => isAxisId(k) && isSeriesLook(v)))) &&
    (x.kept === undefined || isKept(x.kept))
  );
}

// Whether a value is an object of this id: one of the kinds built, whole and within its bounds.
export function isSheetObject(x: unknown, id: string): x is SheetObject {
  if (!isRecord(x) || x.id !== id || !isAxisId(id)) return false;
  if (x.kind === 'pivot') return isSheetPivot(x);
  return x.kind === 'chart' && isSheetChart(x);
}

// The layout's objects after one is set (in its place, else on top) or removed.
export function objectsWith(
  list: readonly SheetObject[] | undefined,
  id: string,
  object: SheetObject | null,
): SheetObject[] | undefined {
  const all = list ?? [];
  const at = all.findIndex((x) => x.id === id);
  const next =
    object === null
      ? all.filter((x) => x.id !== id)
      : at >= 0
        ? all.map((x, i) => (i === at ? object : x))
        : [...all, object];
  return next.length ? next : undefined;
}
