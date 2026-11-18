// Metadata (docs/specs/020-import-export/office-packages.md "Common pieces"): one `DocumentMetadata` both formats read
// into and write from, ODF's `office:meta` and OOXML's core and extended properties. What it does not map is kept and
// written back; the generator and the statistics are written fresh on every save.
import { keptXmlOf, keptXmlWithin, type KeptXml } from '../xml/kept-xml';
import { escapeXmlText } from '../xml/xml-write';
import {
  childElement,
  childElements,
  textContent,
  type XmlElement,
  type XmlParsed,
} from '../xml/xml-tree';
import { ODF_NS } from '../odf/odf-namespaces';

export type DocumentMetadata = {
  readonly title?: string;
  readonly subject?: string;
  readonly description?: string;
  /** Who made it (ODF `meta:initial-creator`, OOXML `dc:creator`). */
  readonly author?: string;
  /** Who saved it last (ODF `dc:creator`, OOXML `cp:lastModifiedBy`). */
  readonly lastModifiedBy?: string;
  /** ISO 8601 dates, as the file wrote them. */
  readonly created?: string;
  readonly modified?: string;
  readonly language?: string;
  /** What the file's metadata holds that these fields do not. */
  readonly kept?: { readonly meta?: readonly KeptXml[]; readonly app?: readonly KeptXml[] };
};

export type DocumentStatistics = { paragraphs: number; words: number; characters: number };

/** The statistics of a body's paragraphs: words split on white space, characters counted by code point. */
export function statisticsOf(paragraphs: readonly string[]): DocumentStatistics {
  let words = 0;
  let characters = 0;
  for (const text of paragraphs) {
    words += text.split(/\s+/).filter(Boolean).length;
    characters += [...text].length;
  }
  return { paragraphs: paragraphs.length, words, characters };
}

const DC = 'http://purl.org/dc/elements/1.1/';
const DCTERMS = 'http://purl.org/dc/terms/';
const CP = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';
export const EXTENDED_PROPERTIES_NS =
  'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';

type Field = Exclude<keyof DocumentMetadata, 'kept'>;

const ODF_FIELDS: readonly [Field, string, string][] = [
  ['title', DC, 'title'],
  ['subject', DC, 'subject'],
  ['description', DC, 'description'],
  ['author', ODF_NS.meta, 'initial-creator'],
  ['lastModifiedBy', DC, 'creator'],
  ['created', ODF_NS.meta, 'creation-date'],
  ['modified', DC, 'date'],
  ['language', DC, 'language'],
];

// Written fresh on every save, so never kept.
const ODF_FRESH = new Set(['generator', 'document-statistic']);

function readFields(
  parsed: XmlParsed,
  container: XmlElement,
  fields: readonly [Field, string, string][],
  fresh: (e: XmlElement) => boolean,
): { values: Partial<Record<Field, string>>; kept: KeptXml[] } {
  const values: Partial<Record<Field, string>> = {};
  const kept: KeptXml[] = [];
  for (const child of childElements(container)) {
    const field = fields.find(([, uri, local]) => child.uri === uri && child.local === local);
    if (field && values[field[0]] === undefined) values[field[0]] = textContent(child);
    else if (!fresh(child)) kept.push(keptXmlOf(parsed, child));
  }
  return { values, kept };
}

/** The metadata of an ODF `meta.xml`, or of a flat file: whatever root holds `office:meta`. */
export function readOdfMeta(parsed: XmlParsed): DocumentMetadata {
  const meta = childElement(parsed.root, ODF_NS.office, 'meta');
  if (!meta) return {};
  const { values, kept } = readFields(
    parsed,
    meta,
    ODF_FIELDS,
    (e) => e.uri === ODF_NS.meta && ODF_FRESH.has(e.local),
  );
  return { ...values, ...(kept.length > 0 ? { kept: { meta: kept } } : {}) };
}

const element = (name: string, text: string | undefined) =>
  text === undefined ? '' : `<${name}>${escapeXmlText(text)}</${name}>`;

