// docs/specs/035-pdf-documents/reading-surface.md "Thumbnails": a thumbnail's name, caption, size and who is on it.
import { describe, expect, it } from 'vitest';
import { PDF_THUMBNAIL_BOX_PX } from '@livedoc/pdf-documents';
import { PdfThumbnailCopy, thumbnailSize } from './pdf-thumbnails';

describe('a thumbnail', () => {
  it('is named by its page number, and its label where that is not the number', () => {
    expect(PdfThumbnailCopy.name(2, null)).toBe('Page 3');
    expect(PdfThumbnailCopy.name(2, '3')).toBe('Page 3');
    expect(PdfThumbnailCopy.name(3, 'iv')).toBe('Page 4, iv');
  });

  it('is captioned by its label where the file gives one, else its number', () => {
    expect(PdfThumbnailCopy.caption(2, null)).toBe('3');
    expect(PdfThumbnailCopy.caption(3, 'iv')).toBe('iv');
    expect(PdfThumbnailCopy.caption(3, '')).toBe('4');
  });

  it('names who is on its page', () => {
    expect(PdfThumbnailCopy.here([])).toBe('');
    expect(PdfThumbnailCopy.here(['Ada'])).toBe('Ada is here');
    expect(PdfThumbnailCopy.here(['Ada', 'Ben'])).toBe('Ada and Ben are here');
    expect(PdfThumbnailCopy.here(['Ada', 'Ben', 'Cy'])).toBe('Ada, Ben and Cy are here');
  });

  it('fits its page into the thumbnail box, its longer side the box', () => {
    const portrait = thumbnailSize({ width: 612, height: 792 });
    expect(portrait.width).toBeCloseTo((612 / 792) * PDF_THUMBNAIL_BOX_PX);
    expect(portrait.height).toBeCloseTo(PDF_THUMBNAIL_BOX_PX);
    const landscape = thumbnailSize({ width: 842, height: 595 });
    expect(landscape.width).toBeCloseTo(PDF_THUMBNAIL_BOX_PX);
    expect(landscape.height).toBeCloseTo((595 / 842) * PDF_THUMBNAIL_BOX_PX);
  });
});
