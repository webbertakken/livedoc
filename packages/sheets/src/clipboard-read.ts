// Pasted HTML read back into rows of cells (docs/specs/029-sheets/grid-and-editing.md "Clipboard", D152 to D154): the
// first table's cells with their formats (clipboard-style.ts), Google's R1C1 formula and how far each cell spans.
// The HTML is scanned as text, never put in a DOM.
import { excelClassStyles, formatFromStyle } from './clipboard-style';
import type { CellFormat } from './sheet';

/** A pasted cell: its text, formats, a formula in R1C1 (Google's `data-sheets-formula`) and how far it spans. */
export type PastedCell = {
  text: string;
  format?: CellFormat;
  formula?: string;
  span?: { rows: number; cols: number };
};

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

// The first <table> of pasted HTML as rows of cells, colspan and rowspan filled with empty cells (the spanning cell
// says how far it spans); null when there is no table.
export function readPastedHtml(html: string): PastedCell[][] | null {
  const start = html.search(/<table[\s>]/i);
  if (start < 0) return null;
  const end = html.search(/<\/table>/i);
  const classes = excelClassStyles(html);
  const body = html.slice(start, end < 0 ? undefined : end);
  const rows: PastedCell[][] = [];
  const pendingRowSpans: Map<number, number>[] = [];
  const tagRe = /<\/?([a-z0-9]+)([^>]*)>/gi;
  let row: PastedCell[] | null = null;
  let cell: {
    text: string;
    /** The cell's own style, then each inline span's, in document order. */
    styles: string[];
    tags: Set<string>;
    colspan: number;
    rowspan: number;
    formula?: string;
  } | null = null;
  let last = 0;
  const inner: string[] = [];
  const finishCell = () => {
    if (!cell || !row) return;
    cell.text += inner.join('');
    inner.length = 0;
    const text = decode(cell.text.replace(/\s*\n\s*/g, ' '))
      .split('\u0001')
      .join('\n')
      .trim();
    const format = formatFromStyle(cell.styles.join(';'), cell.tags);
    const ri = rows.length;
    while (pendingRowSpans[ri]?.has(row.length)) row.push({ text: '' });
    const span =
      cell.rowspan > 1 || cell.colspan > 1 ? { rows: cell.rowspan, cols: cell.colspan } : undefined;
    row.push({
      text,
      ...(format ? { format } : {}),
      ...(cell.formula ? { formula: cell.formula } : {}),
      ...(span ? { span } : {}),
    });
    for (let k = 1; k < cell.colspan; k++) row.push({ text: '' });
    for (let k = 1; k < cell.rowspan; k++) {
      const m = (pendingRowSpans[ri + k] ??= new Map());
      for (let j = 0; j < cell.colspan; j++) m.set(row.length - cell.colspan + j, 1);
    }
    cell = null;
  };
  for (let m = tagRe.exec(body); m; m = tagRe.exec(body)) {
    const text = body.slice(last, m.index);
    last = tagRe.lastIndex;
    if (cell) inner.push(text);
    const name = m[1]!.toLowerCase();
    const closing = m[0][1] === '/';
    const attrs = m[2]!;
    if (name === 'tr' && !closing) {
      finishCell();
      row = [];
      rows.push(row);
    } else if ((name === 'td' || name === 'th') && !closing) {
      finishCell();
      if (!row) {
        row = [];
        rows.push(row);
      }
      const attr = (n: string) => {
        const m = new RegExp(`(?<![\\w-])${n}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(
          attrs,
        );
        return m ? (m[2] ?? m[3] ?? m[4])! : undefined;
      };
      // Excel's class rules first, then the cell's own style over them.
      const classStyles = (attr('class') ?? '')
        .split(/\s+/)
        .map((name) => classes.get(name.toLowerCase()) ?? '');
      const formula = attr('data-sheets-formula');
      const span = (n: string) => {
        const x = Number(attr(n) ?? 1);
        return Number.isInteger(x) && x > 0 ? Math.min(x, 200) : 1;
      };
      cell = {
        text: '',
        styles: [...classStyles, attr('style') ?? ''],
        tags: new Set(),
        colspan: span('colspan'),
        rowspan: span('rowspan'),
        ...(formula?.startsWith('=') ? { formula: decode(formula) } : {}),
      };
    } else if ((name === 'td' || name === 'th') && closing) {
      finishCell();
    } else if (cell && !closing && name === 'br') {
      inner.push('\u0001');
    } else if (
      cell &&
      !closing &&
      name !== 'span' &&
      name !== 'div' &&
      name !== 'p' &&
      name !== 'font'
    ) {
      cell.tags.add(name);
    } else if (cell && !closing && (name === 'span' || name === 'font')) {
      const style = /style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
      if (style !== undefined) cell.styles.push(style);
    }
  }
  finishCell();
  const width = Math.max(0, ...rows.map((r) => r.length));
  if (width === 0) return null;
  return rows.map((r) => [...r, ...Array.from({ length: width - r.length }, () => ({ text: '' }))]);
}
