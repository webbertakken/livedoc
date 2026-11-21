// An ODF text document's file (standard-mapping.md, office-packages.md): a package (`.odt`, `.ott`) or a flat file
// (`.fodt`) read into its parts under the package's guards, then into the model.
import {
  attributeOf,
  looksLikeXml,
  ODF_MEDIA_TYPES,
  parseXml,
  readOdfPackage,
  refuse,
  type PackageBudgets,
  type PackageRefusal,
  type XmlParsed,
} from '@livedoc/office-packages';
import type { TextDocument } from '../model/text-document';
import type { ReportBuilder } from '../report';
import { NS } from './odf-names';
import { readOdfParts } from './odf-read';

// A text document, its template, or a web page LibreOffice saved as one: all read as a text document.
const TEXT_TYPES: readonly string[] = [
  ODF_MEDIA_TYPES.text,
  ODF_MEDIA_TYPES.textTemplate,
  'application/vnd.oasis.opendocument.text-web',
];

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

export type OdfFileRead = { ok: true; document: TextDocument; flat: boolean } | PackageRefusal;

/** Reads an ODF text document from a package or a flat file. */
export async function readOdfFile(
  bytes: Uint8Array<ArrayBuffer>,
  report: ReportBuilder,
  budgets?: PackageBudgets,
): Promise<OdfFileRead> {
  if (looksLikeXml(bytes)) {
    if (budgets && bytes.byteLength > budgets.bytes) return refuse('package_too_large');
    const parsed = parseXml(decode(bytes));
    if (!parsed.ok) return parsed;
    if (parsed.root.uri !== NS.office || parsed.root.local !== 'document')
      return refuse('package_damaged');
    if (!TEXT_TYPES.includes(attributeOf(parsed.root, NS.office, 'mimetype') ?? ''))
      return refuse('package_wrong_type');
    const document = readOdfParts(
      { content: parsed, styles: parsed, meta: parsed, settings: parsed, entries: [] },
      report,
    );
    return { ok: true, document, flat: true };
  }
  const read = await readOdfPackage(bytes, budgets);
  if (!read.ok) return read;
  const { mediaType, entries, mediaTypes, dropped } = read.package;
  if (!TEXT_TYPES.includes(mediaType)) return refuse('package_wrong_type');
  for (const name of dropped) report.drop(dropReason(name), name);
  const part = (name: string): XmlParsed | PackageRefusal | undefined => {
    const data = entries.get(name);
    return data === undefined ? undefined : parseXml(decode(data), name);
  };
  const content = part('content.xml');
  if (!content) return refuse('package_damaged', { entry: 'content.xml' });
  const parts = [content, part('styles.xml'), part('meta.xml'), part('settings.xml')];
  const refused = parts.find((p): p is PackageRefusal => p !== undefined && !p.ok);
  if (refused) return refused;
  const [c, styles, meta, settings] = parts as (XmlParsed | undefined)[];
  if (c!.root.uri !== NS.office || c!.root.local !== 'document-content')
    return refuse('package_damaged', { entry: 'content.xml' });
  const written = new Set([
    'content.xml',
    'styles.xml',
    'meta.xml',
    'settings.xml',
    'mimetype',
    'META-INF/manifest.xml',
  ]);
  const kept = [...entries]
    .filter(([name]) => !written.has(name))
    .map(([name, data]) => ({ name, data, mediaType: mediaTypes.get(name) ?? '' }))
    // By name, as they are written back: a package read again holds them in the same order.
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const document = readOdfParts(
    {
      content: c!,
      ...(styles ? { styles } : {}),
      ...(meta ? { meta } : {}),
      ...(settings ? { settings } : {}),
      entries: kept,
    },
    report,
  );
  return { ok: true, document, flat: false };
}

function dropReason(name: string) {
  if (/documentsignatures/.test(name)) return 'signature' as const;
  if (/^Thumbnails\//.test(name)) return 'thumbnail' as const;
  return 'macro' as const;
}
