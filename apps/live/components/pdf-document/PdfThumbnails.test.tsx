// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Thumbnails": every page, its caption, the page in view outlined
// and the one tab stop, a press going to its page, keys between them, drawn near the panel's view on the engine's
// line behind the pages, never turned, LiveDoc's marks over it, and who is on each page.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { BlobKey } from '@livedoc/document';
import { PageName, type PageBitmap, type PageInfo } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import { addHighlight } from '@/lib/pdf-document/pdf-highlight';
import { pdfMarksStore } from '@/lib/pdf-document/pdf-marks-store';
import {
  receivePdfPresence,
  resetPdfPresenceForTests,
  syncPdfPresencePeople,
} from '@/lib/pdf-document/pdf-presence-store';
import { PdfThumbnails } from './PdfThumbnails';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));
// Pixels are a browser's to paint (e2e/office/pdf-document-panels.spec.ts): here, that each is painted.
vi.mock('@/lib/pdf-document/pdf-paint', () => ({ paintPicture: vi.fn() }));

const page = (object: number, label: string | null = null, width = 612): PageInfo => ({
  name: PageName.ofObject(object),
  width,
  height: 792,
  rotation: 0,
  label,
});
const PAGES = [page(3, 'i'), page(5, 'ii'), page(7, '1'), page(9, null, 842)];

const bitmap: PageBitmap = {
  width: 2,
  height: 2,
  rgba: new Uint8ClampedArray(16),
  toView: [1, 0, 0, -1, 0, 792],
};

// Every thumbnail is in view: the observer says so of each element it is given.
class AllInView {
  protected readonly report: (entries: IntersectionObserverEntry[]) => void;
  constructor(report: (entries: IntersectionObserverEntry[]) => void) {
    this.report = report;
  }
  observe(target: Element) {
    this.report([{ target, isIntersecting: true } as unknown as IntersectionObserverEntry]);
  }
  unobserve() {}
  disconnect() {}
}

function drawer(answer: PageBitmap | null = bitmap): PdfPageDrawer & { asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    draw: async () => null,
    forget: () => {},
    drawTile: async () => null,
    forgetTile: () => {},
    drawThumbnail: async (index, scale) => {
      asked.push([index, scale]);
      return answer;
    },
    forgetThumbnail: () => {},
  };
}

function show(over: Partial<Parameters<typeof PdfThumbnails>[0]> = {}) {
  const props = {
    tabId: 't1',
    pages: PAGES,
    page: 1,
    onGoTo: vi.fn(),
    drawer: drawer(),
    marks: pdfMarksStore(new Y.Doc()),
    ...over,
  };
  const view = render(<PdfThumbnails {...props} />);
  return { ...view, props };
}

const thumbnails = () => screen.getAllByRole('button');

