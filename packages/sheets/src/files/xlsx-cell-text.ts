// A cell's text in XLSX (docs/specs/029-sheets/standard-mapping.md "Unknown content", Cell text, D377): a string
// item's (`si`, `is`) own text or its runs' texts, a phonetic guide not its text; and whether it is rich (runs, each
// with its own font), which the reader keeps whole while the cell's text reads the same. Shared by the reader and the
// writer.
import {
  childElement,
  childElements,
  keptXmlWithin,
  parseXml,
  textContent,
  type XmlBindings,
  type XmlElement,
} from '@livedoc/office-packages';
import { fromXstring, SPREADSHEETML_NS } from './xlsx-parts';

// The text one child of a string item gives: its own `t`, or a run's `t`; anything else (a phonetic guide) none.
function childText(child: XmlElement, ns: string): string {
  if (child.uri !== ns) return '';
  if (child.local === 't') return textContent(child);
  const t = child.local === 'r' ? childElement(child, ns, 't') : undefined;
  return t ? textContent(t) : '';
}

/** A string item's text: its own `t`, or its runs' `t`s; phonetic guides are not its text. */
export const itemText = (item: XmlElement, ns: string): string =>
  fromXstring(
    childElements(item)
      .map((child) => childText(child, ns))
      .join(''),
  );

/** Whether a string item is rich: it holds runs. */
export const isRichItem = (item: XmlElement, ns: string): boolean =>
  childElements(item).some((child) => child.uri === ns && child.local === 'r');

/** The text a rich item's kept children read as, as the cell's would; null when one does not parse. */
export function keptRunsText(items: readonly { xml: string; ns: XmlBindings }[]): string | null {
  let text = '';
  for (const item of items) {
    const parsed = parseXml(keptXmlWithin(item, {}));
    if (!parsed.ok) return null;
    text += childText(parsed.root, SPREADSHEETML_NS);
  }
  return fromXstring(text);
}
