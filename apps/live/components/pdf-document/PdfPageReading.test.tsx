// @vitest-environment jsdom
// docs/specs/035-pdf-documents/accessibility.md "The accessible tree": a page near view reads its text as paragraphs,
// the same text Copy gives, visually hidden; a page far from view is an empty region; the build is logged.
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageText } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { PdfPageTexts } from '@/lib/pdf-document/pdf-page-texts';
import { PdfPageReading, pageRegionName } from './PdfPageReading';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

// One line of characters 6 wide and 8 tall, each line 40 points below the last, joined by the reader's own breaks.
function lines(...texts: string[]): PageText {
  const codes: number[] = [];
  const boxes: number[] = [];
  texts.forEach((text, at) => {
    const y = 700 - at * 40;
    let x = 100;
    for (const character of text) {
      codes.push(character.codePointAt(0)!);
      boxes.push(x, y, x + 6, y + 8);
      x += 6;
    }
    if (at < texts.length - 1) {
      codes.push(13, 10);
      boxes.push(x, y, x, y, x, y, x, y);
    }
  });
  return PageText.of(codes, boxes);
}

const textsOf = (page: PageText | null): PdfPageTexts => ({ read: vi.fn(async () => page) });

// "One landmark a page": named by its number of the count, with the file's own label where it gives one.
describe('pageRegionName', () => {
  it('names a page by its number, and its label where the file gives one', () => {
    expect(pageRegionName(2, 14, null)).toBe('Page 3 of 14');
    expect(pageRegionName(2, 14, 'iii')).toBe('Page 3 of 14 (iii)');
  });
});

describe('a page’s reading order', () => {
  it('reads a page near view as paragraphs, hidden from sight, and logs the build', async () => {
    const texts = textsOf(lines('Heading', 'A paragraph.'));
    const view = render(<PdfPageReading index={2} texts={texts} wanted />);
    await act(async () => {});
    const paragraphs = [...view.container.querySelectorAll('p')].map((p) => p.textContent);
    expect(paragraphs).toEqual(['Heading', 'A paragraph.']);
    expect(view.container.firstElementChild!.className).toContain('sr-only');
    expect(texts.read).toHaveBeenCalledWith(2);
    expect(debugLog).toHaveBeenCalledWith('[pdf] tree source=geometry page=3 nodes=2');
  });

  it('holds nothing for a page far from view, and lets it go when the page leaves', async () => {
    const texts = textsOf(lines('Heading'));
    const view = render(<PdfPageReading index={0} texts={texts} wanted={false} />);
    await act(async () => {});
    expect(texts.read).not.toHaveBeenCalled();
    expect(view.container.innerHTML).toBe('');
    view.rerender(<PdfPageReading index={0} texts={texts} wanted />);
    await act(async () => {});
    expect(view.container.querySelectorAll('p')).toHaveLength(1);
    view.rerender(<PdfPageReading index={0} texts={texts} wanted={false} />);
    expect(view.container.innerHTML).toBe('');
  });

  it('says a page with no text has none to read', async () => {
    const view = render(<PdfPageReading index={0} texts={textsOf(null)} wanted />);
    await act(async () => {});
    expect(view.container.innerHTML).toBe('');
    expect(debugLog).toHaveBeenCalledWith('[pdf] tree source=none page=1 nodes=0');
  });

  it('shows nothing of a read that lands after the page left view', async () => {
    let land: (page: PageText) => void = () => {};
    const texts: PdfPageTexts = { read: () => new Promise((resolve) => (land = resolve)) };
    const view = render(<PdfPageReading index={0} texts={texts} wanted />);
    view.rerender(<PdfPageReading index={0} texts={texts} wanted={false} />);
    await act(async () => land(lines('Late')));
    expect(view.container.innerHTML).toBe('');
  });

  it('reads nothing while the pages have no text source', () => {
    const view = render(<PdfPageReading index={0} texts={null} wanted />);
    expect(view.container.innerHTML).toBe('');
  });
});
