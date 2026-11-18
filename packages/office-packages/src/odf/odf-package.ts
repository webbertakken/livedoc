// The ODF package (docs/specs/020-import-export/office-packages.md): reading one under the budgets, refusing what is
// encrypted or damaged, dropping what may run; writing one with `mimetype` first and stored, a manifest listing every
// entry, and the same bytes for the same entries.
import { PACKAGE_BUDGETS, type PackageBudgets } from '../limits';
import { refuse, type PackageRefusal } from '../rejections';
import { escapeXmlAttribute, XML_DECLARATION } from '../xml/xml-write';
import { attributeOf, childElements, parseXml, type XmlElement } from '../xml/xml-tree';
import { readPackageEntries } from '../zip/package-entries';
import { writeZip } from '../zip/zip-writer';
import { ODF_NS } from './odf-namespaces';

export type OdfEntry = { name: string; mediaType: string; data: Uint8Array };

/** A read ODF package: its media type, its entries by name, and what was dropped (scripts, macros, signatures). */
export type OdfPackage = {
  mediaType: string;
  entries: ReadonlyMap<string, Uint8Array>;
  /** Each entry's media type as the manifest lists it (directories included), to write kept entries back. */
  mediaTypes: ReadonlyMap<string, string>;
  dropped: readonly string[];
};

export type OdfPackageRead = { ok: true; package: OdfPackage } | PackageRefusal;

// Entries that may run or that sign bytes LiveDoc rewrites: dropped and reported, never kept (step 8).
const DROPPED = [/^Basic\//, /^Scripts\//, /^META-INF\/documentsignatures\.xml$/, /^Thumbnails\//];

/** Whether the bytes start as an ODF flat file would: an XML declaration or root, after an optional BOM. */
export function looksLikeXml(bytes: Uint8Array): boolean {
  const head = new TextDecoder()
    .decode(bytes.subarray(0, 64))
    .replace(/^\uFEFF/, '')
    .trimStart();
  return head.startsWith('<?xml') || head.startsWith('<');
}

const MANIFEST = 'META-INF/manifest.xml';

/** Read an ODF package's bytes under the package budgets. */
export async function readOdfPackage(
  bytes: Uint8Array<ArrayBuffer>,
  budgets: PackageBudgets = PACKAGE_BUDGETS,
): Promise<OdfPackageRead> {
  const read = await readPackageEntries(bytes, budgets, DROPPED);
  if (!read.ok) return read;
  const { entries, dropped } = read;
  const manifestBytes = entries.get(MANIFEST);
  let manifest: XmlElement | undefined;
  if (manifestBytes) {
    const parsed = parseXml(new TextDecoder().decode(manifestBytes), MANIFEST);
    if (!parsed.ok) return parsed;
    if (manifestEncrypts(parsed.root)) return refuse('package_encrypted', { entry: MANIFEST });
    manifest = parsed.root;
  }
  const mimetype = entries.get('mimetype');
  const mediaType = mimetype
    ? new TextDecoder().decode(mimetype).trim()
    : manifest && rootMediaType(manifest);
  if (!mediaType) return refuse('package_damaged', { entry: 'mimetype' });
  return {
    ok: true,
    package: { mediaType, entries, mediaTypes: manifestMediaTypes(manifest), dropped },
  };
}

function manifestEncrypts(root: XmlElement): boolean {
  return childElements(root).some((fileEntry) =>
    childElements(fileEntry).some(
      (c) => c.uri === ODF_NS.manifest && c.local === 'encryption-data',
    ),
  );
}

function manifestMediaTypes(manifest: XmlElement | undefined): Map<string, string> {
  const types = new Map<string, string>();
  for (const entry of manifest ? childElements(manifest) : []) {
    const path = attributeOf(entry, ODF_NS.manifest, 'full-path');
    const type = attributeOf(entry, ODF_NS.manifest, 'media-type');
    if (path && path !== '/' && type !== undefined) types.set(path, type);
  }
  return types;
}

function rootMediaType(manifest: XmlElement): string | undefined {
  const root = childElements(manifest).find(
    (e) => attributeOf(e, ODF_NS.manifest, 'full-path') === '/',
  );
  return root ? attributeOf(root, ODF_NS.manifest, 'media-type') : undefined;
}

/** The zip date every written package carries, so the same document gives the same bytes. */
export const PACKAGE_DATE = new Date(1980, 0, 1, 0, 0, 0);

/** The manifest listing the package root and every entry, in the order given. */
export function odfManifest(mediaType: string, entries: readonly OdfEntry[]): string {
  const line = (path: string, type: string) =>
    ` <manifest:file-entry manifest:full-path="${escapeXmlAttribute(path)}" manifest:media-type="${escapeXmlAttribute(type)}"/>`;
  return [
    XML_DECLARATION,
    `<manifest:manifest xmlns:manifest="${ODF_NS.manifest}" manifest:version="1.4">`,
    line('/', mediaType),
    ...entries.map((e) => line(e.name, e.mediaType)),
    '</manifest:manifest>',
    '',
  ].join('\n');
}

/** An ODF package: `mimetype` first and stored, the manifest, then the entries in the order given. */
export function writeOdfPackage(
  mediaType: string,
  entries: readonly OdfEntry[],
): Uint8Array<ArrayBuffer> {
  const encode = (text: string) => new TextEncoder().encode(text);
  return writeZip(
    [
      { name: 'mimetype', data: encode(mediaType) },
      { name: MANIFEST, data: encode(odfManifest(mediaType, entries)) },
      ...entries.map((e) => ({ name: e.name, data: e.data })),
    ],
    PACKAGE_DATE,
  );
}
