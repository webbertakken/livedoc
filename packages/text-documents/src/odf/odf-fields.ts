// Page numbers and page counts in ODF (docs/specs/034-text-documents/page-layout.md "Page numbers", "In the file"):
// `text:page-number` showing the current page and `text:page-count`, in the default number format, are the model's
// fields; one in another form (another page, letters, Roman numerals) stays kept content.
import { attributeOf, escapeXmlText, textContent, type XmlElement } from '@livedoc/office-packages';
import type { Field, FieldKind } from '../model/blocks';
import { NS } from './odf-names';

const ARABIC = '1';

/** The field an element is, when the model holds it in that form. */
export function odfFieldKind(e: XmlElement): FieldKind | undefined {
  if (e.uri !== NS.text) return undefined;
  const format = attributeOf(e, NS.style, 'num-format');
  if (format !== undefined && format !== ARABIC) return undefined;
  if (e.local === 'page-count') return 'page-count';
  if (e.local !== 'page-number') return undefined;
  const select = attributeOf(e, NS.text, 'select-page');
  if (select !== undefined && select !== 'current') return undefined;
  if (attributeOf(e, NS.text, 'page-adjust') !== undefined) return undefined;
  return 'page-number';
}

/** The text a field element shows: its characters. */
export const odfFieldText = (e: XmlElement): string => textContent(e);

/** A field as its element, the text last drawn inside. */
export function odfFieldXml(field: Field): string {
  const text = escapeXmlText(field.text);
  return field.field === 'page-number'
    ? `<text:page-number text:select-page="current">${text}</text:page-number>`
    : `<text:page-count>${text}</text:page-count>`;
}
