// Every file LiveDoc writes, through the validators (docs/specs/035-pdf-documents/saving.md "The validators' claim"):
// each file of the corpus that opens is baked as an addition (a highlight on its first page) and as a rewrite (its
// first page turned); each written file passes `qpdf --check` wherever the file it came from does, an addition holds
// that file as a prefix, and poppler's `pdfsig` says of each earlier signature what it said before. Run by
// `pnpm --filter @livedoc/pdf-documents validate:files`, in CI's Office files job. Needs `qpdf` and `pdfsig`: a
// missing tool fails the run, since a check that is skipped proves nothing.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPdfEngine } from '../engine/index';
import type { PdfEngine } from '../engine-contract';
import { PdfLiveChanges } from '../live-changes';
import { Mark } from '../mark';
import type { PageName } from '../page-name';
import { PdfChange, PdfChangeset } from '../pdf-change';
import { corpusBytes, corpusFiles, type CorpusFile } from '../testing/corpus';
import { readerWasm, signedPdf } from '../testing/fixtures';

const OUT = mkdtempSync(join(tmpdir(), 'livedoc-written-pdf-'));
// qpdf's own exit codes: nothing wrong, errors, warnings alone.
const CLEAN = 0;
const ERRORS = 2;

let engine: PdfEngine;

beforeAll(async () => {
  // Asked first, so a machine without the tools fails here by name.
  execFileSync('qpdf', ['--version'], { stdio: 'ignore' });
  execFileSync('pdfsig', ['-v'], { stdio: 'ignore' });
  engine = await createPdfEngine({ wasm: readerWasm() });
});

function onDisk(name: string, bytes: Uint8Array): string {
  const path = join(OUT, name.replaceAll('/', '__'));
  writeFileSync(path, bytes);
  return path;
}

const qpdfCheck = (path: string, password?: string): number =>
  spawnSync('qpdf', [...(password ? [`--password=${password}`] : []), '--check', path], {
    encoding: 'utf8',
  }).status ?? ERRORS;

/** What pdfsig says of each signature's validity, in order; none for a file with no signature. */
const signatureVerdicts = (path: string): string[] =>
  (spawnSync('pdfsig', ['-nocert', path], { encoding: 'utf8' }).stdout ?? '')
    .split('\n')
    .filter((line) => line.includes('Signature Validation:'))
    .map((line) => line.trim());

const highlightOn = (page: PageName): PdfChange =>
  PdfChange.addMark(
    Mark.highlight({
      id: 'validated',
      page,
      quads: [[10, 40, 60, 40, 10, 20, 60, 20]],
      text: '',
      colour: '#fdf1a9',
      opacity: 1,
      author: 'Ada',
      createdAt: Date.UTC(2026, 10, 22),
    })!,
  );

async function opened(file: CorpusFile, bytes: Uint8Array<ArrayBuffer>) {
  const first = await engine.open(bytes);
  const result = file.password ? await engine.unlock(file.password) : first;
  if (!result.ok) throw new Error(`${file.file} did not open`);
  return result.pages;
}

async function baked(changes: readonly PdfChange[]) {
  const doc = PdfLiveChanges.load();
  PdfChangeset.apply(doc, changes);
  const result = await engine.bake(PdfLiveChanges.encode(doc));
  if (!result.ok) throw new Error(result.refusal);
  return result;
}

const startsWith = (bytes: Uint8Array, prefix: Uint8Array): boolean =>
  bytes.length > prefix.length && prefix.every((byte, at) => bytes[at] === byte);

describe('every written PDF passes the validators', () => {
  // opening.md "Passwords": a file the writer cannot open is read and never written; its bake is refused by name.
  it.each(corpusFiles().filter((file) => file.unwritable))(
    '$file is refused by name, and nothing is written',
    async (file) => {
      const pages = await opened(file, corpusBytes(file));
      const doc = PdfLiveChanges.load();
      PdfChangeset.apply(doc, [highlightOn(pages[0]!.name)]);
      expect(await engine.bake(PdfLiveChanges.encode(doc))).toEqual({
        ok: false,
        refusal: 'unreadable',
      });
    },
  );

  describe.each(corpusFiles().filter((file) => file.pages && !file.unwritable))('$file', (file) => {
    const stored = corpusBytes(file);
    const arrived = onDisk(`arrived-${file.file}`, stored);
    /**
     * "The file is the author's": a flaw the file arrived with is kept, never mended in passing. So a written file
     * is clean wherever the file it came from is, and never holds an error where that one holds none.
     */
    const expectNoWorse = (path: string, { password }: CorpusFile): void => {
      const before = qpdfCheck(arrived, password);
      const after = qpdfCheck(path, password);
      if (before === CLEAN) expect(after).toBe(CLEAN);
      else if (before !== ERRORS) expect(after).not.toBe(ERRORS);
    };

    it('written as an addition: valid wherever the file was, the file its prefix, its signatures as they were', async () => {
      const pages = await opened(file, stored);
      const result = await baked([highlightOn(pages[0]!.name)]);
      const path = onDisk(`addition-${file.file}`, result.bytes);
      // A file that opens only by being repaired takes no addition: it is rewritten, then appended to.
      expect(result.kind).toBe(file.repaired ? 'rewrite' : 'addition');
      if (!file.repaired) expect(startsWith(result.bytes, stored)).toBe(true);
      expectNoWorse(path, file);
      if (!file.repaired) expect(signatureVerdicts(path)).toEqual(signatureVerdicts(arrived));
      await opened(file, result.bytes);
      expect((await engine.fileMarks(0)).map((mark) => mark.id)).toContain('validated');
    });

    it('written as a rewrite: valid, with its first page turned', async () => {
      const pages = await opened(file, stored);
      const turn = pages[0]!.rotation === 90 ? 180 : 90;
      const result = await baked([PdfChange.turnPage(pages[0]!.name, turn)]);
      const path = onDisk(`rewrite-${file.file}`, result.bytes);
      expect(result.kind).toBe('rewrite');
      expectNoWorse(path, file);
      expect((await opened(file, result.bytes))[0]!.rotation).toBe(turn);
    });
  });

  it('an addition to a file signed here leaves pdfsig reading its signature as valid', async () => {
    const signed = await signedPdf();
    const first = await engine.open(signed);
    if (!first.ok) throw new Error('the signed fixture did not open');
    const result = await baked([highlightOn(first.pages[0]!.name)]);
    expect(result.kind).toBe('addition');
    const verdicts = signatureVerdicts(onDisk('addition-signed.pdf', result.bytes));
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toContain('Signature is Valid');
  });
});
