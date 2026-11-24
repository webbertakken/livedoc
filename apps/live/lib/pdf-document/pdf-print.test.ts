// docs/specs/035-pdf-documents/files-print-and-sync.md "Printing": Document and marks prints the bake, Document only
// the stored file as it arrived; pages other than all are cut from it; where a browser cannot print a PDF, the chosen
// pages are drawn at PDF_PRINT_DPI with the live marks over them. Each print is logged, a failure by its step.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  Mark,
  PageName,
  PdfLiveChanges,
  type PageBitmap,
  type PageInfo,
} from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { makePrint, type PdfPrintDeps } from './pdf-print';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const STORED = Uint8Array.of(1, 1, 1);
const BAKED = Uint8Array.of(2, 2, 2);
const CUT = Uint8Array.of(3, 3, 3);
const page = (at: number): PageInfo => ({
  name: PageName.ofObject(at + 3),
  width: 612,
  height: 792,
  rotation: 0,
  label: null,
});
const PAGES = [page(0), page(1), page(2)];
const BITMAP: PageBitmap = {
  width: 2,
  height: 2,
  rgba: new Uint8ClampedArray(16),
  toView: [1, 0, 0, -1, 0, 792],
};
const HIGHLIGHT = Mark.highlight({
  id: 'm1',
  page: PAGES[1]!.name,
  quads: [[0, 8, 6, 8, 0, 0, 6, 0]],
  text: 'Hello',
  colour: '#ffd400',
  opacity: 0.5,
  author: 'Ada',
  createdAt: 0,
})!;

function changedDoc(): Y.Doc {
  const doc = new Y.Doc();
  PdfLiveChanges.addMark(doc, HIGHLIGHT);
  return doc;
}

function deps(over: Partial<PdfPrintDeps> = {}): PdfPrintDeps {
  return {
    engine: {
      bake: vi.fn(async () => ({
        ok: true as const,
        bytes: BAKED,
        kind: 'addition' as const,
        anchorsLost: 0,
        fieldsLost: 0,
      })),
      cutPages: vi.fn(async () => CUT),
      drawPage: vi.fn(async () => BITMAP),
    },
    doc: changedDoc(),
    documentName: 'Lease',
    readStored: async () => STORED,
    pages: PAGES,
    pictures: false,
    marksOn: () => [HIGHLIGHT],
    encode: vi.fn(async () => Uint8Array.of(9)),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('makePrint', () => {
  it('prints the bake of every page, with the marks', async () => {
    const made = await makePrint({ pages: null, marks: true }, deps());
    expect(made).toEqual({ ok: true, way: 'pdf', bytes: BAKED });
    expect(debugLog).toHaveBeenCalledWith('[pdf] printed pages=3 marks=yes way=pdf');
  });

  it('prints the stored file as it arrived for Document only, cut to the pages chosen', async () => {
    const given = deps();
    const made = await makePrint({ pages: [0, 2], marks: false }, given);
    expect(given.engine.bake).not.toHaveBeenCalled();
    expect(given.engine.cutPages).toHaveBeenCalledWith(STORED, [0, 2]);
    expect(made).toEqual({ ok: true, way: 'pdf', bytes: CUT });
    expect(debugLog).toHaveBeenCalledWith('[pdf] printed pages=2 marks=no way=pdf');
  });

  it('says which step failed: the bake, or the cut', async () => {
    const refused = deps({
      engine: {
        bake: async () => ({ ok: false as const, refusal: 'reopen' as const }),
        cutPages: async () => CUT,
        drawPage: async () => BITMAP,
      },
    });
    expect(await makePrint({ pages: null, marks: true }, refused)).toEqual({
      ok: false,
      step: 'bake',
    });
    const uncut = deps({
      engine: {
        bake: async () => ({ ok: false as const, refusal: 'reopen' as const }),
        cutPages: async () => null,
        drawPage: async () => BITMAP,
      },
    });
    expect(await makePrint({ pages: [1], marks: false }, uncut)).toEqual({
      ok: false,
      step: 'cut',
    });
    expect(debugLog).toHaveBeenCalledWith('[pdf] print-failed step=cut');
  });

  it('draws the chosen pages at the print resolution, the marks over them where they print', async () => {
    const given = deps({ pictures: true });
    const made = await makePrint({ pages: [1], marks: true }, given);
    expect(given.engine.drawPage).toHaveBeenCalledWith(1, 150 / 72);
    expect(given.encode).toHaveBeenCalledWith(
      { bitmap: BITMAP, marks: [HIGHLIGHT], page: PAGES[1] },
      0.92,
    );
    expect(made).toEqual({
      ok: true,
      way: 'pictures',
      pictures: [{ jpeg: Uint8Array.of(9), width: 612, height: 792 }],
    });
    await makePrint({ pages: null, marks: false }, given);
    expect(given.encode).toHaveBeenLastCalledWith(
      { bitmap: BITMAP, marks: [], page: PAGES[2] },
      0.92,
    );
    expect(debugLog).toHaveBeenCalledWith('[pdf] printed pages=3 marks=no way=pictures');
  });

  it('fails at drawing where a page cannot be drawn or encoded', async () => {
    const undrawn = deps({
      pictures: true,
      engine: {
        bake: async () => ({ ok: false as const, refusal: 'reopen' as const }),
        cutPages: async () => null,
        drawPage: async () => null,
      },
    });
    expect(await makePrint({ pages: null, marks: true }, undrawn)).toEqual({
      ok: false,
      step: 'draw',
    });
    const unencoded = deps({ pictures: true, encode: async () => null });
    expect(await makePrint({ pages: [0], marks: true }, unencoded)).toEqual({
      ok: false,
      step: 'draw',
    });
  });
});
