// Rows and columns in ODF (docs/specs/029-sheets/standard-mapping.md "Rows and columns in the file"): a row's or a
// column's style for its size (a row's own only when not at its text's height), `table:visibility="collapse"` for a
// hidden line, and `table:table-row-group` / `table:table-column-group` nesting a line's groups, `table:display="false"`
// on a collapsed one. The size most lines carry within the grid is the sheet's own (D124); ODF says nothing of
// the controls' side, read as after (D167).
import {
  attributeOf,
  childElement,
  childElements,
  ODF_NS,
  type XmlElement,
} from '@livedoc/office-packages';
import { OUTLINE_DEPTH_MAX } from '../limits';
import {
  collapsedLines,
  fileGroups,
  type FileAxisLines,
  type FileGroupMark,
  type FileLine,
  type FileLines,
} from './file-lines';
import { pxFromOdfLength } from './line-units';

const { office: OFFICE, style: STYLE, table: TABLE } = ODF_NS;

/** A file's row and column styles' sizes, by style name. */
export type OdsLineStyles = {
  width: (style: string | undefined) => number | undefined;
  // A row's height, and whether it is its text's (`style:use-optimal-row-height`).
  height: (style: string | undefined) => { px: number; optimal: boolean } | undefined;
};

export function odsLineStyles(roots: readonly XmlElement[]): OdsLineStyles {
  const widths = new Map<string, number>();
  const heights = new Map<string, { px: number; optimal: boolean }>();
  for (const root of roots)
    for (const local of ['automatic-styles', 'styles']) {
      const container = childElement(root, OFFICE, local);
      for (const style of container ? childElements(container) : []) {
        const name = attributeOf(style, STYLE, 'name');
        if (name === undefined || style.uri !== STYLE || style.local !== 'style') continue;
        const column = childElement(style, STYLE, 'table-column-properties');
        const width = pxFromOdfLength((column && attributeOf(column, STYLE, 'column-width')) ?? '');
        if (width !== null) widths.set(name, width);
        const row = childElement(style, STYLE, 'table-row-properties');
        const height = pxFromOdfLength((row && attributeOf(row, STYLE, 'row-height')) ?? '');
        const optimal = row && attributeOf(row, STYLE, 'use-optimal-row-height') === 'true';
        if (height !== null) heights.set(name, { px: height, optimal: optimal === true });
      }
    }
  return {
    width: (style) => (style === undefined ? undefined : widths.get(style)),
    height: (style) => (style === undefined ? undefined : heights.get(style)),
  };
}

// A run of lines as the file writes it: from, how many, its size, hidden, its depth.
type Run = {
  from: number;
  n: number;
  size: number | undefined;
  fixed: boolean;
  hidden: boolean;
  // Hidden by the sheet's filter (`table:visibility="filter"`), LibreOffice's own.
  filtered: boolean;
  depth: number;
};

const AXIS = {
  r: {
    line: 'table-row',
    group: 'table-row-group',
    plain: ['table-rows', 'table-header-rows'],
    repeat: 'number-rows-repeated',
  },
  c: {
    line: 'table-column',
    group: 'table-column-group',
    plain: ['table-columns', 'table-header-columns'],
    repeat: 'number-columns-repeated',
  },
} as const;

// The size most of the lines read carry; the first such when two tie.
function mostCarried(runs: readonly Run[]): number | undefined {
  const counts = new Map<number, number>();
  for (const run of runs)
    if (run.size !== undefined) counts.set(run.size, (counts.get(run.size) ?? 0) + run.n);
  let best: number | undefined;
  for (const [size, n] of counts) if (best === undefined || n > counts.get(best)!) best = size;
  return best;
}

function runsOf(table: XmlElement, axis: 'r' | 'c', styles: OdsLineStyles, max: number) {
  const names = AXIS[axis];
  const runs: Run[] = [];
  const collapsed: FileGroupMark[] = [];
  let at = 0;
  const walk = (element: XmlElement, depth: number) => {
    for (const child of childElements(element)) {
      if (child.uri !== TABLE) continue;
      if (child.local === names.line) {
        const style = attributeOf(child, TABLE, 'style-name');
        const height = axis === 'r' ? styles.height(style) : undefined;
        const size = axis === 'r' ? height?.px : styles.width(style);
        if (at >= max) continue;
        const repeat = Number(attributeOf(child, TABLE, names.repeat) ?? '1');
        const n = Math.min(Number.isInteger(repeat) && repeat > 0 ? repeat : 1, max - at);
        const visibility = attributeOf(child, TABLE, 'visibility');
        const hidden = visibility === 'collapse';
        const filtered = axis === 'r' && visibility === 'filter';
        runs.push({
          from: at,
          n,
          size,
          fixed: axis === 'c' || height?.optimal === false,
          hidden,
          filtered,
          depth,
        });
        at += n;
      } else if (child.local === names.group) {
        const deeper = Math.min(OUTLINE_DEPTH_MAX, depth + 1);
        const from = at;
        walk(child, deeper);
        if (attributeOf(child, TABLE, 'display') === 'false' && at > from)
          collapsed.push({ at: from, depth: deeper });
      } else if ((names.plain as readonly string[]).includes(child.local)) walk(child, depth);
    }
  };
  walk(table, 0);
  return { runs, collapsed, own: mostCarried(runs) };
}

