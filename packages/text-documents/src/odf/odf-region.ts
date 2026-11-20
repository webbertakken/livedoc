// A continuous section in ODF (docs/specs/034-text-documents/page-layout.md "Breaks"): a `text:section` region, as a
// suite writes one; its start tag is what a section break holds as `region`, the region ending at the next break.
import type { KeptXml } from '@livedoc/office-packages';
import { NS } from './odf-names';

// What LiveDoc names the regions it makes, numbered.
const REGION_NAME = 'LiveDocSection';

/** A new region's start tag, named apart from the regions there are. */
export function odfSectionRegion(taken: readonly KeptXml[]): KeptXml {
  const names = new Set(taken.map((r) => /text:name="([^"]*)"/.exec(r.xml)?.[1]));
  let n = 1;
  while (names.has(`${REGION_NAME}${n}`)) n += 1;
  return { xml: `<text:section text:name="${REGION_NAME}${n}">`, ns: { text: NS.text } };
}
