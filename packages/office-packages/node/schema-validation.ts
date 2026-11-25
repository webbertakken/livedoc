// Every written office file checked against its own format's schema (docs/specs/020-import-export/office-packages.md
// "Validation"): Jing over the OASIS ODF 1.4 RELAX NG schemas and ECMA-376's Transitional and OPC RELAX NG schemas,
// each XML entry first stripped of what conformance leaves out (LiveDoc's and other suites' extensions, the namespaces
// a file declares ignorable). The schemas and Jing are fetched by scripts/fetch-office-schemas.sh, pinned by their
// checksums, into a cache outside the repository. Node only, never shipped; needs Java.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ByteBudget, listZip, parseXml, readOdfPackage, readZipEntry } from '../src/index';
import type { XmlElement } from '../src/xml/xml-tree';

const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const SPREADSHEETML_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const ENTRY_BUDGET_BYTES = 100_000_000;

/** Where the fetched schemas and Jing live: `OFFICE_SCHEMAS_DIR`, else the user's cache. */
export const OFFICE_SCHEMAS_DIR =
  process.env.OFFICE_SCHEMAS_DIR ??
  join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'livedoc/office-schemas');

const FETCH_SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '../scripts/fetch-office-schemas.sh',
);

/** Fetches what is missing of the schemas and Jing into the cache (a no-op when all is there and checks out). */
export function fetchOfficeSchemas(): void {
  execFileSync('bash', [FETCH_SCRIPT], {
    stdio: 'pipe',
    env: { ...process.env, OFFICE_SCHEMAS_DIR },
  });
}

/** Each OOXML part's schema by its name, for the parts LiveDoc writes in either kind of document. */
export const OOXML_SCHEMAS: readonly (readonly [RegExp, string])[] = [
  [/^\[Content_Types\]\.xml$/, 'opc/opc-contentTypes.rnc'],
  [/\.rels$/, 'opc/opc-relationships.rnc'],
  [/^docProps\/core\.xml$/, 'opc/opc-coreProperties.rnc'],
  [/^docProps\/app\.xml$/, 'ooxml/Shared_Extended_File_Properties.rnc'],
  [/^word\/document\.xml$/, 'ooxml/WordprocessingML_Main_Document.rnc'],
  [/^word\/styles\.xml$/, 'ooxml/WordprocessingML_Style_Definitions.rnc'],
  [/^word\/numbering\.xml$/, 'ooxml/WordprocessingML_Numbering_Definitions.rnc'],
  [/^word\/settings\.xml$/, 'ooxml/WordprocessingML_Document_Settings.rnc'],
  [/^word\/header\d+\.xml$/, 'ooxml/WordprocessingML_Header.rnc'],
  [/^word\/footer\d+\.xml$/, 'ooxml/WordprocessingML_Footer.rnc'],
  [/^word\/footnotes\.xml$/, 'ooxml/WordprocessingML_Footnotes.rnc'],
  [/^word\/comments\.xml$/, 'ooxml/WordprocessingML_Comments.rnc'],
  [/^xl\/workbook\.xml$/, 'ooxml/SpreadsheetML_Workbook.rnc'],
  [/^xl\/worksheets\/sheet\d+\.xml$/, 'ooxml/SpreadsheetML_Worksheet.rnc'],
  [/^xl\/styles\.xml$/, 'ooxml/SpreadsheetML_Styles.rnc'],
  [/^xl\/sharedStrings\.xml$/, 'ooxml/SpreadsheetML_Shared_String_Table.rnc'],
  [/^xl\/metadata\.xml$/, 'ooxml/SpreadsheetML_Metadata.rnc'],
  [/^xl\/theme\/theme\d+\.xml$/, 'ooxml/DrawingML_Theme.rnc'],
];

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// SpreadsheetML's text leaves out `xml:space`, which Excel and LibreOffice write, and Excel reads, to keep a text's
// spaces at its edges: the one attribute the check removes that the file means.
const spaceOnSheetText = (e: XmlElement, a: { uri: string; local: string }) =>
  e.uri === SPREADSHEETML_NS && e.local === 't' && a.uri === XML_NS && a.local === 'space';

/**
 * The XML as conformance checks it: without the elements and attributes of the `foreign` namespaces (LiveDoc's own,
 * kept extensions) and of those the root declares ignorable (`mc:Ignorable`).
 */
