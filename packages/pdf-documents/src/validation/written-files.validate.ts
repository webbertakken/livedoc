// Every file LiveDoc writes, through the validators (docs/specs/035-pdf-documents/saving.md "The validators' claim"):
// each file that opens, of the repository's corpus and of the wider one fetched beside it, is baked as an addition (a
// highlight on its first page) and as a rewrite (its first page turned); each written file passes `qpdf --check` wherever the file it came from does, an addition holds
// that file as a prefix, poppler's `pdfsig` says of each earlier signature what it said before, and the pages draw
// pixel for pixel as before outside what changed. Run by
// `pnpm --filter @livedoc/pdf-documents validate:files`, in CI's Office files job. Needs `qpdf` and `pdfsig`: a
// missing tool fails the run, since a check that is skipped proves nothing.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createPdfEngine } from '../engine/index';
import { writePicturePages } from '../engine/picture-pages';
import type { PageBitmap, PagePoint, PdfEngine } from '../engine-contract';
import { PdfLiveChanges } from '../live-changes';
import { Mark, type Quad } from '../mark';
import type { PageName } from '../page-name';
import { PageView } from '../page-view';
import { PdfChange, PdfChangeset } from '../pdf-change';
import { corpusBytes, corpusFiles } from '../testing/corpus';
import { readerWasm, signedPdf } from '../testing/fixtures';
import { fetchPdfCorpus, fetchedBytes, fetchedFiles } from './fetched-corpus';

const OUT = mkdtempSync(join(tmpdir(), 'livedoc-written-pdf-'));
// qpdf's own exit codes: nothing wrong, errors, warnings alone.
const CLEAN = 0;
const ERRORS = 2;

/** A file to write from: one of the repository's corpus, or of the wider one. */
type Source = {
  readonly file: string;
  readonly pages?: number;
  readonly password?: string;
  /** Whether it opens only by being repaired, so it takes no addition. */
  readonly repaired?: boolean;
  /** Whether the reader opens it and the writer does not. */
  readonly unwritable?: boolean;
  readonly bytes: () => Uint8Array<ArrayBuffer>;
};

const sources: readonly Source[] = [
  ...corpusFiles().map((file) => ({ ...file, bytes: () => corpusBytes(file) })),
  ...fetchedFiles().map((file) => ({ ...file, bytes: () => fetchedBytes(file) })),
];

let engine: PdfEngine;