/** The children of `office:meta`, written in a fixed order, kept children last (the root binds `rootNs`). */
export function odfMetaChildren(
  metadata: DocumentMetadata,
  statistics: DocumentStatistics,
  generator: string,
  rootNs: Readonly<Record<string, string>>,
): string {
  return [
    element('meta:generator', generator),
    element('dc:title', metadata.title),
    element('dc:subject', metadata.subject),
    element('dc:description', metadata.description),
    element('meta:initial-creator', metadata.author),
    element('dc:creator', metadata.lastModifiedBy),
    element('meta:creation-date', metadata.created),
    element('dc:date', metadata.modified),
    element('dc:language', metadata.language),
    `<meta:document-statistic meta:paragraph-count="${statistics.paragraphs}" meta:word-count="${statistics.words}" meta:character-count="${statistics.characters}"/>`,
    ...(metadata.kept?.meta ?? []).map((k) => keptXmlWithin(k, rootNs)),
  ].join('');
}

const CORE_FIELDS: readonly [Field, string, string][] = [
  ['title', DC, 'title'],
  ['subject', DC, 'subject'],
  ['description', DC, 'description'],
  ['author', DC, 'creator'],
  ['lastModifiedBy', CP, 'lastModifiedBy'],
  ['created', DCTERMS, 'created'],
  ['modified', DCTERMS, 'modified'],
  ['language', DC, 'language'],
];

// The extended properties written fresh on every save (the generator and the statistics); page and line counts need
// a layout, so they are left out rather than written stale.
const APP_FRESH = new Set([
  'Application',
  'Pages',
  'Lines',
  'Words',
  'Characters',
  'CharactersWithSpaces',
  'Paragraphs',
]);

/** The metadata of OOXML's `docProps/core.xml` and `docProps/app.xml`, either of which may be missing. */
export function readOoxmlMetadata(
  core: XmlParsed | undefined,
  app: XmlParsed | undefined,
): DocumentMetadata {
  const read = core
    ? readFields(core, core.root, CORE_FIELDS, () => false)
    : { values: {}, kept: [] };
  const appKept = app
    ? childElements(app.root)
        .filter((e) => !(e.uri === EXTENDED_PROPERTIES_NS && APP_FRESH.has(e.local)))
        .map((e) => keptXmlOf(app, e))
    : [];
  const kept = {
    ...(read.kept.length > 0 ? { meta: read.kept } : {}),
    ...(appKept.length > 0 ? { app: appKept } : {}),
  };
  return { ...read.values, ...(Object.keys(kept).length > 0 ? { kept } : {}) };
}

const CORE_NS = {
  cp: CP,
  dc: DC,
  dcterms: DCTERMS,
  dcmitype: 'http://purl.org/dc/dcmitype/',
  xsi: 'http://www.w3.org/2001/XMLSchema-instance',
};

const declarations = (ns: Readonly<Record<string, string>>) =>
  Object.entries(ns)
    .map(([p, uri]) => ` xmlns:${p}="${uri}"`)
    .join('');

/** OOXML's `docProps/core.xml`. */
export function ooxmlCoreXml(metadata: DocumentMetadata): string {
  const date = (name: string, value: string | undefined) =>
    value === undefined
      ? ''
      : `<${name} xsi:type="dcterms:W3CDTF">${escapeXmlText(value)}</${name}>`;
  const children = [
    element('dc:title', metadata.title),
    element('dc:subject', metadata.subject),
    element('dc:creator', metadata.author),
    element('dc:description', metadata.description),
    element('cp:lastModifiedBy', metadata.lastModifiedBy),
    date('dcterms:created', metadata.created),
    date('dcterms:modified', metadata.modified),
    element('dc:language', metadata.language),
    ...(metadata.kept?.meta ?? []).map((k) => keptXmlWithin(k, CORE_NS)),
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties${declarations(CORE_NS)}>${children}</cp:coreProperties>\n`;
}

const APP_NS = { vt: 'http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes' };

/** OOXML's `docProps/app.xml`: the generator and the statistics, then what was kept. */
export function ooxmlAppXml(
  metadata: DocumentMetadata,
  statistics: DocumentStatistics,
  generator: string,
): string {
  const children = [
    element('Application', generator),
    element('Words', String(statistics.words)),
    element('Characters', String(statistics.characters)),
    element('Paragraphs', String(statistics.paragraphs)),
    ...(metadata.kept?.app ?? []).map((k) =>
      keptXmlWithin(k, { '': EXTENDED_PROPERTIES_NS, ...APP_NS }),
    ),
  ].join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="${EXTENDED_PROPERTIES_NS}"${declarations(APP_NS)}>${children}</Properties>\n`;
}
