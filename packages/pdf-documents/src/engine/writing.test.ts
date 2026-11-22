import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BakeResult, PdfEngine, PdfOpened } from '../engine-contract';
import { PdfLiveChanges } from '../live-changes';
import { Mark } from '../mark';
import { PdfChange, PdfChangeset } from '../pdf-change';
import {
  embeddedFilesPdf,
  formPdf,
  labelledPdf,
  layersPdf,
  marksPdf,
  outlinePdf,
  protectedPdf,
  readerWasm,
  signedPdf,
  spoiled,
  textPdf,
} from '../testing/fixtures';
import { createPdfEngine } from './index';

let engine: PdfEngine;
let stored: Uint8Array<ArrayBuffer>;

beforeAll(async () => {
  engine = await createPdfEngine({ wasm: readerWasm() });
  stored = await textPdf(2);
});

const opened = (result: PdfOpened) => {
  if (!result.ok) throw new Error('the fixture did not open');
  return result.pages;
};
const baked = (result: BakeResult) => {
  if (!result.ok) throw new Error(result.refusal);
  return result;
};
const at = Date.UTC(2026, 10, 22);
const fill = (field: string, value: string | string[]) =>
  PdfChange.fill({ field, value, by: 'Ada', at });
/** The open file baked with the changes given. */
async function bakeWith(changes: readonly PdfChange[]) {
  const doc = PdfLiveChanges.load();
  const made = PdfChangeset.apply(doc, changes);
  if (!made.ok) throw new Error(made.refusal);
  return baked(await engine.bake(PdfLiveChanges.encode(doc)));
}
/** A highlight over the fixture's line on the page of the open file given. */
async function highlightOn(pageIndex: number, pages: ReturnType<typeof opened>, id = 'mark-1') {
  const selection = await engine.selectText(pageIndex, { x: 74, y: 724 }, { x: 180, y: 724 });
  return PdfChange.addMark(
    Mark.highlight({
      id,
      page: pages[pageIndex]!.name,
      quads: selection!.quads,
      text: selection!.text,
      colour: '#fdf1a9',
      opacity: 1,
      author: 'Ada',
      createdAt: at,
    })!,
  );
}
const startsWith = (bytes: Uint8Array, prefix: Uint8Array) =>
  bytes.length > prefix.length && prefix.every((byte, n) => bytes[n] === byte);
const qpdfChecks = (bytes: Uint8Array, skip: (note?: string) => void, password?: string) => {
  const file = join(mkdtempSync(join(tmpdir(), 'pdf-writing-')), 'baked.pdf');
  writeFileSync(file, bytes);
  try {
    execFileSync('qpdf', ['--version'], { stdio: 'ignore' });
  } catch {
    skip('qpdf is not installed');
  }
  const args = password ? [`--password=${password}`, '--check', file] : ['--check', file];
  return execFileSync('qpdf', args, { encoding: 'utf8' });
};

// fields.md "In the file"; saving.md "Addition or rewrite": field values are an addition.
describe('writing field values', () => {
  it('writes each value into its field as an addition, read back by any reader', async ({
    skip,
  }) => {
    const form = formPdf();
    opened(await engine.open(form));
    const result = await bakeWith([
      fill('applicant.city', 'Leiden'),
      fill('agree', 'Off'),
      fill('colour', 'red'),
      fill('country', 'Option 3'),
      fill('languages', ['Option 2']),
    ]);
    expect(result).toMatchObject({ kind: 'addition', anchorsLost: 0, fieldsLost: 0 });
    expect(startsWith(result.bytes, form)).toBe(true);
    opened(await engine.open(result.bytes));
    const read = new Map(
      (await engine.fields(0)).map((field) => [`${field.name}/${field.onValue}`, field]),
    );
    expect(read.get('applicant.city/')!.value).toBe('Leiden');
    expect(read.get('agree/Yes')!.on).toBe(false);
    expect(read.get('colour/red')!.on).toBe(true);
    expect(read.get('colour/blue')!.on).toBe(false);
    expect(read.get('country/')!.value).toBe('Option 3');
    expect(read.get('languages/')!.options.map((option) => option.chosen)).toEqual([
      false,
      true,
      false,
    ]);
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
  });

  it('turns a tick box on by any value but Off', async () => {
    opened(await engine.open(formPdf()));
    const off = await bakeWith([fill('agree', 'Off')]);
    opened(await engine.open(off.bytes));
    const on = await bakeWith([fill('agree', 'Yes')]);
    opened(await engine.open(on.bytes));
    expect((await engine.fields(0)).find((field) => field.name === 'agree')!.on).toBe(true);
  });

  it('counts a value the file’s field does not take, and writes the rest', async () => {
    opened(await engine.open(formPdf()));
    const result = await bakeWith([
      fill('applicant.city', 'Leiden'),
      fill('no.such.field', 'x'),
      fill('notes', 'read-only'),
      fill('signature', 'Ada'),
      fill('send', 'pressed'),
      fill('country', ['two', 'values']),
      fill('colour', 'green'),
      fill('languages', 'not a list'),
    ]);
    expect(result).toMatchObject({ kind: 'addition', fieldsLost: 7 });
    opened(await engine.open(result.bytes));
    const fields = await engine.fields(0);
    expect(fields.find((field) => field.name === 'applicant.city')!.value).toBe('Leiden');
    expect(fields.find((field) => field.name === 'notes')!.value).toBe('Line one');
  });

  it('counts every value for a file with no form', async () => {
    opened(await engine.open(stored));
    expect(await bakeWith([fill('applicant.city', 'Leiden')])).toMatchObject({
      kind: 'addition',
      fieldsLost: 1,
    });
  });
});