/** A table's rows and columns, up to `max` of each; none when it says nothing of them. */
export function readOdsLines(
  table: XmlElement,
  styles: OdsLineStyles,
  max: { rows: number; cols: number },
): FileLines {
  const out: FileLines = {};
  for (const axis of ['r', 'c'] as const) {
    // The size most lines carry is the sheet's own.
    const { runs, collapsed, own } = runsOf(
      table,
      axis,
      styles,
      axis === 'r' ? max.rows : max.cols,
    );
    const lines = new Map<number, FileLine>();
    for (const run of runs) {
      const sized = run.fixed && run.size !== undefined && run.size !== own;
      if (!sized && !run.hidden && !run.filtered && !run.depth) continue;
      for (let p = run.from; p < run.from + run.n; p++)
        lines.set(p, {
          ...(sized ? { size: run.size } : {}),
          ...(run.hidden ? { hidden: true as const } : {}),
          ...(run.filtered ? { filtered: true as const } : {}),
          ...(run.depth ? { depth: run.depth } : {}),
        });
    }
    if (lines.size === 0 && own === undefined) continue;
    const grouped = [...lines.values()].some((line) => line.depth);
    out[axis] = {
      lines,
      collapsed,
      ...(grouped ? { after: true as const } : {}),
      ...(own === undefined ? {} : { size: own }),
    };
  }
  return out;
}

/** The style a line of a written file names for its size: `co1`, `ro1`, ... (ods-styles.ts). */
export type LineStyleOf = (
  family: 'table-row' | 'table-column',
  px: number,
  optimal: boolean,
) => string;

// A line's attributes in a written file: its style and whether it is hidden; and its depth.
type LineOut = { attrs: string; depth: number };

/** What a written table says of one axis's lines: each position's attributes and depth, its breaks, its groups. */
export class OdsAxisOut {
  private readonly axis: FileAxisLines;
  private readonly folded: Set<number>;
  private readonly opens: Map<string, boolean>;
  private readonly plain: string;
  private readonly style: (px: number | undefined) => string;

  constructor(
    axis: FileAxisLines | undefined,
    family: 'table-row' | 'table-column',
    styleOf: LineStyleOf,
  ) {
    this.axis = axis ?? { lines: new Map(), collapsed: [] };
    const groups = fileGroups(this.axis);
    this.folded = collapsedLines(groups);
    this.opens = new Map(groups.map((g) => [`${g.depth}:${g.from}`, g.collapsed]));
    const own = this.axis.size;
    // A row with no size of its own is written at its text's height; a column at the sheet's width.
    this.style = (px) =>
      px === undefined
        ? own === undefined
          ? ''
          : ` table:style-name="${styleOf(family, own, family === 'table-row')}"`
        : ` table:style-name="${styleOf(family, px, false)}"`;
    this.plain = this.style(undefined);
  }

  /** The positions where a line's attributes may change: where one with its own starts and ends. */
  breaks(): number[] {
    const out = new Set<number>();
    for (const p of [...this.axis.lines.keys(), ...this.folded]) out.add(p).add(p + 1);
    return [...out];
  }

  at(p: number): LineOut {
    const line = this.axis.lines.get(p);
    const hidden =
      line?.hidden || this.folded.has(p)
        ? ' table:visibility="collapse"'
        : line?.filtered
          ? ' table:visibility="filter"'
          : '';
    const attrs = line?.size === undefined ? this.plain : this.style(line.size);
    return { attrs: attrs + hidden, depth: line?.depth ?? 0 };
  }

  /** Runs of written lines, each starting at `from` with its depth, wrapped in the groups they open and close. */
  nest(runs: readonly { from: number; xml: readonly string[] }[], group: string): string[] {
    const out: string[] = [];
    let open = 0;
    for (const run of runs) {
      const depth = this.at(run.from).depth;
      for (; open > depth; open--) out.push(`</table:${group}>`);
      for (; open < depth;) {
        open++;
        const shut = this.opens.get(`${open}:${run.from}`) === true;
        out.push(`<table:${group}${shut ? ' table:display="false"' : ''}>`);
      }
      out.push(...run.xml);
    }
    for (; open > 0; open--) out.push(`</table:${group}>`);
    return out;
  }
}
