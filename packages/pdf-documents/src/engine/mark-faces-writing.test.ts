import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDF, type PdfDict, type PdfRef, type PdfStream } from '@libpdf/core';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PdfEngine } from '../engine-contract';
import { PdfLiveChanges } from '../live-changes';
import { Mark } from '../mark';
import type { PageName } from '../page-name';
import { PdfChange, PdfChangeset } from '../pdf-change';
import { StampLayout } from '../stamp-layout';
import { markFaceFiles, readerWasm, textPdf } from '../testing/fixtures';
import { createPdfEngine } from './index';
import type { MarkFaceSource } from './typesetter';

let stored: Uint8Array<ArrayBuffer>;
beforeAll(async () => {
  stored = await textPdf(1);
});

const red = '#d93025';
const text = (page: PageName, words: string, id = 'a-text') =>
  Mark.text({
    id,
    page,
    words,
    size: 24,
    colour: red,
    opacity: 1,
    author: 'Ada',
    createdAt: 0,
    rect: [72, 400, 540, 500],
  })!;

/** An engine reading the faces from `faces`, its log kept; the fixture open, its first page's name. */
async function engineWith(faces?: MarkFaceSource) {
  const logs: string[] = [];
  const engine: PdfEngine = await createPdfEngine({
    wasm: readerWasm(),
    log: (line) => logs.push(line),
    ...(faces ? { faces } : {}),
  });
  const opened = await engine.open(stored);
  if (!opened.ok) throw new Error('the fixture did not open');
  return { engine, logs, page: opened.pages[0]!.name };
}

async function bake(engine: PdfEngine, marks: readonly Mark[]) {
  const doc = PdfLiveChanges.load();
  PdfChangeset.apply(
    doc,
    marks.map((mark) => PdfChange.addMark(mark)),
  );
  return engine.bake(PdfLiveChanges.encode(doc));
}

/** How many of the drawn page's pixels in a box of page space are the mark's red. */
function redIn(
  drawn: { width: number; height: number; rgba: Uint8ClampedArray },
  [left, bottom, right, top]: readonly number[],
) {
  let count = 0;
  for (let y = bottom!; y < top!; y += 1)
    for (let x = left!; x < right!; x += 1) {
      const at = ((drawn.height - y) * drawn.width + x) * 4;
      if (drawn.rgba[at]! > 180 && drawn.rgba[at + 1]! < 110) count += 1;
    }
  return count;
}

/** The decoded appearance of the first mark on the baked file's first page. */
async function appearanceContent(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const pdf = await PDF.load(bytes.slice());
  const [annotation] = pdf.getPages()[0]!.getAnnotations();
  const normal = (annotation!.dict.get('AP') as PdfDict).get('N');
  return new TextDecoder().decode((pdf.getObject(normal as PdfRef) as PdfStream).getDecodedData());
}

const qpdfChecks = (bytes: Uint8Array, skip: (note?: string) => void) => {
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-faces-')), 'baked.pdf');
  writeFileSync(file, bytes);
  try {
    execFileSync('qpdf', ['--version'], { stdio: 'ignore' });
  } catch {
    skip('qpdf is not installed');
  }
  return execFileSync('qpdf', ['--check', file], { encoding: 'utf8' });
};

