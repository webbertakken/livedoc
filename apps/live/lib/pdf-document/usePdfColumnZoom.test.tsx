// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet": a double tap zooms to the column under the finger
// and back; with no column there, one zoom step in about the finger. Logged and counted as `Custom`.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PageText, type PagePoint } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { PDF_PAGES_PAD_PX } from './pdf-page-layout';
import type { PdfPageTexts } from './pdf-page-texts';
import type { PdfZoom } from './pdf-view';
import { usePdfColumnZoom, type PdfPageTap } from './usePdfColumnZoom';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

// One line of ten characters, 10 points wide each, from x 100 to 200, 8 tall from y 700.
const line = PageText.of(
  Array.from({ length: 10 }, () => 'a'.codePointAt(0)!),
  Array.from({ length: 10 }, (_, at) => [100 + at * 10, 700, 110 + at * 10, 708]).flat(),
);

// The pages' scroller at client (10, 20), 400 wide; a page drawn at 2 CSS pixels a point from client (0, 0), flipped.
function setUp(text: PageText | null, zoom: PdfZoom = 'fit-width') {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({ left: 10, top: 20 }) as DOMRect;
  const viewer = {
    element,
    zoomBy: vi.fn(),
    zoomTo: vi.fn(),
    view: {
      zoom,
      display: { across: 1 as const, continuous: true, cover: false },
      turns: 0 as const,
    },
    scale: 1,
    viewport: { width: 400, height: 800 },
  };
  const texts = { read: vi.fn(async () => text) } as unknown as PdfPageTexts;
  const hook = renderHook(({ now }) => usePdfColumnZoom(now, texts), {
    initialProps: { now: viewer },
  });
  const tap = (at: PagePoint): PdfPageTap => ({
    at,
    client: { x: at.x * 2, y: (792 - at.y) * 2 },
    toClient: (point) => ({ x: point.x * 2, y: (792 - point.y) * 2 }),
  });
  return { viewer, hook, tap, texts };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePdfColumnZoom', () => {
  it('fills the view with the column under the finger, its left at the view’s left', async () => {
    const { viewer, hook, tap } = setUp(line);
    // The finger at page x 150: client 300, the column from client 200 to 400, the view's 190 to 390.
    await act(async () => hook.result.current(0, tap({ x: 150, y: 704 })));

    const factor = (400 - 2 * PDF_PAGES_PAD_PX) / 200;
    expect(viewer.zoomBy).toHaveBeenCalledWith(
      factor,
      { x: 290, y: 156 },
      { x: PDF_PAGES_PAD_PX + 100 * factor, y: 156 },
    );
    expect(track).toHaveBeenCalledWith('Pdf', 'Zoomed', 'Custom');
    expect(debugLog).toHaveBeenCalledWith('[pdf] view-double-tapped column=yes back=no');
  });

  it('zooms one step in about the finger where no column is under it', async () => {
    const { viewer, hook, tap } = setUp(null);
    await act(async () => hook.result.current(0, tap({ x: 150, y: 704 })));

    expect(viewer.zoomBy).toHaveBeenCalledWith(1.25, { x: 290, y: 156 }, { x: 290, y: 156 });
    expect(debugLog).toHaveBeenCalledWith('[pdf] view-double-tapped column=no back=no');
  });

  it('goes back to the zoom before while the zoom is still the one it made', async () => {
    const { viewer, hook, tap } = setUp(null);
    await act(async () => hook.result.current(0, tap({ x: 150, y: 704 })));
    hook.rerender({ now: { ...viewer, scale: 1.25, view: { ...viewer.view, zoom: 1.25 } } });
    await act(async () => hook.result.current(0, tap({ x: 150, y: 704 })));

    expect(viewer.zoomTo).toHaveBeenCalledWith('fit-width', 'Custom', { x: 290, y: 156 });
    expect(debugLog).toHaveBeenCalledWith('[pdf] view-double-tapped column=no back=yes');
  });

  it('zooms anew once the zoom has changed since', async () => {
    const { viewer, hook, tap } = setUp(null);
    await act(async () => hook.result.current(0, tap({ x: 150, y: 704 })));
    hook.rerender({ now: { ...viewer, scale: 2, view: { ...viewer.view, zoom: 2 } } });
    await act(async () => hook.result.current(0, tap({ x: 150, y: 704 })));

    expect(viewer.zoomTo).not.toHaveBeenCalled();
    expect(viewer.zoomBy).toHaveBeenCalledTimes(2);
  });

  it('zooms one step in while the pages have no text read', async () => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
    const zoomBy = vi.fn();
    const viewer = {
      element,
      zoomBy,
      zoomTo: vi.fn(),
      view: {
        zoom: 1,
        display: { across: 1 as const, continuous: true, cover: false },
        turns: 0 as const,
      },
      scale: 1,
      viewport: { width: 400, height: 800 },
    };
    const { result } = renderHook(() => usePdfColumnZoom(viewer, null));
    const at = { x: 5, y: 5 };
    await act(async () => result.current(0, { at, client: at, toClient: (point) => point }));

    expect(zoomBy).toHaveBeenCalledWith(1.25, at, at);
  });

  it('does nothing before the pages are laid out', async () => {
    const { viewer, hook, tap, texts } = setUp(line);
    hook.rerender({ now: { ...viewer, element: null as unknown as HTMLDivElement } });
    await act(async () => hook.result.current(0, tap({ x: 150, y: 704 })));

    expect(texts.read).not.toHaveBeenCalled();
    expect(viewer.zoomBy).not.toHaveBeenCalled();
  });
});
