// The ODF namespaces a text document's parts name beyond the package's (ODF 1.4 part 3), and LiveDoc's extension
// namespace (standard-mapping.md "Extensions").
import { ODF_NS } from '@livedoc/office-packages';

export const LIVEDOC_NS = 'urn:livedoc:xmlns:text:1.0';

export const NS = {
  ...ODF_NS,
  number: 'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
  xml: 'http://www.w3.org/XML/1998/namespace',
  livedoc: LIVEDOC_NS,
} as const;

/** The prefixes every part LiveDoc writes declares, bound as ODF names them. */
export const WRITTEN_NS: Readonly<Record<string, string>> = {
  office: NS.office,
  style: NS.style,
  text: NS.text,
  table: NS.table,
  draw: NS.draw,
  fo: NS.fo,
  xlink: NS.xlink,
  dc: NS.dc,
  meta: NS.meta,
  number: NS.number,
  svg: NS.svg,
  livedoc: LIVEDOC_NS,
};
