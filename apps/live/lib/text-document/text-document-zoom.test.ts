// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { parseZoomText, zoomLabel, zoomScale } from '@/lib/office/office-zoom';
import {
  PAGE_WIDTH_PX,
  TEXT_DOCUMENT_ZOOM_KEY,
  readTextDocumentZoom,
  writeTextDocumentZoom,
} from './text-document-zoom';

// docs/specs/034-text-documents/editing-surface.md "Zoom".
describe('parseZoomText', () => {
  it('takes a whole number from 50 to 200, with or without %', () => {
    expect(parseZoomText('125')).toBe(125);
    expect(parseZoomText(' 80 % ')).toBe(80);
    expect(parseZoomText('50%')).toBe(50);
    expect(parseZoomText('200')).toBe(200);
  });

  it('refuses anything else', () => {
    for (const text of ['49', '201', '12.5', 'big', '', '%', '1e2'])
      expect(parseZoomText(text)).toBeNull();
  });
});

describe('zoomScale', () => {
  it('scales by the percentage', () => {
    expect(zoomScale(150, 1000, PAGE_WIDTH_PX)).toBe(1.5);
  });

  it('fits the page width to the room, never above 200%', () => {
    expect(zoomScale('fit', 816, PAGE_WIDTH_PX)).toBe(1);
    expect(zoomScale('fit', 408, PAGE_WIDTH_PX)).toBe(0.5);
    expect(zoomScale('fit', 5000, PAGE_WIDTH_PX)).toBe(2);
  });
});

describe('zoomLabel', () => {
  it('names a zoom as the field shows it', () => {
    expect(zoomLabel('fit')).toBe('Fit');
    expect(zoomLabel(90)).toBe('90%');
  });
});

describe('the remembered zoom', () => {
  beforeEach(() => localStorage.clear());

  it('is 100% until set, then what was set, per document', () => {
    expect(readTextDocumentZoom('D')).toBe(100);
    writeTextDocumentZoom('D', 'fit');
    writeTextDocumentZoom('E', 150);
    expect(readTextDocumentZoom('D')).toBe('fit');
    expect(readTextDocumentZoom('E')).toBe(150);
  });

  it('forgets a stored value it cannot read', () => {
    localStorage.setItem(TEXT_DOCUMENT_ZOOM_KEY, JSON.stringify([['D', 999]]));
    expect(readTextDocumentZoom('D')).toBe(100);
  });
});
