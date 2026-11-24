// A sheet's tab in XLSX (docs/specs/029-sheets/standard-mapping.md "Sheet name, hidden, tab colour"): the workbook's
// `sheet@state` and the worksheet's `sheetPr/tabColor@rgb`, an ARGB colour. Excel's very hidden is read as hidden
// (D182); a tab colour by theme or index is not read, and named as content not kept.
import {
  attributeOf,
  childElement,
  childElements,
  type XmlElement,
} from '@livedoc/office-packages';
import type { FileSheet } from './workbook-file';

const ARGB = /^(?:[0-9a-f]{2})?([0-9a-f]{6})$/i;

/** A `tabColor@rgb` as a lower-case #rrggbb, or null when it is none. */
export function tabColourOfRgb(rgb: string | undefined): string | null {
  const match = ARGB.exec(rgb ?? '');
  return match ? `#${match[1]!.toLowerCase()}` : null;
}

/** Whether a `sheetPr` child is a `tabColor` LiveDoc reads (by its `rgb`). */
export function isReadTabColor(element: XmlElement, ns: string): boolean {
  return (
    element.uri === ns &&
    element.local === 'tabColor' &&
    tabColourOfRgb(attributeOf(element, '', 'rgb')) !== null
  );
}

/** A sheet's tab as its `sheet` entry and its worksheet's root say it. */
export function readXlsxTabLook(
  entry: XmlElement,
  root: XmlElement,
  ns: string,
): Pick<FileSheet, 'tabColour' | 'hidden'> {
  const state = attributeOf(entry, '', 'state');
  const sheetPr = childElement(root, ns, 'sheetPr');
  const tab = sheetPr && childElements(sheetPr).find((e) => isReadTabColor(e, ns));
  const colour = tab ? tabColourOfRgb(attributeOf(tab, '', 'rgb')) : null;
  return {
    ...(colour ? { tabColour: colour } : {}),
    ...(state === 'hidden' || state === 'veryHidden' ? { hidden: true as const } : {}),
  };
}

/** A `tabColor` for a lower-case #rrggbb, opaque, in `prefix`. */
export function xlsxTabColor(colour: string, prefix = ''): string {
  return `<${prefix}tabColor rgb="FF${colour.slice(1).toUpperCase()}"/>`;
}
