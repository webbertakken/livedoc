// The OOXML container (docs/specs/020-import-export/office-packages.md): an Open Packaging Conventions zip read under
// the budgets, its content types and relationships resolved, what may run dropped with the relationships naming it,
// external relationships kept and never followed; written with `[Content_Types].xml` first and the same bytes for the
// same parts.
import { PACKAGE_BUDGETS, type PackageBudgets } from '../limits';
import { refuse, type PackageRefusal } from '../rejections';
import { escapeXmlAttribute, XML_DECLARATION } from '../xml/xml-write';
import { attributeOf, childElements, parseXml } from '../xml/xml-tree';
import { readPackageEntries } from '../zip/package-entries';
import { writeZip } from '../zip/zip-writer';
import { PACKAGE_DATE } from '../odf/odf-package';
import {
  OOXML_CONTENT_TYPES,
  OPC_NS,
  RELATIONSHIP_TYPES,
  transitionalType,
} from './ooxml-namespaces';
import { oleKind } from './ole';

export type Relationship = {
  readonly id: string;
  readonly type: string;
  readonly target: string;
  readonly external?: boolean;
};

/** Relationships by the part that holds them; the package's own under `''`. */
export type Relationships = ReadonlyMap<string, readonly Relationship[]>;

export type OoxmlPackage = {
  /** The main part's content type: the document's media type. */
  mediaType: string;
  /** The main part's name, without a leading `/`. */
  mainPart: string;
  /** Every part but the content types and relationship parts, by name. */
  parts: ReadonlyMap<string, Uint8Array>;
  contentTypes: ReadonlyMap<string, string>;
  /** The content types' defaults by extension, to write kept parts back. */
  defaults: ReadonlyMap<string, string>;
  relationships: Relationships;
  dropped: readonly string[];
  /** External relationships: kept, never followed, reported. */
  external: readonly Relationship[];
};

export type OoxmlPackageRead = { ok: true; package: OoxmlPackage } | PackageRefusal;

// Parts that may run, sign bytes LiveDoc rewrites, or stand for OLE binaries: dropped and reported (step 8).
const DROPPED = [
  /(^|\/)vbaProject\.bin$/,
  /(^|\/)vbaData\.xml$/,
  /(^|\/)activeX\//,
  /^_xmlsignatures\//,
  /^docProps\/thumbnail\.[a-z]+$/,
  /(^|\/)embeddings\/oleObject[^/]*\.bin$/,
  /(^|\/)_rels\/vbaProject\.bin\.rels$/,
];

const DROPPED_TYPES = new Set<string>([
  RELATIONSHIP_TYPES.vbaProject,
  RELATIONSHIP_TYPES.thumbnail,
  RELATIONSHIP_TYPES.signatureOrigin,
  RELATIONSHIP_TYPES.control,
]);

const CONTENT_TYPES = '[Content_Types].xml';

/** The part a relationship target names, resolved against its source part's folder; undefined when it escapes. */
export function resolvePartName(source: string, target: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(target.split('#')[0]!);
  } catch {
    return undefined;
  }
  const base = decoded.startsWith('/') ? [] : source.split('/').slice(0, -1);
  const parts = [...base];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return undefined;
      parts.pop();
    } else parts.push(segment);
  }
  return parts.length > 0 ? parts.join('/') : undefined;
}

/** The relationship part of a part: `word/_rels/document.xml.rels` for `word/document.xml`, `_rels/.rels` for `''`. */
export function relationshipPartOf(source: string): string {
  const slash = source.lastIndexOf('/');
  return `${source.slice(0, slash + 1)}_rels/${source.slice(slash + 1)}.rels`;
}

function sourceOfRelationshipPart(name: string): string | undefined {
  const match = name.match(/^(.*?)_rels\/([^/]*)\.rels$/);
  return match ? match[1]! + match[2]! : undefined;
}

function readRelationships(
  name: string,
  bytes: Uint8Array,
): { ok: true; relationships: Relationship[] } | PackageRefusal {
  const parsed = parseXml(new TextDecoder().decode(bytes), name);
  if (!parsed.ok) return parsed;
  const relationships = childElements(parsed.root)
    .filter((e) => e.uri === OPC_NS.relationships && e.local === 'Relationship')
    .map((e) => {
      const external = attributeOf(e, '', 'TargetMode') === 'External';
      return {
        id: attributeOf(e, '', 'Id') ?? '',
        type: transitionalType(attributeOf(e, '', 'Type') ?? ''),
        target: attributeOf(e, '', 'Target') ?? '',
        ...(external ? { external } : {}),
      };
    });
  return { ok: true, relationships };
}

