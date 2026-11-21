// Footnotes in ODF (docs/specs/034-text-documents/page-layout.md "Footnotes", "In the file"): a `text:note` of the
// footnote class whose citation is its number (no `text:label` of its own) is the model's note, its `text:note-body`
// read as writing of its own; an endnote or a labelled citation stays kept content.
import { attributeOf, childElement, type XmlElement } from '@livedoc/office-packages';
import { NS } from './odf-names';

/** The note's body when the model holds this element as a footnote. */
export function odfFootnoteBody(e: XmlElement): XmlElement | undefined {
  if (e.uri !== NS.text || e.local !== 'note') return undefined;
  if (attributeOf(e, NS.text, 'note-class') !== 'footnote') return undefined;
  const citation = childElement(e, NS.text, 'note-citation');
  if (citation && attributeOf(citation, NS.text, 'label') !== undefined) return undefined;
  return childElement(e, NS.text, 'note-body');
}

/** A footnote as its element: its number as the citation, its blocks' XML as the body. */
export const odfFootnoteXml = (number: number, body: string): string =>
  `<text:note text:id="ftn${number}" text:note-class="footnote"><text:note-citation>${number}</text:note-citation><text:note-body>${body}</text:note-body></text:note>`;
