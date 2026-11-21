// A SPARKLINE's chart, read from its data and options (docs/specs/029-sheets/charts.md "Sparklines", D71). Pure: the
// function hands it the arrays it read; the grid and the exports draw it with sparkline-shapes.ts.
import { SPARKLINE_POINTS_MAX } from '../limits';
import { err, isError, type Scalar, type SheetError, type Value } from '../formula/values';

export const SPARKLINE_KINDS = ['line', 'column', 'winloss', 'bar'] as const;
export type SparklineKind = (typeof SPARKLINE_KINDS)[number];

/** The options a chart reads; colours are checked CSS colours, so they never carry other text. */
export type SparklineOptions = {
  readonly color?: string;
  readonly negcolor?: string;
  readonly lowcolor?: string;
  readonly highcolor?: string;
  readonly firstcolor?: string;
  readonly lastcolor?: string;
  readonly axiscolor?: string;
  readonly color1?: string;
  readonly color2?: string;
  readonly axis?: boolean;
  readonly rtl?: boolean;
  readonly ymin?: number;
  readonly ymax?: number;
  readonly xmin?: number;
  readonly xmax?: number;
  readonly max?: number;
  readonly linewidth?: number;
};

/** A chart to draw: its values in order (skipped ones gone), and for a line of x then y data, each value's x. */
export type Sparkline = {
  readonly kind: SparklineKind;
  readonly values: readonly number[];
  readonly xs?: readonly number[];
  readonly options: SparklineOptions;
};

const COLOUR_OPTIONS = [
  'color',
  'negcolor',
  'lowcolor',
  'highcolor',
  'firstcolor',
  'lastcolor',
  'axiscolor',
  'color1',
  'color2',
] as const;
const NUMBER_OPTIONS = ['ymin', 'ymax', 'xmin', 'xmax', 'max', 'linewidth'] as const;
const BOOLEAN_OPTIONS = ['axis', 'rtl'] as const;

// A CSS colour as hex or a name: nothing else reaches an SVG attribute.
const COLOUR = /^(#[0-9a-f]{3,8}|[a-z]{3,20})$/i;

type Rows = readonly (readonly Value[])[];

const firstError = (rows: Rows): SheetError | undefined =>
  rows.flat().find((v): v is SheetError => isError(v as Scalar));

function asNumber(v: Value): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function asBoolean(v: Value): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string' && /^(true|false)$/i.test(v)) return v.toLowerCase() === 'true';
  return undefined;
}

// The options rows, each a name and its value; a row of one cell, or a name it does not know, is left alone.
type ReadOptions = { kind: SparklineKind; options: SparklineOptions; empty: string; nan: string };

function readOptions(rows: Rows): ReadOptions | SheetError {
  const named = new Map<string, Value>();
  for (const row of rows)
    if (row.length >= 2 && typeof row[0] === 'string')
      named.set(row[0].trim().toLowerCase(), row[1]!);
  const options: Record<string, string | number | boolean> = {};
  for (const name of COLOUR_OPTIONS) {
    const v = named.get(name);
    if (typeof v === 'string' && COLOUR.test(v.trim())) options[name] = v.trim();
  }
  for (const name of NUMBER_OPTIONS) {
    const v = asNumber(named.get(name) ?? null);
    if (v !== undefined) options[name] = v;
  }
  for (const name of BOOLEAN_OPTIONS) {
    const v = asBoolean(named.get(name) ?? null);
    if (v !== undefined) options[name] = v;
  }
  const type = named.get('charttype');
  const kind = type === undefined || type === null ? 'line' : String(type).trim().toLowerCase();
  if (!(SPARKLINE_KINDS as readonly string[]).includes(kind))
    return err(
      '#VALUE!',
      `"${String(type)}" is not a sparkline chart type: line, column, winloss or bar`,
    );
  const word = (name: string) =>
    String(named.get(name) ?? '')
      .trim()
      .toLowerCase();
  return { kind: kind as SparklineKind, options, empty: word('empty'), nan: word('nan') };
}

// One data value as a number, or undefined when it is skipped (empty: `empty`; anything else: `nan`).
function pointOf(v: Value, empty: string, nan: string): number | undefined {
  if (typeof v === 'number') return v;
  if (v === null) return empty === 'zero' ? 0 : undefined;
  return nan === 'convert' ? 0 : undefined;
}

/** The chart a SPARKLINE draws from its data and options (rows of values, as read), or the error that is its value. */
export function readSparkline(data: Rows, optionRows: Rows): Sparkline | SheetError {
  const bad = firstError(data) ?? firstError(optionRows);
  if (bad) return bad;
  const read = readOptions(optionRows);
  if ('e' in read) return read;
  const { kind, options, empty, nan } = read;
  // A line over data two columns wide (more than one row) is x then y.
  const paired = kind === 'line' && data.length > 1 && data.every((row) => row.length === 2);
  const values: number[] = [];
  const xs: number[] = [];
  for (const row of paired ? data : [data.flat()]) {
    const cells = paired ? [row[1]!] : row;
    for (const cell of cells) {
      if (values.length >= SPARKLINE_POINTS_MAX) break;
      const y = pointOf(cell, empty, nan);
      const x = paired ? pointOf(row[0]!, empty, nan) : values.length;
      if (y === undefined || x === undefined) continue;
      if (
        paired &&
        ((options.xmin !== undefined && x < options.xmin) ||
          (options.xmax !== undefined && x > options.xmax))
      )
        continue;
      values.push(y);
      xs.push(x);
    }
  }
  return paired ? { kind, values, xs, options } : { kind, values, options };
}