// marks.md "In the file": a mark deleted in LiveDoc is written as the removed annotation in the same addition.
describe('writing a deletion of the file’s own mark', () => {
  it('removes the marks named, by their own name or by their object, as an addition', async () => {
    const file = marksPdf();
    opened(await engine.open(file));
    const result = await bakeWith([
      PdfChange.removeFromFile('hl-1', 'mark'),
      PdfChange.removeFromFile('o:9', 'mark'),
      PdfChange.removeFromFile('no-such-mark', 'mark'),
      PdfChange.removeFromFile('o:77', 'object'),
    ]);
    expect(result.kind).toBe('addition');
    expect(startsWith(result.bytes, file)).toBe(true);
    opened(await engine.open(result.bytes));
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual([
      're-1',
      'st-1',
      'ca-1',
      'o:10',
      'long',
    ]);
  });
});

// saving.md "Addition or rewrite": pages turned are a rewrite; what Reviewing added is appended to it.
describe('a rewrite', () => {
  it('turns the page in the file, then appends the mark to the page it was made on', async ({
    skip,
  }) => {
    const pages = opened(await engine.open(stored));
    const result = await bakeWith([
      PdfChange.turnPage(pages[1]!.name, 90),
      await highlightOn(0, pages),
      await highlightOn(1, pages, 'mark-2'),
    ]);
    expect(result).toMatchObject({ kind: 'rewrite', anchorsLost: 0 });
    expect(startsWith(result.bytes, stored)).toBe(false);
    const reopened = opened(await engine.open(result.bytes));
    expect(reopened.map((page) => page.rotation)).toEqual([0, 90]);
    expect(reopened.map((page) => [page.width, page.height])).toEqual([
      [612, 792],
      [792, 612],
    ]);
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual(['mark-1']);
    expect((await engine.fileMarks(1)).map((mark) => mark.id)).toEqual(['mark-2']);
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
  });

  it('writes the same stored file and changes to the same bytes', async () => {
    const pages = opened(await engine.open(stored));
    const changes = [PdfChange.turnPage(pages[0]!.name, 180), await highlightOn(1, pages)];
    const first = await bakeWith(changes);
    opened(await engine.open(stored));
    expect((await bakeWith(changes)).bytes).toEqual(first.bytes);
  });

  it('counts a turn of a page the stored file does not hold', async () => {
    opened(await engine.open(stored));
    const result = await bakeWith([PdfChange.turnPage('p:99999', 90)]);
    expect(result).toMatchObject({ kind: 'rewrite', anchorsLost: 1 });
  });

  // opening.md "Damaged files": a repaired file's changes are written as a rewritten file.
  it('rewrites a file that cannot take an addition, with the mark on its page', async ({
    skip,
  }) => {
    const damaged = spoiled(stored);
    const pages = opened(await engine.open(damaged));
    expect(await engine.canAppend()).toBe(false);
    const result = await bakeWith([await highlightOn(0, pages)]);
    expect(result.kind).toBe('rewrite');
    opened(await engine.open(result.bytes));
    expect(await engine.canAppend()).toBe(true);
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toEqual(['mark-1']);
    expect(qpdfChecks(result.bytes, skip)).toContain('No syntax or stream encoding errors');
  });

  // saving.md "What is kept untouched"
  it('keeps the outline, page labels, embedded files, PDF layers, fields and marks it did not touch', async () => {
    const turned = async (file: Uint8Array<ArrayBuffer>) => {
      const pages = opened(await engine.open(file));
      const result = await bakeWith([PdfChange.turnPage(pages[0]!.name, 90)]);
      expect(result.kind).toBe('rewrite');
      return result.bytes;
    };
    opened(await engine.open(outlinePdf()));
    const outline = await engine.outline();
    opened(await engine.open(await turned(outlinePdf())));
    expect((await engine.outline()).items.map((item) => item.title)).toEqual(
      outline.items.map((item) => item.title),
    );
    const labels = opened(await engine.open(await turned(labelledPdf()))).map((page) => page.label);
    expect(labels).toEqual(['i', 'ii', 'A-1']);
    opened(await engine.open(embeddedFilesPdf()));
    const files = await engine.embeddedFiles();
    opened(await engine.open(await turned(embeddedFilesPdf())));
    expect(await engine.embeddedFiles()).toEqual(files);
    opened(await engine.open(await turned(layersPdf())));
    expect((await engine.layers()).map((layer) => layer.name)).toEqual(['Plan', 'Notes', 'Border']);
    opened(await engine.open(formPdf()));
    const fields = await engine.fields(0);
    opened(await engine.open(await turned(formPdf())));
    expect((await engine.fields(0)).map((field) => [field.name, field.value])).toEqual(
      fields.map((field) => [field.name, field.value]),
    );
    opened(await engine.open(await turned(marksPdf())));
    expect((await engine.fileMarks(0)).map((mark) => mark.id)).toContain('hl-1');
  });

  // saving.md "Addition or rewrite": a protected file is rewritten protected.
  it('rewrites a protected file protected, opening with the same password', async ({ skip }) => {
    const locked = await protectedPdf({ userPassword: 'open sesame' });
    await engine.open(locked);
    const pages = opened(await engine.unlock('open sesame'));
    const result = await bakeWith([PdfChange.turnPage(pages[0]!.name, 270)]);
    expect(result.kind).toBe('rewrite');
    expect(await engine.open(result.bytes)).toEqual({ ok: false, needsPassword: true });
    expect(opened(await engine.unlock('open sesame'))[0]!.rotation).toBe(270);
    expect(qpdfChecks(result.bytes, skip, 'open sesame')).toContain(
      'No syntax or stream encoding errors',
    );
  });
});