/** Read an OOXML container's bytes under the package budgets. */
export async function readOoxmlPackage(
  bytes: Uint8Array<ArrayBuffer>,
  budgets: PackageBudgets = PACKAGE_BUDGETS,
): Promise<OoxmlPackageRead> {
  const ole = oleKind(bytes);
  if (ole) return refuse(ole === 'encrypted' ? 'package_encrypted' : 'package_wrong_type');
  const read = await readPackageEntries(bytes, budgets, DROPPED);
  if (!read.ok) return read;
  const { entries, dropped } = read;
  const typesBytes = entries.get(CONTENT_TYPES);
  if (!typesBytes) return refuse('package_damaged', { entry: CONTENT_TYPES });
  const typesXml = parseXml(new TextDecoder().decode(typesBytes), CONTENT_TYPES);
  if (!typesXml.ok) return typesXml;
  const defaults = new Map<string, string>();
  const overrides = new Map<string, string>();
  for (const e of childElements(typesXml.root)) {
    const type = attributeOf(e, '', 'ContentType');
    if (type === undefined) continue;
    if (e.local === 'Default')
      defaults.set((attributeOf(e, '', 'Extension') ?? '').toLowerCase(), type);
    if (e.local === 'Override')
      overrides.set((attributeOf(e, '', 'PartName') ?? '').replace(/^\//, ''), type);
  }
  const relationships = new Map<string, Relationship[]>();
  const parts = new Map<string, Uint8Array>();
  const external: Relationship[] = [];
  for (const [name, data] of entries) {
    if (name === CONTENT_TYPES) continue;
    const source = sourceOfRelationshipPart(name);
    if (source === undefined) {
      parts.set(name, data);
      continue;
    }
    const rels = readRelationships(name, data);
    if (!rels.ok) return rels;
    const kept: Relationship[] = [];
    for (const rel of rels.relationships) {
      if (rel.external) {
        external.push(rel);
        kept.push(rel);
        continue;
      }
      const target = resolvePartName(source, rel.target);
      if (target === undefined) return refuse('package_damaged', { entry: name });
      if (DROPPED_TYPES.has(rel.type) || dropped.includes(target)) continue;
      kept.push(rel);
    }
    relationships.set(source, kept);
  }
  const main = (relationships.get('') ?? []).find(
    (r) => r.type === RELATIONSHIP_TYPES.officeDocument,
  );
  const mainPart = main && resolvePartName('', main.target);
  if (!mainPart || !parts.has(mainPart)) return refuse('package_damaged', { entry: '_rels/.rels' });
  const contentTypes = new Map<string, string>();
  for (const name of parts.keys()) {
    const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    contentTypes.set(
      name,
      overrides.get(name) ?? defaults.get(extension) ?? 'application/octet-stream',
    );
  }
  return {
    ok: true,
    package: {
      mediaType: contentTypes.get(mainPart)!,
      mainPart,
      parts,
      contentTypes,
      defaults,
      relationships,
      dropped,
      external,
    },
  };
}

export type OoxmlPart = { name: string; contentType: string; data: Uint8Array };

function contentTypesXml(
  parts: readonly OoxmlPart[],
  extraDefaults: ReadonlyMap<string, string>,
): string {
  const defaults = new Map<string, string>([
    ['rels', OOXML_CONTENT_TYPES.relationships],
    ['xml', OOXML_CONTENT_TYPES.xml],
    ...extraDefaults,
  ]);
  const lines = [...defaults].map(
    ([ext, type]) =>
      `<Default Extension="${escapeXmlAttribute(ext)}" ContentType="${escapeXmlAttribute(type)}"/>`,
  );
  for (const part of parts) {
    const ext = part.name.slice(part.name.lastIndexOf('.') + 1).toLowerCase();
    if (defaults.get(ext) === part.contentType) continue;
    lines.push(
      `<Override PartName="/${escapeXmlAttribute(part.name)}" ContentType="${escapeXmlAttribute(part.contentType)}"/>`,
    );
  }
  return `${XML_DECLARATION}\n<Types xmlns="${OPC_NS.contentTypes}">${lines.join('')}</Types>\n`;
}

/** A relationship part's XML, attributes in a fixed order. */
export function relationshipsXml(relationships: readonly Relationship[]): string {
  const lines = relationships.map(
    (r) =>
      `<Relationship Id="${escapeXmlAttribute(r.id)}" Type="${escapeXmlAttribute(r.type)}" Target="${escapeXmlAttribute(r.target)}"${r.external ? ' TargetMode="External"' : ''}/>`,
  );
  return `${XML_DECLARATION}\n<Relationships xmlns="${OPC_NS.relationships}">${lines.join('')}</Relationships>\n`;
}

/**
 * An OOXML container: `[Content_Types].xml`, `_rels/.rels`, then each part in the order given, followed by its own
 * relationships when it has any. Content types default for `rels`, `xml` and the extensions given.
 */
export function writeOoxmlPackage(
  parts: readonly OoxmlPart[],
  relationships: Relationships,
  defaults: ReadonlyMap<string, string> = new Map(),
): Uint8Array<ArrayBuffer> {
  const encode = (text: string) => new TextEncoder().encode(text);
  const files: { name: string; data: Uint8Array }[] = [
    { name: CONTENT_TYPES, data: encode(contentTypesXml(parts, defaults)) },
    { name: '_rels/.rels', data: encode(relationshipsXml(relationships.get('') ?? [])) },
  ];
  for (const part of parts) {
    files.push({ name: part.name, data: part.data });
    const rels = relationships.get(part.name);
    if (rels && rels.length > 0)
      files.push({ name: relationshipPartOf(part.name), data: encode(relationshipsXml(rels)) });
  }
  return writeZip(files, PACKAGE_DATE);
}