// marks.md "Words in every script": In the file, Loading.
describe('writing words in every script', () => {
  it('embeds a few kilobytes of the faces a mark uses, drawn, its words kept', async ({ skip }) => {
    const { engine, logs, page } = await engineWith(markFaceFiles);
    const words = 'Ελληνικά Кириллица Łódź नमस्ते';
    const result = await bake(engine, [text(page, words)]);
    if (!result.ok) throw new Error(result.refusal);
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(result.bytes.length - stored.length).toBeLessThan(24_000);
    expect(added).toContain('/CIDFontType2');
    expect(added).toContain('/Identity-H');
    // Its appearance sets glyphs in the mark faces alone: nothing in Helvetica, so nothing as its question mark.
    const content = await appearanceContent(result.bytes);
    expect(content).toContain('/LDf0 24 Tf');
    expect(content).not.toContain('/Helv');
    expect(content).not.toContain('?');
    expect(logs.some((line) => /^\[pdf\] faces-loaded count=5 bytes=\d+ ms=\d+$/.test(line))).toBe(
      true,
    );
    expect(logs.some((line) => line.startsWith('[pdf] glyphs-missing'))).toBe(false);
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
    expect(await engine.open(result.bytes)).toMatchObject({ ok: true });
    expect((await engine.fileMarks(0))[0]!.words).toBe(words);
    expect(redIn((await engine.drawPage(0, 1))!, [72, 440, 540, 500])).toBeGreaterThan(400);
  });

  it('sets Hebrew and Arabic within a line in the order they are read, each word where it was typed', async () => {
    const { engine, logs, page } = await engineWith(markFaceFiles);
    const result = await bake(engine, [text(page, 'abc שלום def\nمرحبا بالعالم')]);
    if (!result.ok) throw new Error(result.refusal);
    expect(logs.some((line) => line.startsWith('[pdf] faces-loaded count=3 '))).toBe(true);
    expect(logs.some((line) => line.startsWith('[pdf] glyphs-missing'))).toBe(false);
    const content = await appearanceContent(result.bytes);
    // The first line from the left: Latin, then the Hebrew word, then Latin again.
    const [first, second] = content.split(/ Tm\n/).slice(1);
    expect([...first!.matchAll(/\/(LDf\d) /g)].map((match) => match[1])).toEqual([
      'LDf0',
      'LDf1',
      'LDf0',
    ]);
    // The second line, right to left, set from the box's right side in the Arabic face and Latin's space.
    expect([...second!.matchAll(/\/(LDf\d) /g)].map((match) => match[1])).toEqual([
      'LDf2',
      'LDf0',
      'LDf2',
    ]);
    expect(await engine.open(result.bytes)).toMatchObject({ ok: true });
    expect(redIn((await engine.drawPage(0, 1))!, [72, 400, 540, 500])).toBeGreaterThan(400);
  });

  it('bakes the same bytes twice', async () => {
    const { engine, page } = await engineWith(markFaceFiles);
    const first = await bake(engine, [text(page, 'Ωμέγα')]);
    const second = await bake(engine, [text(page, 'Ωμέγα')]);
    expect(first.ok && second.ok && Buffer.compare(first.bytes, second.bytes)).toBe(0);
  });

  it('sets a dynamic stamp in the mark faces, its name bold, where its second line needs them', async () => {
    const { engine, page } = await engineWith(markFaceFiles);
    const lines = ['APPROVED', 'by Ελένη, 24 Nov 2026, 14:02'];
    const { width, height } = StampLayout.natural(lines);
    const stamp = Mark.stamp({
      id: 'a-stamp',
      page,
      stamp: 'approved',
      lines,
      rect: [100, 600, 100 + width, 600 + height],
      colour: '#086f1e',
      opacity: 1,
      author: 'Ada',
      createdAt: 0,
    })!;
    const result = await bake(engine, [stamp]);
    if (!result.ok) throw new Error(result.refusal);
    const added = Buffer.from(result.bytes).subarray(stored.length).toString('latin1');
    expect(added).toContain('+NotoSans-Bold');
    expect(added).toContain('+NotoSans-Regular');
  });

  it('sets a character no face has as the missing box, and counts it', async () => {
    const { engine, logs, page } = await engineWith(markFaceFiles);
    // Private-use characters: no mark face has one.
    const result = await bake(engine, [text(page, 'Ω \u{E000}\u{E001}')]);
    expect(result.ok).toBe(true);
    expect(logs).toContain('[pdf] glyphs-missing count=2');
  });

  it('loads no face for marks Helvetica writes', async () => {
    let asked = 0;
    const { engine, logs, page } = await engineWith(async (file) => {
      asked += 1;
      return markFaceFiles(file);
    });
    expect((await bake(engine, [text(page, 'Hello, café')])).ok).toBe(true);
    expect(asked).toBe(0);
    expect(logs.some((line) => line.startsWith('[pdf] faces-'))).toBe(false);
  });

  it('refuses the bake by name where a face does not load', async () => {
    const offline = await engineWith(async () => {
      throw new Error('offline');
    });
    expect(await bake(offline.engine, [text(offline.page, 'Ω')])).toEqual({
      ok: false,
      refusal: 'faces-unavailable',
    });
    expect(offline.logs).toContain('[pdf] faces-failed face=noto-sans-greek-400');
    const none = await engineWith();
    expect(await bake(none.engine, [text(none.page, 'Ω')])).toEqual({
      ok: false,
      refusal: 'faces-unavailable',
    });
  });
});
