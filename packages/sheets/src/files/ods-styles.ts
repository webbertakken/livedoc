// A workbook's cell styles in ODF (docs/specs/029-sheets/standard-mapping.md "Number formats in the file", "Cell
// styles in the file", D93, D94): written as a data style per code and an automatic cell style per code and look,
// `N1`/`ce1` in order of first use; number formats read back from a file's automatic and common styles, a cell's own
// style over its row's and column's default.
import {
  attributeOf,
  childElement,
  childElements,
  ODF_NS,
  type XmlElement,
} from '@livedoc/office-packages';
import { cellStyleKey, type CellStyle } from './cell-style';
import type { FormatStyle } from '../sheet';
import { odsStyleProperties } from './ods-cell-style';
import { dataStyleXml } from './odf-number-styles';
import { readDataStyle, type DataStyleRead } from './odf-number-styles-read';
import { odfLengthFromPx } from './line-units';
import { odsTableProperties, type OdsTabLook } from './ods-tab-look';

const { office: OFFICE, style: STYLE, number: NUMBER } = ODF_NS;

/** A cell's written style: its name (none for neither a format nor a look) and whether its code could not be said. */
export type OdsCellStyle = { name: string | null; unwritten: boolean };

/** The cell styles a written file names, one per number format and look. */
export class OdsStyles {
  private readonly data = new Map<string, string | null>();
  private readonly cells = new Map<string, OdsCellStyle>();
  private readonly xml: string[] = [];

  /** A code's data style (`N1`, ...), or null when ODF cannot say it (the caller names the loss). */
  private dataStyle(code: string): string | null {
    const known = this.data.get(code);
    if (known !== undefined) return known;
    const name = `N${[...this.data.values()].filter(Boolean).length + 1}`;
    const xml = dataStyleXml(name, code);
    if (xml) this.xml.push(...xml);
    this.data.set(code, xml ? name : null);
    return xml ? name : null;
  }

  /** The cell style for a code and a look: `ce1`, ... in order of first use. */
  cellStyle(code: string | undefined, style?: CellStyle): OdsCellStyle {
    const key = `${code ?? ''}\u0000${cellStyleKey(style)}`;
    const known = this.cells.get(key);
    if (known) return known;
    const data = code === undefined ? null : this.dataStyle(code);
    const unwritten = code !== undefined && data === null;
    const properties = odsStyleProperties(style);
    let name: string | null = null;
    if (data || properties) {
      name = `ce${[...this.cells.values()].filter((c) => c.name).length + 1}`;
      const dataAttribute = data ? ` style:data-style-name="${data}"` : '';
      this.xml.push(
        properties
          ? `<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default"${dataAttribute}>${properties}</style:style>`
          : `<style:style style:name="${name}" style:family="table-cell" style:parent-style-name="Default"${dataAttribute}/>`,
      );
    }
    const made = { name, unwritten };
    this.cells.set(key, made);
    return made;
  }

  private readonly conditional = new Map<string, string>();
  private readonly conditionalXml: string[] = [];
  private taken: ReadonlySet<string> = new Set();
  private nextConditional = 1;

  /** The common styles' display names kept content holds, which LiveDoc's own conditional styles never take. */
  reserve(names: ReadonlySet<string>): void {
    this.taken = names;
  }

  /**
   * A format rule's style as a common cell style, a child of "Default" setting the style alone, named as LibreOffice
   * names them (`ConditionalStyle_5f_1`, shown as `ConditionalStyle_1`, the name a rule gives), in order of first use.
   */
  conditionalStyle(style: FormatStyle): string {
    const key = cellStyleKey(style);
    const known = this.conditional.get(key);
    if (known) return known;
    let n = this.nextConditional;
    while (this.taken.has(`ConditionalStyle_${n}`)) n++;
    this.nextConditional = n + 1;
    const name = `ConditionalStyle_${n}`;
    this.conditional.set(key, name);
    this.conditionalXml.push(
      `<style:style style:name="ConditionalStyle_5f_${n}" style:display-name="${name}" style:family="table-cell" style:parent-style-name="Default">${odsStyleProperties(style)}</style:style>`,
    );
    return name;
  }

  /** The conditional styles written, for the common styles. */
  conditionalStyles(): string[] {
    return this.conditionalXml;
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

  private readonly tables = new Map<string, string>();
  private readonly tableXml: string[] = [];

  /** The automatic style of a table whose tab has a look (`ta1`, ... in order of first use), or null for none. */
  tableStyle(look: OdsTabLook): string | null {
    const properties = odsTableProperties(look);
    if (properties === null) return null;
    const known = this.tables.get(properties);
    if (known) return known;
    const name = `ta${this.tables.size + 1}`;
    this.tableXml.push(
      `<style:style style:name="${name}" style:family="table">${properties}</style:style>`,
    );
    this.tables.set(properties, name);
    return name;
  }

  /** `office:automatic-styles` with the `kept` ones after the cells', or nothing when there are none. */
  automaticStyles(kept: readonly string[] = []): string[] {
    const styles = [...this.tableXml, ...this.lineXml, ...this.xml, ...kept];
    return styles.length === 0
      ? []
      : ['<office:automatic-styles>', ...styles, '</office:automatic-styles>'];
  }
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
