// A workbook's number formats in ODF (docs/specs/029-sheets/standard-mapping.md "Number formats in the file", D93,
// D94): written as a data style and an automatic cell style per code, `N1`/`ce1` in order of first use; read back from
// a file's automatic and common styles, a cell's own style over its row's and column's default.
import {
  attributeOf,
  childElement,
  childElements,
  ODF_NS,
  type XmlElement,
} from '@livedoc/office-packages';
import { dataStyleXml } from './odf-number-styles';
import { readDataStyle, type DataStyleRead } from './odf-number-styles-read';
import { odfLengthFromPx } from './line-units';

const { office: OFFICE, style: STYLE, number: NUMBER } = ODF_NS;

/** The cell styles a written file names, one per number format. */
export class OdsStyles {
  private readonly cells = new Map<string, string | null>();
  private readonly xml: string[] = [];
  private written = 0;

  /** The cell style for a code, or null when ODF cannot say the code (the caller names the loss). */
  cellStyle(code: string): string | null {
    const known = this.cells.get(code);
    if (known !== undefined) return known;
    const n = this.written + 1;
    const data = dataStyleXml(`N${n}`, code);
    const name = data ? `ce${n}` : null;
    if (data) {
      this.written = n;
      this.xml.push(
        ...data,
        `<style:style style:name="ce${n}" style:family="table-cell" style:data-style-name="N${n}"/>`,
      );
    }
    this.cells.set(code, name);
    return name;
  }

  private readonly lines = new Map<string, string>();
  private readonly lineXml: string[] = [];

  /**
   * The automatic style of a row or a column of `px` (standard-mapping.md "Rows and columns in the file"): `ro1`,
   * `co1`, ... in order of first use; a row's at its text's height when `optimal`.
   */
  lineStyle(family: 'table-row' | 'table-column', px: number, optimal: boolean): string {
    const key = `${family}|${px}|${optimal}`;
    const known = this.lines.get(key);
    if (known) return known;
    const row = family === 'table-row';
    const name = `${row ? 'ro' : 'co'}${[...this.lines.keys()].filter((k) => k.startsWith(family + '|')).length + 1}`;
    const size = odfLengthFromPx(px);
    const properties = row
      ? `<style:table-row-properties style:row-height="${size}" style:use-optimal-row-height="${optimal}"/>`
      : `<style:table-column-properties style:column-width="${size}"/>`;
    this.lineXml.push(
      `<style:style style:name="${name}" style:family="${family}">${properties}</style:style>`,
    );
    this.lines.set(key, name);
    return name;
  }

  /** `office:automatic-styles` with the `kept` ones after the cells', or nothing when there are none. */
  automaticStyles(kept: readonly string[] = []): string[] {
    const styles = [...this.lineXml, ...this.xml, ...kept];
    return styles.length === 0
      ? []
      : ['<office:automatic-styles>', ...styles, '</office:automatic-styles>'];
  }
}

/**
 * The cell styles among a file's style containers that format more than the number: any properties of their own
 * (a font, a fill, a border, an alignment) (standard-mapping.md "Unknown content", `styles_unread`, D104).
 */
export function odsStyledCellStyles(roots: readonly XmlElement[]): Set<string> {
  const out = new Set<string>();
  for (const root of roots)
    for (const local of ['automatic-styles', 'styles']) {
      const container = childElement(root, OFFICE, local);
      for (const style of container ? childElements(container) : []) {
        const name = attributeOf(style, STYLE, 'name');
        const cell = attributeOf(style, STYLE, 'family') === 'table-cell';
        if (cell && name !== undefined && childElements(style).length > 0) out.add(name);
      }
    }
  return out;
}

/** A cell style's number format: its code read, none for a style with no data style. */
export type OdsCellFormats = (styleName: string) => DataStyleRead | null;

/** Every cell style's number format among a file's style containers (`office:automatic-styles`, `office:styles`). */
export function odsCellFormats(roots: readonly XmlElement[]): OdsCellFormats {
  const containers = roots.flatMap((root) =>
    ['automatic-styles', 'styles'].flatMap((local) => {
      const found = childElement(root, OFFICE, local);
      return found ? [found] : [];
    }),
  );
  const data = new Map<string, XmlElement>();
  const cells = new Map<string, XmlElement>();
  for (const container of containers)
    for (const element of childElements(container)) {
      const name = attributeOf(element, STYLE, 'name');
      if (name === undefined) continue;
      if (element.uri === NUMBER && element.local.endsWith('-style')) data.set(name, element);
      if (element.uri === STYLE && element.local === 'style') cells.set(name, element);
    }
  const memo = new Map<string, DataStyleRead | null>();
  const dataStyleOf = (name: string, depth: number): string | undefined => {
    const style = cells.get(name);
    if (!style || depth > 10) return undefined;
    return (
      attributeOf(style, STYLE, 'data-style-name') ??
      dataStyleOf(attributeOf(style, STYLE, 'parent-style-name') ?? '', depth + 1)
    );
  };
  return (styleName) => {
    const known = memo.get(styleName);
    if (known !== undefined) return known;
    const element = data.get(dataStyleOf(styleName, 0) ?? '');
    const read = element ? readDataStyle(element, data) : null;
    memo.set(styleName, read);
    return read;
  };
}