beforeEach(() => {
  resetPdfPresenceForTests();
  vi.stubGlobal('IntersectionObserver', AllInView);
  vi.stubGlobal('devicePixelRatio', 2);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the thumbnails', () => {
  it('lists every page, named by its number and label, captioned by its label', () => {
    show();
    expect(screen.getByRole('list', { name: 'Pages' })).toBeTruthy();
    expect(thumbnails().map((b) => b.getAttribute('aria-label'))).toEqual([
      'Page 1, i',
      'Page 2, ii',
      'Page 3, 1',
      'Page 4',
    ]);
    expect(thumbnails().map((b) => b.textContent)).toEqual(['i', 'ii', '1', '4']);
  });

  it('marks the page in view as current and makes it the one tab stop, where the panel starts', () => {
    show({ page: 2 });
    const [, , third] = thumbnails();
    expect(thumbnails().map((b) => b.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'page',
      null,
    ]);
    expect(thumbnails().map((b) => b.tabIndex)).toEqual([-1, -1, 0, -1]);
    expect(third!.hasAttribute('data-panel-start')).toBe(true);
  });

  it('goes to a page when its thumbnail is pressed', () => {
    const { props } = show();
    fireEvent.click(thumbnails()[3]!);
    expect(props.onGoTo).toHaveBeenCalledWith(3);
  });

  it('moves between thumbnails with Down, Up, Home and End, and goes with Enter', () => {
    const { props } = show({ page: 0 });
    const list = thumbnails();
    list[0]!.focus();
    fireEvent.keyDown(list[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(list[1]);
    fireEvent.keyDown(list[1]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(list[0]);
    fireEvent.keyDown(list[0]!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(list[0]);
    fireEvent.keyDown(list[0]!, { key: 'End' });
    expect(document.activeElement).toBe(list[3]);
    fireEvent.keyDown(list[3]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(list[3]);
    fireEvent.keyDown(list[3]!, { key: 'Home' });
    expect(document.activeElement).toBe(list[0]);
    // A button's own Enter and Space press it.
    fireEvent.click(list[0]!);
    expect(props.onGoTo).toHaveBeenCalledWith(0);
  });

  it('scrolls the thumbnail of the page in view into the panel’s view as it changes', () => {
    const scrolled = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrolled;
    const { rerender, props } = show({ page: 0 });
    rerender(<PdfThumbnails {...props} page={2} />);
    expect(scrolled).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(scrolled.mock.contexts.at(-1)).toBe(thumbnails()[2]);
  });

  it('draws each thumbnail upright, fitted to its box at the screen’s pixel ratio', async () => {
    const lines = drawer();
    await act(async () => {
      show({ drawer: lines });
    });
    // A portrait page's height is the box, 160: 160 / 792 points; a landscape page's width, 160 / 842.
    expect(lines.asked).toContainEqual([0, (160 / 792) * 2]);
    expect(lines.asked).toContainEqual([3, (160 / 842) * 2]);
    expect(document.querySelectorAll('[data-pdf-thumbnail-drawn="true"]').length).toBe(4);
  });

  it('draws LiveDoc’s marks over a thumbnail, as on its page', async () => {
    const doc = new Y.Doc();
    const marks = pdfMarksStore(doc);
    await act(async () => {
      show({ marks });
    });
    act(() => {
      addHighlight(
        doc,
        { page: PAGES[1]!.name, stored: { blob: 'ab'.repeat(32) as BlobKey, pages: 4 } },
        { text: 'Lease', quads: [[0, 10, 10, 10, 0, 0, 10, 0]] },
        { author: 'Ada', now: 0, id: 'm1' },
      );
    });
    const second = document.querySelector('[data-pdf-thumbnail="2"]')!;
    expect(second.querySelectorAll('[data-pdf-mark="m1"]').length).toBe(1);
    expect(document.querySelectorAll('[data-pdf-mark]').length).toBe(1);
  });

  it('draws no thumbnail far from the panel’s view, and lets one that leaves before its turn go', async () => {
    class NoneInView extends AllInView {
      override observe(target: Element) {
        this.report([{ target, isIntersecting: false } as unknown as IntersectionObserverEntry]);
      }
    }
    vi.stubGlobal('IntersectionObserver', NoneInView);
    const lines = { ...drawer(), forgetThumbnail: vi.fn() };
    await act(async () => {
      show({ drawer: lines });
    });
    expect(lines.asked).toEqual([]);
    expect(lines.forgetThumbnail).toHaveBeenCalledWith(3);

    vi.stubGlobal('IntersectionObserver', AllInView);
    const waiting = {
      ...drawer(),
      drawThumbnail: () => new Promise<PageBitmap | null>(() => {}),
      forgetThumbnail: vi.fn(),
    };
    const { unmount } = show({ drawer: waiting });
    waiting.forgetThumbnail.mockClear();
    unmount();
    expect(waiting.forgetThumbnail).toHaveBeenCalledTimes(4);
  });

  it('logs a thumbnail it cannot draw and keeps its box and caption', async () => {
    await act(async () => {
      show({ drawer: drawer(null) });
    });
    expect(debugLog).toHaveBeenCalledWith('[pdf] thumbnail-failed page=1');
    expect(thumbnails()[0]!.textContent).toBe('i');
  });

  it('shows who is on a page by their colour, and names them', () => {
    syncPdfPresencePeople([
      { id: 'b', name: 'Ben', color: '#2563eb' },
      { id: 'a', name: 'Ada', color: '#dc2626' },
    ]);
    for (const from of ['a', 'b'])
      receivePdfPresence(from, {
        tabId: 't1',
        page: PAGES[2]!.name,
        mode: 'viewing',
        held: null,
      });
    show();
    const third = thumbnails()[2]!;
    expect(third.getAttribute('aria-description') ?? '').toBe('');
    const describedBy = third.getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)!.textContent).toMatch(
      /^(Ada and Ben|Ben and Ada) are here$/,
    );
    expect(third.querySelectorAll('[data-pdf-thumbnail-person]').length).toBe(2);
    expect(thumbnails()[0]!.getAttribute('aria-describedby')).toBeNull();
  });

  it('shows at most three people’s dots on a page, counting the rest', () => {
    const people = ['a', 'b', 'c', 'd', 'e'];
    syncPdfPresencePeople(people.map((id) => ({ id, name: id.toUpperCase(), color: '#000000' })));
    for (const from of people)
      receivePdfPresence(from, { tabId: 't1', page: PAGES[0]!.name, mode: 'viewing', held: null });
    show();
    const first = thumbnails()[0]!;
    expect(first.querySelectorAll('[data-pdf-thumbnail-person]').length).toBe(3);
    expect(first.textContent).toContain('+2');
  });
});
