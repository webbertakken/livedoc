// Every file LiveDoc writes, validated against its own format's schema (docs/specs/020-import-export/office-packages.md
// "Validation"): one file per construct group in each format, each XML entry checked by Jing after LiveDoc's own
// extension and the namespaces a file declares ignorable are removed; then LibreOffice opens each and saves it again,
// and its file reads back with the same paragraphs. Run by `pnpm --filter @livedoc/text-documents validate:files`,
// in CI's Office files job. Needs Java and LibreOffice (`soffice`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseXml,
  readOdfPackage,
  readOoxmlPackage,
  type XmlElement,
} from '@livedoc/office-packages';
import { readTextDocumentFile, writeTextDocumentFile } from '../files';
import { TextDocument } from '../model/text-document';
import { CONSTRUCTS } from '../testing/constructs';
import { LIVEDOC_NS } from '../odf/odf-names';
import { MC_NS } from '../ooxml/ooxml-names';

const CACHE =
  process.env.OFFICE_SCHEMAS_DIR ??
  join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'livedoc/office-schemas');
const OUT = mkdtempSync(join(tmpdir(), 'livedoc-written-'));

const OOXML_SCHEMAS: [RegExp, string][] = [
  [/^\[Content_Types\]\.xml$/, 'opc/opc-contentTypes.rnc'],
  [/\.rels$/, 'opc/opc-relationships.rnc'],
  [/^docProps\/core\.xml$/, 'opc/opc-coreProperties.rnc'],
  [/^docProps\/app\.xml$/, 'ooxml/Shared_Extended_File_Properties.rnc'],
  [/^word\/document\.xml$/, 'ooxml/WordprocessingML_Main_Document.rnc'],
  [/^word\/styles\.xml$/, 'ooxml/WordprocessingML_Style_Definitions.rnc'],
  [/^word\/numbering\.xml$/, 'ooxml/WordprocessingML_Numbering_Definitions.rnc'],
  [/^word\/settings\.xml$/, 'ooxml/WordprocessingML_Document_Settings.rnc'],
];

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The XML without LiveDoc's extension and the namespaces it declares ignorable, as conformance says to check it. */
function conformant(text: string): string {
  const parsed = parseXml(text);
  if (!parsed.ok) throw new Error(`does not parse: ${parsed.rejection}`);
  const ignorable = new Set([LIVEDOC_NS]);
  const root = parsed.root;
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
      .filter((a) => !ignorable.has(a.uri) && a.uri !== MC_NS)
      .map((a) => ` ${a.prefix ? `${a.prefix}:` : ''}${a.local}="${escape(a.value)}"`);
    const children = e.children.map((c) => (typeof c === 'string' ? escape(c) : write(c))).join('');
    return `<${name}${ns.join('')}${attrs.join('')}>${children}</${name}>`;
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n${write(root)}\n`;
}

function jing(schema: string, files: string[], compact: boolean): void {
  execFileSync(
    'java',
    ['-jar', join(CACHE, 'jing.jar'), compact ? '-c' : '-i', join(CACHE, schema), ...files],
    { stdio: 'pipe' },
  );
}

const written: { file: string; texts: string[] }[] = [];

describe('every written file validates against its format’s schema', () => {
  for (const [name, build] of Object.entries(CONSTRUCTS)) {
    it(`${name}.odt and ${name}.fodt against ODF 1.4`, async () => {
      const document = build('odf');
      for (const type of ['odt', 'fodt'] as const) {
        const bytes = (writeTextDocumentFile(document, type) as { bytes: Uint8Array }).bytes;
        const file = join(OUT, `${name}.${type}`);
        writeFileSync(file, bytes);
        written.push({ file, texts: TextDocument.paragraphTexts(document) });
        if (type === 'fodt') {
          writeFileSync(`${file}.xml`, conformant(new TextDecoder().decode(bytes)));
          jing('odf-schema.rng', [`${file}.xml`], false);
          continue;
        }
        const read = await readOdfPackage(new Uint8Array(bytes));
        if (!read.ok) throw new Error(read.rejection);
        const dir = join(OUT, `${name}-odt`);
        const xml: string[] = [];
        for (const [entry, data] of read.package.entries) {
          if (!entry.endsWith('.xml') || entry.startsWith('META-INF/')) continue;
          const path = join(dir, entry);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, conformant(new TextDecoder().decode(data)));
          xml.push(path);
        }
        jing('odf-schema.rng', xml, false);
        const manifest = join(dir, 'manifest.xml');
        writeFileSync(manifest, read.package.entries.get('META-INF/manifest.xml')!);
        jing('odf-manifest.rng', [manifest], false);
      }
    });

    it(`${name}.docx against ISO/IEC 29500 Transitional`, async () => {
      const document = build('ooxml');
      const bytes = (writeTextDocumentFile(document, 'docx') as { bytes: Uint8Array }).bytes;
      const file = join(OUT, `${name}.docx`);
      writeFileSync(file, bytes);
      written.push({ file, texts: TextDocument.paragraphTexts(document) });
      const { listZip, readZipEntry, ByteBudget } = await import('@livedoc/office-packages');
      const zip = new Uint8Array(bytes);
      const listed = listZip(zip);
      if (!listed.ok) throw new Error('zip');
      expect((await readOoxmlPackage(zip)).ok).toBe(true);
      for (const entry of listed.entries) {
        const schema = OOXML_SCHEMAS.find(([pattern]) => pattern.test(entry.name))?.[1];
        expect(schema, `a schema for ${entry.name}`).toBeDefined();
        const read = await readZipEntry(zip, entry, new ByteBudget(1e8));
        if (!read.ok) throw new Error(entry.name);
        const path = join(OUT, `${name}-docx`, entry.name.replace(/\[|\]/g, '_'));
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, conformant(new TextDecoder().decode(read.bytes)));
        jing(schema!, [path], true);
      }
    });
  }

  // standard-mapping.md "The rule": another suite opens what LiveDoc writes as it is here.
  it('opens in LibreOffice, which saves each again with the same paragraphs', async () => {
    const saved = join(OUT, 'libreoffice');
    const odf = written.filter((w) => !w.file.endsWith('.docx'));
    const docx = written.filter((w) => w.file.endsWith('.docx'));
    const convert = (target: string, files: string[]) =>
      execFileSync(
        'soffice',
        ['--headless', '--norestore', '--convert-to', target, '--outdir', saved, ...files],
        { stdio: 'pipe', timeout: 300_000 },
      );
    convert(
      'odt',
      odf.filter((w) => w.file.endsWith('.fodt')).map((w) => w.file),
    );
    convert(
      'docx:MS Word 2007 XML',
      docx.map((w) => w.file),
    );
    for (const w of [...odf.filter((x) => x.file.endsWith('.fodt')), ...docx]) {
      const base = w.file
        .split('/')
        .pop()!
        .replace(/\.(fodt|docx)$/, '');
      const out = join(saved, `${base}.${w.file.endsWith('.docx') ? 'docx' : 'odt'}`);
      const read = await readTextDocumentFile(readFileSync(out));
      expect(read.ok, out).toBe(true);
      // Word files carry a section's properties on a paragraph, so LibreOffice adds empty ones where sections end.
      const texts = (texts: string[]) => (out.endsWith('.docx') ? texts.filter(Boolean) : texts);
      if (read.ok)
        expect(texts(TextDocument.paragraphTexts(read.document)), out).toEqual(texts(w.texts));
    }
  }, 400_000);
});
