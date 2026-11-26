// Every file LiveDoc writes, validated against its own format's schema (docs/specs/020-import-export/office-packages.md
// "Validation"): one file per construct group in each format, each XML entry checked by Jing after LiveDoc's own
// extension and the namespaces a file declares ignorable are removed; then LibreOffice opens each and saves it again,
// and its file reads back with the same paragraphs. Run by `pnpm --filter @livedoc/text-documents validate:files`,
// in CI's Office files job. Needs Java and LibreOffice (`soffice`); the schema check is
// `@livedoc/office-packages/validation`'s.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readOoxmlPackage } from '@livedoc/office-packages';
import {
  fetchOfficeSchemas,
  validateFlatOdf,
  validateOdfPackage,
  validateOoxmlPackage,
} from '@livedoc/office-packages/validation';
import { readTextDocumentFile, writeTextDocumentFile } from '../files';
import { TextDocument } from '../model/text-document';
import { CONSTRUCTS } from '../testing/constructs';
import { Blocks } from '../model/tables';
import { LIVEDOC_NS, NS } from '../odf/odf-names';

const OUT = mkdtempSync(join(tmpdir(), 'livedoc-written-'));
// LiveDoc's own namespace, and LibreOffice's extension a decorative picture is marked in (objects.md "In the formats").
const FOREIGN = new Set([LIVEDOC_NS, NS.loext]);
fetchOfficeSchemas();

/** Each written file, its paragraphs' texts and its threads' comments' texts. */
const written: { file: string; texts: string[]; threads: string[][]; suggestions: string[] }[] = [];

/** Each paragraph's suggestion kinds in reading order, as text: a break or join, a paragraph format, then its inlines'. */
const suggestionKindsOf = (document: TextDocument) =>
  Blocks.paragraphs(document.body).flatMap((p) => [
    ...Object.keys(p.suggested ?? {}).sort(),
    ...p.inlines.flatMap((i) =>
      i.type === 'comment' ? [] : Object.keys(i.suggested ?? {}).sort(),
    ),
  ]);
const threadsOf = (document: TextDocument) =>
  (document.comments ?? []).map((t) => t.comments.map((c) => c.text));

describe('every written file validates against its format’s schema', () => {
  for (const [name, build] of Object.entries(CONSTRUCTS)) {
    it(`${name}.odt and ${name}.fodt against ODF 1.4`, async () => {
      const document = build('odf');
      for (const type of ['odt', 'fodt'] as const) {
        const bytes = (writeTextDocumentFile(document, type) as { bytes: Uint8Array }).bytes;
        const file = join(OUT, `${name}.${type}`);
        writeFileSync(file, bytes);
        written.push({
          file,
          texts: TextDocument.paragraphTexts(document),
          threads: threadsOf(document),
          suggestions: suggestionKindsOf(document),
        });
        if (type === 'fodt')
          validateFlatOdf(new TextDecoder().decode(bytes), join(OUT, `${name}-fodt`), FOREIGN);
        else await validateOdfPackage(new Uint8Array(bytes), join(OUT, `${name}-odt`), FOREIGN);
      }
    });

    it(`${name}.docx against ISO/IEC 29500 Transitional`, async () => {
      const document = build('ooxml');
      const bytes = (writeTextDocumentFile(document, 'docx') as { bytes: Uint8Array }).bytes;
      const file = join(OUT, `${name}.docx`);
      writeFileSync(file, bytes);
      written.push({
        file,
        texts: TextDocument.paragraphTexts(document),
        threads: threadsOf(document),
        suggestions: suggestionKindsOf(document),
      });
      expect((await readOoxmlPackage(new Uint8Array(bytes))).ok).toBe(true);
      // Word's comments extension (MS-DOCX) has no ISO/IEC 29500 schema; comments.xml itself is checked.
      await validateOoxmlPackage(
        new Uint8Array(bytes),
        join(OUT, `${name}-docx`),
        (part) => part === 'word/commentsExtended.xml',
      );
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
      // review.md "How a comment is kept": its comment threads, replies included, come back as they were.
      if (read.ok) expect(threadsOf(read.document), out).toEqual(w.threads);
      // review.md "In the files": tracked changes come back as suggestions of the same kinds.
      if (read.ok) expect(suggestionKindsOf(read.document), out).toEqual(w.suggestions);
    }
  }, 400_000);
});
