// docs/specs/035-pdf-documents/files-print-and-sync.md "Printing": pages other than all are cut as a new PDF of those
// pages alone, in the order asked; the bytes handed in are never touched.
import { PDF } from '@libpdf/core';
import { describe, expect, it } from 'vitest';
import { protectedPdf, textPdf } from '../testing/fixtures';
import { cutPages } from './cut-pages';

const textOf = async (bytes: Uint8Array) => {
  const pdf = await PDF.load(bytes);
  return pdf.getPages().map((page) => page.extractText().text);
};

describe('cutPages', () => {
  it('is a new PDF of the pages asked for, in their order, the file untouched', async () => {
    const file = await textPdf(4);
    const before = file.slice();
    const cut = (await cutPages(file, [3, 1], null))!;
    expect(await textOf(cut)).toEqual([
      expect.stringContaining('Page 4'),
      expect.stringContaining('Page 2'),
    ]);
    expect(file).toEqual(before);
  });

  it('opens a protected file with its password', async () => {
    const file = await protectedPdf({ userPassword: 'open sesame' });
    expect(await cutPages(file, [0], 'open sesame')).not.toBeNull();
    expect(await cutPages(file, [0], 'wrong')).toBeNull();
  });

  it('is none for no page, a page not there, or a file it cannot read', async () => {
    const file = await textPdf(2);
    expect(await cutPages(file, [], null)).toBeNull();
    expect(await cutPages(file, [2], null)).toBeNull();
    expect(await cutPages(file, [-1], null)).toBeNull();
    expect(await cutPages(file, [0.5], null)).toBeNull();
    expect(await cutPages(new Uint8Array([1, 2, 3]), [0], null)).toBeNull();
  });
});
