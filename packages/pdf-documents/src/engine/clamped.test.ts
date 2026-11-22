import { beforeAll, describe, expect, it } from 'vitest';
import type { PdfEngine } from '../engine-contract';
import { PDF_MAX_COORDINATE, PDF_MAX_LAYERS, PDF_MAX_PAGE_POINTS } from '../limits';
import {
  embeddedFilesPdf,
  formPdf,
  layersPdf,
  linksPdf,
  longOutlinePdf,
  marksPdf,
  readerWasm,
  signaturesPdf,
  textPdf,
} from '../testing/fixtures';
import { FAR_AWAY, farAwayPdf } from '../testing/hostile';
import { createPdfEngine } from './index';
import { PdfReader, startReader } from './reader';

let reader: PdfReader;
let engine: PdfEngine;
let logged: string[] = [];

beforeAll(async () => {
  reader = new PdfReader(await startReader(readerWasm()));
  engine = await createPdfEngine({ wasm: readerWasm(), log: (line) => logged.push(line) });
});

const taken = () => Object.fromEntries(reader.takeClamped());

// security.md "The boundary": a value out of bounds is clamped or dropped, and logged.
describe('what the reader holds back', () => {
  it('holds a page’s size within what a page may measure, and counts it', () => {
    const opened = reader.open(farAwayPdf());
    expect(opened.ok && opened.pages[0]!.width).toBe(PDF_MAX_PAGE_POINTS);
    expect(taken()).toEqual({ size: 1 });
  });

  it('holds a link’s box and the place it leads to within reach of the page', () => {
    reader.open(farAwayPdf());
    reader.takeClamped();
    const [link] = reader.links(0);
    expect(link!.rect).toEqual([-PDF_MAX_COORDINATE, 5, PDF_MAX_COORDINATE, 20]);
    expect(link!.target).toMatchObject({ x: PDF_MAX_COORDINATE, y: -PDF_MAX_COORDINATE });
    expect(taken()).toEqual({ coordinate: 4 });
  });

  it('holds every character’s box, and a selection’s, within reach of the page', () => {
    reader.open(farAwayPdf());
    reader.takeClamped();
    const text = reader.pageText(0)!;
    expect(text.text).toBe('Far');
    expect([...text.boxes].every((side) => Math.abs(side) <= PDF_MAX_COORDINATE)).toBe(true);
    expect(taken().coordinate).toBe(12);
    const point = { x: FAR_AWAY + 2, y: FAR_AWAY + 2 };
    const selection = reader.selectText(0, point, point)!;
    expect(selection.quads.flat().every((side) => Math.abs(side) <= PDF_MAX_COORDINATE)).toBe(true);
    expect(taken().coordinate).toBe(4);
  });

  it('drops a quadrilateral that is out of reach, rather than move it over text it never covered', () => {
    reader.open(farAwayPdf());
    reader.takeClamped();
    const [mark] = reader.fileMarks(0);
    expect(mark!.quads).toEqual([]);
    expect(mark!.rect).toEqual([72, 700, 172, 720]);
    expect(taken()).toEqual({ coordinate: 1 });
  });

  it('counts a list cut to its limit: marks, fields, links, bookmarks, embedded files, signatures, text', async () => {
    const cut = (file: Uint8Array<ArrayBuffer>, read: () => unknown) => {
      reader.open(file);
      reader.takeClamped();
      read();
      return taken();
    };
    expect(cut(marksPdf(), () => reader.fileMarks(0, 2))).toEqual({ list: 1 });
    expect(cut(formPdf(), () => reader.fields(0, 2))).toEqual({ list: 1 });
    expect(cut(linksPdf(), () => reader.links(0, 2))).toEqual({ list: 1 });
    expect(cut(longOutlinePdf(5), () => reader.outline(2))).toEqual({ list: 1 });
    expect(cut(embeddedFilesPdf(), () => reader.embeddedFiles(1))).toEqual({ list: 1 });
    expect(cut(signaturesPdf(), () => reader.signatures(1))).toEqual({ list: 1 });
    expect(cut(await textPdf(1), () => reader.pageText(0, 5))).toEqual({ list: 1 });
  });

  it('counts nothing for a list read whole', () => {
    reader.open(linksPdf());
    reader.takeClamped();
    reader.links(0);
    reader.fileMarks(0);
    reader.outline();
    expect(taken()).toEqual({});
  });
});

describe('what the engine logs of it', () => {
  it('logs each sort once a call, with its count, and nothing of the file', async () => {
    logged = [];
    await engine.open(farAwayPdf());
    expect(logged).toEqual(['[pdf] value-clamped what=size count=1']);
    logged = [];
    await engine.links(0);
    await engine.pageText(0);
    expect(logged).toEqual([
      '[pdf] value-clamped what=coordinate count=4',
      '[pdf] value-clamped what=coordinate count=12',
    ]);
  });

  it('logs PDF layers cut to their limit', async () => {
    await engine.open(layersPdf(PDF_MAX_LAYERS + 2));
    logged = [];
    await engine.layers();
    expect(logged).toEqual(['[pdf] value-clamped what=list count=1']);
  });
});
