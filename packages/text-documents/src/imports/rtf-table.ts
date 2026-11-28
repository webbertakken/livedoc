// A Rich Text table read row by row (docs/specs/034-text-documents/files-and-print.md "Opening"): each row's cells with
// their right edges, merges and backgrounds; the rows one table, its columns every edge any row names, a merged cell
// its origin's span rather than a cell of its own.
import type { Block } from '../model/blocks';
import type { Table, TableCell, TableRow } from '../model/tables';

/** What `\cellx` closes: a cell's right edge in twips, its merges and background. */
export type RtfCellDef = {
  readonly edge: number;
  readonly vmerge?: 'first' | 'continue';
  readonly hmerge?: 'first' | 'continue';
  readonly background?: string;
};

export type RtfRow = {
  readonly left: number;
  readonly header: boolean;
  readonly defs: readonly RtfCellDef[];
  readonly cells: readonly Block[][];
};

type Building = { blocks: Block[]; colSpan: number; rowSpan: number; background?: string };

/** The rows as one table; its cells' blocks as read, an empty cell one empty paragraph. */
export function rtfTable(rows: readonly RtfRow[], emptyParagraph: () => Block): Table {
  const edges = [
    ...new Set(rows.flatMap((row) => [row.left, ...row.defs.map((d) => d.edge)])),
  ].sort((a, b) => a - b);
  const column = (edge: number) => Math.max(0, edges.indexOf(edge));
  // Each column's cell merging downwards, until a row does not continue it.
  const merging = new Map<number, Building>();
  const built: Building[][] = rows.map((row) => {
    const out: Building[] = [];
    let start = row.left;
    row.defs.forEach((def, i) => {
      const from = column(start);
      const to = Math.max(from + 1, column(def.edge));
      start = def.edge;
      const blocks = row.cells[i] ?? [];
      if (def.vmerge === 'continue' && merging.has(from)) {
        merging.get(from)!.rowSpan += 1;
        return;
      }
      if (def.hmerge === 'continue' && out.length > 0) {
        out.at(-1)!.colSpan += to - from;
        return;
      }
      const cell: Building = {
        blocks: blocks.length > 0 ? blocks : [emptyParagraph()],
        colSpan: to - from,
        rowSpan: 1,
        ...(def.background ? { background: def.background } : {}),
      };
      if (def.vmerge === 'first') merging.set(from, cell);
      else merging.delete(from);
      out.push(cell);
    });
    return out;
  });
  const widths = edges.slice(1).map((edge, i) => Math.max(1, (edge - edges[i]!) / 20));
  const tableRows: TableRow[] = built.map((cells) => ({
    cells: cells.map((cell): TableCell => ({
      blocks: cell.blocks,
      ...(cell.colSpan > 1 ? { colSpan: cell.colSpan } : {}),
      ...(cell.rowSpan > 1 ? { rowSpan: cell.rowSpan } : {}),
      props: cell.background ? { background: cell.background } : {},
    })),
  }));
  const headerRows = rows.findIndex((row) => !row.header);
  return {
    type: 'table',
    columns: widths.length > 0 ? widths : [72],
    rows: tableRows,
    headerRows: headerRows < 0 ? rows.length : headerRows,
  };
}
