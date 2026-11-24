// A sheet's tab in ODF (docs/specs/029-sheets/standard-mapping.md "Sheet name, hidden, tab colour"): its table's
// automatic style, whose `style:table-properties` say `table:display="false"` for a hidden sheet and `table:tab-color`
// (ODF 1.3 and later) for its tab's colour; LibreOffice's older `tableooo:tab-color` is read too.
import {
  attributeOf,
  childElement,
  childElements,
  ODF_NS,
  type XmlElement,
} from '@livedoc/office-packages';
import { isColour } from '../format';
import type { FileSheet } from './workbook-file';

const { office: OFFICE, style: STYLE, table: TABLE, tableooo: TABLEOOO } = ODF_NS;

export type OdsTabLook = Pick<FileSheet, 'tabColour' | 'hidden'>;

/** Each table style's tab look among a file's style containers, by name; none for a style that says neither. */
export function odsTabLooks(
  roots: readonly XmlElement[],
): (style: string | undefined) => OdsTabLook {
  const looks = new Map<string, OdsTabLook>();
  for (const root of roots)
    for (const local of ['automatic-styles', 'styles']) {
      const container = childElement(root, OFFICE, local);
      for (const style of container ? childElements(container) : []) {
        const name = attributeOf(style, STYLE, 'name');
        const props = childElement(style, STYLE, 'table-properties');
        if (name === undefined || !props || attributeOf(style, STYLE, 'family') !== 'table')
          continue;
        const colour = (
          attributeOf(props, TABLE, 'tab-color') ?? attributeOf(props, TABLEOOO, 'tab-color')
        )?.toLowerCase();
        looks.set(name, {
          ...(isColour(colour) ? { tabColour: colour } : {}),
          ...(attributeOf(props, TABLE, 'display') === 'false' ? { hidden: true as const } : {}),
        });
      }
    }
  return (style) => (style === undefined ? {} : (looks.get(style) ?? {}));
}

/** A table style's properties for a tab look, or null when it says nothing. */
export function odsTableProperties(look: OdsTabLook): string | null {
  if (!look.tabColour && !look.hidden) return null;
  return (
    '<style:table-properties table:display="' +
    (look.hidden ? 'false' : 'true') +
    '"' +
    (look.tabColour ? ` table:tab-color="${look.tabColour}"` : '') +
    '/>'
  );
}
