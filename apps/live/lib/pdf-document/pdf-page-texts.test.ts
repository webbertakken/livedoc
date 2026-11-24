// docs/specs/035-pdf-documents/reading-surface.md "The pages" (Selecting text), "Limits": PDF_PAGE_TEXTS_KEPT pages'
// text kept read, the least lately used let go first; a page whose text cannot be read is logged and selects nothing.
import { describe, expect, it, vi } from 'vitest';
import { PageText } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { pdfPageTexts } from './pdf-page-texts';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const noTags = vi.fn(async () => null);
const textOf = (index: number) => PageText.of([65 + index], [0, 0, 1, 1]);

describe("a surface's page texts", () => {
  it('reads a page once and answers it again from what it keeps', async () => {
    const pageText = vi.fn(async (index: number) => textOf(index));
    const texts = pdfPageTexts({ pageText, pageTags: noTags });
    expect((await texts.read(0))?.text).toBe('A');
    expect((await texts.read(0))?.text).toBe('A');
    expect(pageText).toHaveBeenCalledTimes(1);
  });

  it('lets the least lately used page go past the number it keeps', async () => {
    const pageText = vi.fn(async (index: number) => textOf(index));
    const texts = pdfPageTexts({ pageText, pageTags: noTags }, 2);
    await texts.read(0);
    await texts.read(1);
    await texts.read(0);
    await texts.read(2);
    await texts.read(0);
    expect(pageText).toHaveBeenCalledTimes(3);
    await texts.read(1);
    expect(pageText).toHaveBeenCalledTimes(4);
  });

  it('logs a page whose text cannot be read, answers nothing and asks again next time', async () => {
    const pageText = vi
      .fn()
      .mockRejectedValueOnce(new Error('stopped'))
      .mockResolvedValue(textOf(0));
    const texts = pdfPageTexts({ pageText, pageTags: noTags });
    expect(await texts.read(4)).toBeNull();
    expect(debugLog).toHaveBeenCalledWith('[pdf] page-text-failed page=5');
    expect((await texts.read(4))?.text).toBe('A');
  });

  it('answers nothing for a page the engine has no text of, and keeps that answer', async () => {
    const pageText = vi.fn(async () => null);
    const texts = pdfPageTexts({ pageText, pageTags: noTags });
    expect(await texts.read(9)).toBeNull();
    await texts.read(9);
    expect(pageText).toHaveBeenCalledTimes(1);
  });

  // accessibility.md "The accessible tree": a page near view reads its tags each time, keeping none of them.
  it('reads a page’s tags each time it is asked', async () => {
    const tags = { elements: [], cut: false };
    const pageTags = vi.fn(async () => tags);
    const texts = pdfPageTexts({ pageText: vi.fn(), pageTags });
    expect(await texts.tags(3)).toBe(tags);
    await texts.tags(3);
    expect(pageTags).toHaveBeenCalledTimes(2);
  });

  it('logs a page whose tags cannot be read, and answers none', async () => {
    const pageTags = vi.fn().mockRejectedValue(new Error('stopped'));
    const texts = pdfPageTexts({ pageText: vi.fn(), pageTags });
    expect(await texts.tags(1)).toBeNull();
    expect(debugLog).toHaveBeenCalledWith('[pdf] page-tags-failed page=2');
  });
});