// saving.md "The validators' claim": an addition keeps every earlier signature valid, by poppler's pdfsig.
describe('an addition to a signed file', () => {
  it('leaves the signature valid over what it signed', async ({ skip }) => {
    const signed = await signedPdf();
    const pages = opened(await engine.open(signed));
    const result = await bakeWith([await highlightOn(0, pages)]);
    expect(result.kind).toBe('addition');
    expect(startsWith(result.bytes, signed)).toBe(true);
    const file = join(mkdtempSync(join(tmpdir(), 'pdf-writing-')), 'signed.pdf');
    writeFileSync(file, result.bytes);
    try {
      execFileSync('pdfsig', ['-v'], { stdio: 'ignore' });
    } catch {
      skip('pdfsig is not installed');
    }
    const said = execFileSync('pdfsig', ['-nocert', file], { encoding: 'utf8' });
    expect(said).toContain('Signature is Valid');
    expect(said).not.toContain('Total document signed');
  });
});

// opening.md "Damaged files": whether a file can take an addition is the writer's answer.
describe('whether a file can take an addition', () => {
  it('is yes for a whole file, and for a file the writer reads after the reader', async () => {
    opened(await engine.open(stored));
    expect(await engine.canAppend()).toBe(true);
    expect(await engine.layers()).toEqual([]);
    expect(await engine.canAppend()).toBe(true);
  });

  it('is no for a file opened only by rebuilding it, and with no file open', async () => {
    opened(await engine.open(spoiled(stored)));
    expect(await engine.canAppend()).toBe(false);
    await engine.close();
    expect(await engine.canAppend()).toBe(false);
  });
});
