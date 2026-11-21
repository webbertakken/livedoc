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

  /** `office:automatic-styles`, or nothing when no cell has a format. */
  automaticStyles(): string[] {
    return this.xml.length === 0
      ? []
      : ['<office:automatic-styles>', ...this.xml, '</office:automatic-styles>'];
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
