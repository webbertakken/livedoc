// An ODF sheet's row and column sizes (docs/specs/029-sheets/standard-mapping.md "Unknown content", D104, D124): not
// read yet, so a sheet sized by hand is named. Hand-sized is a sheet whose columns are of more than one width, or whose
// rows are of more than one height, one not its text's (`style:use-optimal-row-height` other than true). LibreOffice
// and Google give every line a size, and a last run of lines to the grid's end a size of its own (Google every row
// one not its text's), so that run is left out and a size alone says nothing.
import {
  attributeOf,
  childElement,
  childElements,
  ODF_NS,
  type XmlElement,
} from '@livedoc/office-packages';

const { office: OFFICE, style: STYLE, table: TABLE } = ODF_NS;

// The table's elements of `local` (`table-column`, `table-row`), inside their groups and headers too.
function linesOf(element: XmlElement, local: string): XmlElement[] {
  return childElements(element).flatMap((child) => {
    if (child.uri !== TABLE) return [];
    if (child.local === local) return [child];
    return /^table-(columns|rows|header-columns|header-rows|column-group|row-group)$/.test(
      child.local,
    )
      ? linesOf(child, local)
      : [];
  });
}

/** Whether a table is sized by hand, by the automatic styles of `roots` (content.xml's, styles.xml's). */
export type OdsHandSized = (table: XmlElement) => boolean;

export function odsHandSized(roots: readonly XmlElement[]): OdsHandSized {
  const widths = new Map<string, string>();
  const heights = new Map<string, string>();
  const fixedRows = new Set<string>();
  for (const root of roots)
    for (const local of ['automatic-styles', 'styles']) {
      const container = childElement(root, OFFICE, local);
      for (const style of container ? childElements(container) : []) {
        const name = attributeOf(style, STYLE, 'name');
        if (name === undefined || style.uri !== STYLE || style.local !== 'style') continue;
        const columns = childElement(style, STYLE, 'table-column-properties');
        const width = columns && attributeOf(columns, STYLE, 'column-width');
        if (width !== undefined) widths.set(name, width);
        const rows = childElement(style, STYLE, 'table-row-properties');
        if (!rows) continue;
        heights.set(name, attributeOf(rows, STYLE, 'row-height') ?? '');
        if (attributeOf(rows, STYLE, 'use-optimal-row-height') !== 'true') fixedRows.add(name);
      }
    }
  const styleOf = (line: XmlElement) => attributeOf(line, TABLE, 'style-name') ?? '';
  // The sizes of a table's lines but the last run.
  const sizes = (lines: XmlElement[], of: Map<string, string>) =>
    new Set(lines.slice(0, -1).flatMap((line) => of.get(styleOf(line)) ?? []));
  return (table) => {
    const columns = linesOf(table, 'table-column');
    const rows = linesOf(table, 'table-row');
    const fixed = rows.slice(0, -1).some((row) => fixedRows.has(styleOf(row)));
    return sizes(columns, widths).size > 1 || (fixed && sizes(rows, heights).size > 1);
  };
}
