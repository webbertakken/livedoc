// opening.md "Limits": a phone says it has 4 GB or less, or says nothing and is touched; reading-surface.md "Phone and
// tablet" and "Limits": a phone's tiles keep the phone's budget at a pixel ratio of at most 2.
import { describe, expect, it } from 'vitest';
import {
  PDF_PHONE_PIXEL_RATIO,
  PDF_TILE_CACHE_BYTES,
  PDF_TILE_PHONE_CACHE_BYTES,
} from '@livedoc/pdf-documents';
import { PdfDevice } from './pdf-device';

const PHONE = { deviceMemory: 4, coarsePointer: true };
const DESKTOP = { deviceMemory: 16, coarsePointer: false };

describe("a PDF document's device", () => {
  it('is a phone where it says it has little memory, or says nothing and is touched', () => {
    expect(PdfDevice.isPhone(PHONE)).toBe(true);
    expect(PdfDevice.isPhone(DESKTOP)).toBe(false);
    expect(PdfDevice.isPhone({ deviceMemory: undefined, coarsePointer: true })).toBe(true);
    expect(PdfDevice.isPhone({ deviceMemory: undefined, coarsePointer: false })).toBe(false);
    expect(PdfDevice.isPhone({ deviceMemory: 8, coarsePointer: true })).toBe(false);
  });

  it('keeps a phone’s tiles to the phone’s budget, at a pixel ratio of at most two', () => {
    expect(PdfDevice.tileBudget(PHONE)).toBe(PDF_TILE_PHONE_CACHE_BYTES);
    expect(PdfDevice.tileBudget(DESKTOP)).toBe(PDF_TILE_CACHE_BYTES);
    expect(PdfDevice.tilePixelRatio(PHONE, 3)).toBe(PDF_PHONE_PIXEL_RATIO);
    expect(PdfDevice.tilePixelRatio(DESKTOP, 3)).toBe(3);
  });
});