beforeAll(async () => {
  fetchPdfCorpus();
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

// The highlight every addition makes, in page space, and two of its opposite corners.
const HIGHLIGHT_QUAD: Quad = [10, 40, 60, 40, 10, 20, 60, 20];
const HIGHLIGHT_CORNERS = [
  { x: 10, y: 40 },
  { x: 60, y: 20 },
] as const;

const highlightOn = (page: PageName): PdfChange =>
  PdfChange.addMark(
    Mark.highlight({
      id: 'validated',
      page,
      quads: [HIGHLIGHT_QUAD],
      text: '',
      colour: '#fdf1a9',
      opacity: 1,
      author: 'Ada',
      createdAt: Date.UTC(2026, 10, 22),
    })!,
  );

async function opened(file: Source, bytes: Uint8Array<ArrayBuffer>) {
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

// The scale the pages are drawn at to be held against each other: a letter page is some 300 by 400 pixels.
const COMPARE_SCALE = 0.5;

/** How many pixels of a page differ between two drawings of it, outside the highlight where one was made. */
function differingOutside(before: PageBitmap, after: PageBitmap, highlighted: boolean): number {
  expect([after.width, after.height]).toEqual([before.width, before.height]);
  // The matrix places a point at 72 dpi; the drawing is at COMPARE_SCALE of that.
  const [one, other] = HIGHLIGHT_CORNERS.map((corner) => {
    const { x, y } = PageView.toView(before.toView, corner);
    return { x: x * COMPARE_SCALE, y: y * COMPARE_SCALE };
  }) as [PagePoint, PagePoint];
  // A pixel of slack around the highlight: its smoothed edge is the highlight's too.
  const inside = (x: number, y: number): boolean =>
    highlighted &&
    x >= Math.min(one.x, other.x) - 1 &&
    x <= Math.max(one.x, other.x) + 1 &&
    y >= Math.min(one.y, other.y) - 1 &&
    y <= Math.max(one.y, other.y) + 1;
  let differing = 0;
  for (let at = 0; at < before.rgba.length; at += 4) {
    const pixel = at / 4;
    if (inside(pixel % before.width, Math.floor(pixel / before.width))) continue;
    if (
      before.rgba[at] !== after.rgba[at] ||
      before.rgba[at + 1] !== after.rgba[at + 1] ||
      before.rgba[at + 2] !== after.rgba[at + 2]
    )
      differing += 1;
  }
  return differing;
}

const startsWith = (bytes: Uint8Array, prefix: Uint8Array): boolean =>
  bytes.length > prefix.length && prefix.every((byte, at) => bytes[at] === byte);

describe('every written PDF passes the validators', () => {
  // opening.md "Passwords": a file the writer cannot open is read and never written; its bake is refused by name.
  it.each(sources.filter((file) => file.unwritable))(
    '$file is refused by name, and nothing is written',
    async (file) => {
      const pages = await opened(file, file.bytes());
      const doc = PdfLiveChanges.load();
      PdfChangeset.apply(doc, [highlightOn(pages[0]!.name)]);
      expect(await engine.bake(PdfLiveChanges.encode(doc))).toEqual({
        ok: false,
        refusal: 'unreadable',
      });
    },
  );

  describe.each(sources.filter((file) => file.pages && !file.unwritable))('$file', (file) => {
    // Read once the wider corpus is fetched, never while the tests are gathered.
    let stored: Uint8Array<ArrayBuffer>;
    let arrived: string;
    beforeAll(() => {
      stored = file.bytes();
      arrived = onDisk(`arrived-${file.file}`, stored);
    });
    /**
     * "The file is the author's": a flaw the file arrived with is kept, never mended in passing. So a written file
     * is clean wherever the file it came from is, and never holds an error where that one holds none.
     */
    const expectNoWorse = (path: string, { password }: Source): void => {
      const before = qpdfCheck(arrived, password);
      const after = qpdfCheck(path, password);
      if (before === CLEAN) expect(after).toBe(CLEAN);
      else if (before !== ERRORS) expect(after).not.toBe(ERRORS);
    };

    it('written as an addition: valid wherever the file was, the file its prefix, its signatures as they were', async () => {
      const pages = await opened(file, stored);
      const last = pages.length - 1;
      const first = (await engine.drawPage(0, COMPARE_SCALE))!;
      const untouched = (await engine.drawPage(last, COMPARE_SCALE))!;
      const result = await baked([highlightOn(pages[0]!.name)]);
      const path = onDisk(`addition-${file.file}`, result.bytes);
      // A file that opens only by being repaired takes no addition: it is rewritten, then appended to.
      expect(result.kind).toBe(file.repaired ? 'rewrite' : 'addition');
      if (!file.repaired) expect(startsWith(result.bytes, stored)).toBe(true);
      expectNoWorse(path, file);
      if (!file.repaired) expect(signatureVerdicts(path)).toEqual(signatureVerdicts(arrived));
      await opened(file, result.bytes);
      expect((await engine.fileMarks(0)).map((mark) => mark.id)).toContain('validated');
      // It draws the same outside what changed: the first page around its highlight, the last page whole.
      expect(differingOutside(first, (await engine.drawPage(0, COMPARE_SCALE))!, true)).toBe(0);
      if (last > 0)
        expect(
          differingOutside(untouched, (await engine.drawPage(last, COMPARE_SCALE))!, false),
        ).toBe(0);
    });

    it('written as a rewrite: valid, with its first page turned', async () => {
      const pages = await opened(file, stored);
      const turn = pages[0]!.rotation === 90 ? 180 : 90;
      const last = pages.length - 1;
      const untouched = (await engine.drawPage(last, COMPARE_SCALE))!;
      const result = await baked([PdfChange.turnPage(pages[0]!.name, turn)]);
      const path = onDisk(`rewrite-${file.file}`, result.bytes);
      expect(result.kind).toBe('rewrite');
      expectNoWorse(path, file);
      expect((await opened(file, result.bytes))[0]!.rotation).toBe(turn);
      // A file written anew draws a page nobody touched as it drew before.
      if (last > 0)
        expect(
          differingOutside(untouched, (await engine.drawPage(last, COMPARE_SCALE))!, false),
        ).toBe(0);
    });
  });

  // files-print-and-sync.md "One writer": another kind's Download as PDF is a page a picture.
  it('pages of pictures written as a PDF are clean in qpdf', async () => {
    const picture = { width: 2, height: 2, rgb: new Uint8Array(12).fill(200) };
    const result = await writePicturePages([
      { ...picture, pageWidth: 595.5, pageHeight: 842.25 },
      { ...picture, pageWidth: 842.25, pageHeight: 595.5 },
    ]);
    if (!result.ok) throw new Error(result.refusal);
    expect(qpdfCheck(onDisk('pictures.pdf', result.bytes))).toBe(CLEAN);
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