export function conformantXml(text: string, foreign: ReadonlySet<string> = new Set()): string {
  const parsed = parseXml(text);
  if (!parsed.ok) throw new Error(`does not parse: ${parsed.rejection}`);
  const root = parsed.root;
  const ignorable = new Set(foreign);
  const ignored =
    root.attributes.find((a) => a.uri === MC_NS && a.local === 'Ignorable')?.value ?? '';
  for (const prefix of ignored.split(/\s+/).filter(Boolean)) {
    const uri = root.scope[prefix];
    if (uri) ignorable.add(uri);
  }
  const write = (e: XmlElement): string => {
    if (ignorable.has(e.uri)) return '';
    const name = e.prefix ? `${e.prefix}:${e.local}` : e.local;
    const ns = Object.entries(e.declared)
      .filter(([, uri]) => !ignorable.has(uri))
      .map(([p, uri]) => ` ${p ? `xmlns:${p}` : 'xmlns'}="${escape(uri)}"`);
    const attrs = e.attributes
      .filter((a) => !ignorable.has(a.uri) && a.uri !== MC_NS && !spaceOnSheetText(e, a))
      .map((a) => ` ${a.prefix ? `${a.prefix}:` : ''}${a.local}="${escape(a.value)}"`);
    const children = e.children.map((c) => (typeof c === 'string' ? escape(c) : write(c))).join('');
    return `<${name}${ns.join('')}${attrs.join('')}>${children}</${name}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${write(root)}\n`;
}

// Jing's findings are on its standard output; a failing run names them all.
function jing(schema: string, files: readonly string[], compact: boolean): void {
  try {
    execFileSync(
      'java',
      [
        '-jar',
        join(OFFICE_SCHEMAS_DIR, 'jing.jar'),
        compact ? '-c' : '-i',
        join(OFFICE_SCHEMAS_DIR, schema),
        ...files,
      ],
      { stdio: 'pipe' },
    );
  } catch (error) {
    const out = (error as { stdout?: Buffer }).stdout?.toString() ?? '';
    throw new Error(`${schema} refuses:\n${out || String(error)}`, { cause: error });
  }
}

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** A flat ODF file (`.fods`, `.fodt`) against ODF 1.4, written conformant into `dir` first. */
export function validateFlatOdf(text: string, dir: string, foreign?: ReadonlySet<string>): void {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'flat.xml');
  writeFileSync(path, conformantXml(text, foreign));
  jing('odf-schema.rng', [path], false);
}

/** An ODF package's XML entries against ODF 1.4, its manifest against the manifest schema, unpacked into `dir`. */
export async function validateOdfPackage(
  bytes: Uint8Array,
  dir: string,
  foreign?: ReadonlySet<string>,
): Promise<void> {
  const read = await readOdfPackage(new Uint8Array(bytes));
  if (!read.ok) throw new Error(`does not read: ${read.rejection}`);
  const xml: string[] = [];
  for (const [entry, data] of read.package.entries) {
    if (!entry.endsWith('.xml') || entry.startsWith('META-INF/')) continue;
    const path = join(dir, entry);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, conformantXml(decode(data), foreign));
    xml.push(path);
  }
  jing('odf-schema.rng', xml, false);
  const manifest = join(dir, 'manifest.xml');
  writeFileSync(manifest, read.package.entries.get('META-INF/manifest.xml')!);
  jing('odf-manifest.rng', [manifest], false);
}

/**
 * An OOXML package's XML parts, each against its schema of `OOXML_SCHEMAS` (a part with none fails), unpacked into
 * `dir`. `skip` names parts checked elsewhere or by no schema (kept parts, written back as the file had them).
 */
export async function validateOoxmlPackage(
  bytes: Uint8Array,
  dir: string,
  skip: (part: string) => boolean = () => false,
): Promise<void> {
  const zip = new Uint8Array(bytes);
  const listed = listZip(zip);
  if (!listed.ok) throw new Error(`does not unzip: ${listed.refusal}`);
  for (const entry of listed.entries) {
    if (skip(entry.name) || !/\.(xml|rels)$/.test(entry.name)) continue;
    const schema = OOXML_SCHEMAS.find(([pattern]) => pattern.test(entry.name))?.[1];
    if (!schema) throw new Error(`no schema for ${entry.name}`);
    const read = await readZipEntry(zip, entry, new ByteBudget(ENTRY_BUDGET_BYTES));
    if (!read.ok) throw new Error(`does not inflate: ${entry.name}`);
    const path = join(dir, entry.name.replace(/\[|\]/g, '_'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, conformantXml(decode(read.bytes)));
    jing(schema, [path], true);
  }
}
