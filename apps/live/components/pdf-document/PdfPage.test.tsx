// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages": Selecting text. With Select in hand a mouse or a pen
// hands a press, a drag and presses in a row over as points of the page as the file has it; a finger scrolls; the
// selection is drawn over the page in the shell's focus colour.
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PDF_LONG_PRESS_MS,
  PageName,
  type PageBitmap,
  type PageInfo,
  type PageLink,
  type Quad,
  type TextSelection,
} from '@livedoc/pdf-documents';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import type { PdfPageTap } from '@/lib/pdf-document/usePdfColumnZoom';
import type { PdfPageInk, PdfPageTool } from '@/lib/pdf-document/usePdfMarkTools';
import { PdfPage } from './PdfPage';

vi.mock('@/lib/pdf-document/pdf-paint', () => ({ paintPicture: vi.fn(), REDRAW_SETTLE_MS: 0 }));
vi.mock('./PdfPageTiles', () => ({ PdfPageTiles: () => null }));

const PAGE: PageInfo = {
  name: PageName.ofObject(3),
  width: 612,
  height: 792,
  rotation: 0,
  label: null,
};
// Page space to view space as drawn at 72 dpi: y runs down from the top.
const BITMAP: PageBitmap = {
  width: 612,
  height: 792,
  rgba: new Uint8ClampedArray(4),
  toView: [1, 0, 0, -1, 0, 792],
};
const drawer: PdfPageDrawer = {
  draw: async () => BITMAP,
  forget: () => {},
  drawTile: async () => null,
  forgetTile: () => {},
  drawThumbnail: async () => null,
  forgetThumbnail: () => {},
  firstDrawn: () => new Promise<void>(() => {}),
};

async function page(
  tool: PdfPageTool = 'select',
  selected: readonly Quad[] = [],
  links: readonly PageLink[] = [],
  handles = false,
  marked: TextSelection | null = null,
  ink: PdfPageInk | null = null,
) {
  const onText = vi.fn();
  const onMark = vi.fn();
  const onFollow = vi.fn();
  const onDoubleTap = vi.fn<(index: number, tap: PdfPageTap) => void>();
  const view = render(
    <PdfPage
      index={1}
      count={2}
      page={PAGE}
      cssPerPoint={1}
      left={0}
      top={0}
      turns={0}
      tiles={{} as never}
      wanted
      held
      engine={{
        selectText: async () => marked,
        fileMarks: async () => [],
        links: async () => links,
      }}
      drawer={drawer}
      marks={[]}
      tool={tool}
      onMark={onMark}
      ink={ink}
      selected={selected}
      handles={handles}
      onText={onText}
      texts={null}
      linkName={(target) => `Link to ${target.kind}`}
      onFollow={onFollow}
      found={null}
      onDoubleTap={onDoubleTap}
      register={() => {}}
    />,
  );
  const box = view.container.querySelector<HTMLElement>('[data-pdf-page]')!;
  box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 612, height: 792 }) as DOMRect;
  box.setPointerCapture = vi.fn();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { box, onText, onMark, onFollow, onDoubleTap, view };
}

describe('selecting text on a page', () => {
  it('hands a press, a drag and its end over as points of the page', async () => {
    const { box, onText } = await page();
    expect(box.dataset.pdfPageDrawn).toBe('true');
    fireEvent.pointerDown(box, {
      button: 0,
      pointerType: 'mouse',
      clientX: 72,
      clientY: 92,
      shiftKey: true,
    });
    fireEvent.pointerMove(box, { clientX: 172, clientY: 92 });
    fireEvent.pointerUp(box, { clientX: 172, clientY: 92 });
    fireEvent.pointerMove(box, { clientX: 200, clientY: 92 });
    expect(onText.mock.calls).toEqual([
      [1, { kind: 'press', at: { x: 72, y: 700 }, shift: true, alt: false }],
      [1, { kind: 'drag', at: { x: 172, y: 700 } }],
    ]);
    expect(box.setPointerCapture).toHaveBeenCalled();
    expect(box.className).toContain('cursor-text');
  });

  it('hands two presses in a row over as a word’s, and leaves one press to the drag', async () => {
    const { box, onText } = await page();
    fireEvent.click(box, { detail: 1, clientX: 72, clientY: 92 });
    fireEvent.click(box, { detail: 2, clientX: 72, clientY: 92 });
    expect(onText.mock.calls).toEqual([[1, { kind: 'presses', at: { x: 72, y: 700 }, count: 2 }]]);
  });

  it('leaves a finger, another button and another tool to their own', async () => {
    const { box, onText } = await page();
    fireEvent.pointerDown(box, { button: 0, pointerType: 'touch', clientX: 72, clientY: 92 });
    fireEvent.pointerDown(box, { button: 2, pointerType: 'mouse', clientX: 72, clientY: 92 });
    const other = await page('highlight');
    fireEvent.click(other.box, { detail: 2, clientX: 72, clientY: 92 });
    expect(onText).not.toHaveBeenCalled();
    expect(other.onText).not.toHaveBeenCalled();
  });

  // "Links": over the page with Select in hand, followed on a press; with a mark tool in hand a press marks.
  it('lays the page’s links over it with Select in hand, and follows one on a press', async () => {
    const link: PageLink = { rect: [72, 692, 272, 712], target: { kind: 'file', path: 'a.pdf' } };
    const { view, onFollow, onText } = await page('select', [], [link]);
    const button = await view.findByRole('button', { name: 'Link to file' });
    fireEvent.pointerDown(button, { button: 0, pointerType: 'mouse' });
    fireEvent.click(button, { detail: 2 });
    expect(onFollow).toHaveBeenCalledWith(link.target);
    expect(onText).not.toHaveBeenCalled();
    const marking = await page('highlight', [], [link]);
    await act(async () => {});
    expect(marking.box.querySelector('[data-pdf-link]')).toBeNull();
  });

  it('draws the selection over the page', async () => {
    const quad: Quad = [72, 710, 172, 710, 72, 700, 172, 700];
    const { view } = await page('select', [quad]);
    const drawn = view.container.querySelector('[data-pdf-text-selection] polygon');
    expect(drawn?.getAttribute('points')).toBe('72,82 172,82 172,92 72,92');
  });
});

// "Phone and tablet": a finger's double tap with Select in hand zooms to the column under it; it never selects.
describe('a double tap on a page', () => {
  const tap = (box: HTMLElement, clientX = 72, clientY = 92) => {
    const finger = { pointerType: 'touch', pointerId: 7, clientX, clientY };
    fireEvent.pointerDown(box, finger);
    fireEvent.pointerUp(box, finger);
  };

  it('hands its point on the page over, and the way back to the window', async () => {
    const { box, onDoubleTap, onText } = await page();
    tap(box);
    tap(box);
    fireEvent.click(box, { detail: 2, clientX: 72, clientY: 92 });

    expect(onDoubleTap).toHaveBeenCalledTimes(1);
    const [index, handed] = onDoubleTap.mock.calls[0]!;
    expect(index).toBe(1);
    expect(handed.at).toEqual({ x: 72, y: 700 });
    expect(handed.client).toEqual({ x: 72, y: 92 });
    expect(handed.toClient({ x: 100, y: 692 })).toEqual({ x: 100, y: 100 });
    // The first tap clears as a press does; the two never select a word.
    expect(onText).toHaveBeenCalledTimes(1);
    expect(onText).not.toHaveBeenCalledWith(1, expect.objectContaining({ kind: 'presses' }));
  });

  it('is none for one tap, a scroll the browser took, or a mark tool in hand', async () => {
    const { box, onDoubleTap } = await page();
    tap(box);
    fireEvent.pointerDown(box, { pointerType: 'touch', pointerId: 7, clientX: 72, clientY: 92 });
    fireEvent.pointerCancel(box, { pointerType: 'touch', pointerId: 7 });
    tap(box);
    const marking = await page('highlight');
    tap(marking.box);
    tap(marking.box);

    expect(onDoubleTap).not.toHaveBeenCalled();
    expect(marking.onDoubleTap).not.toHaveBeenCalled();
  });
});

// "Phone and tablet": a long press selects the word under the finger; a tap clears; a finger's selection has handles.
describe('a finger’s selection on a page', () => {
  it('hands a long press over as the point under the finger', async () => {
    const { box, onText } = await page();
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(box, { pointerType: 'touch', pointerId: 9, clientX: 72, clientY: 92 });
      act(() => {
        vi.advanceTimersByTime(PDF_LONG_PRESS_MS);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(onText).toHaveBeenCalledWith(1, { kind: 'long-press', at: { x: 72, y: 700 } });
  });

  it('hands a tap over as a press, which clears the selection', async () => {
    const { box, onText } = await page();
    const finger = { pointerType: 'touch', pointerId: 7, clientX: 72, clientY: 92 };
    fireEvent.pointerDown(box, finger);
    fireEvent.pointerUp(box, finger);
    expect(onText).toHaveBeenCalledWith(1, {
      kind: 'press',
      at: { x: 72, y: 700 },
      shift: false,
      alt: false,
    });
  });

  it('draws handles for a finger’s selection, and hands a dragged one over', async () => {
    const quads: Quad[] = [[72, 708, 100, 708, 72, 700, 100, 700]];
    const { view, onText } = await page('select', quads, [], true);
    const end = view.container.querySelector<HTMLElement>('[data-pdf-handle="end"]')!;
    end.setPointerCapture = vi.fn();
    fireEvent.pointerDown(end, { pointerId: 2 });
    fireEvent.pointerMove(end, { clientX: 120, clientY: 122 });
    expect(onText).toHaveBeenCalledWith(1, { kind: 'handle', end: 'end', at: { x: 120, y: 692 } });
    const mouse = await page('select', quads);
    expect(mouse.view.container.querySelector('[data-pdf-handle]')).toBeNull();
  });
});

// marks.md "Making a mark": a drag across a line's text with a text tool in hand marks what it covered.
describe('marking text on a page', () => {
  it('hands the text a drag covered over to be marked, with any text tool in hand', async () => {
    const covered: TextSelection = {
      text: 'Lease',
      quads: [[72, 700, 120, 700, 72, 690, 120, 690]],
    };
    const { box, onMark } = await page('squiggly', [], [], false, covered);
    expect(box.className).toContain('touch-none');
    fireEvent.pointerDown(box, { button: 0, pointerType: 'mouse', clientX: 72, clientY: 92 });
    await act(async () => {
      fireEvent.pointerUp(box, { button: 0, pointerType: 'mouse', clientX: 120, clientY: 92 });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onMark).toHaveBeenCalledWith(1, covered);
  });
});

// marks.md "Making a mark": A Drawing: a stroke of the pointer, shown as it is drawn, handed over as it ends.
describe('drawing on a page', () => {
  const ink = (onDraw = vi.fn()): PdfPageInk => ({
    colour: '#d93025',
    opacity: 1,
    width: 2,
    onDraw,
  });
  const at = (x: number, y: number, pointerId = 1) => ({
    button: 0,
    pointerType: 'pen',
    pointerId,
    clientX: x,
    clientY: y,
  });

  it('hands a stroke over in the page’s points once it ends, shown as it is drawn', async () => {
    const onDraw = vi.fn();
    const { box, view, onMark } = await page('drawing', [], [], false, null, ink(onDraw));
    expect(box.className).toContain('cursor-crosshair touch-none');
    fireEvent.pointerDown(box, at(72, 92));
    fireEvent.pointerMove(box, at(100, 92));
    // Another pointer moving is not this stroke.
    fireEvent.pointerMove(box, at(300, 300, 2));
    fireEvent.pointerMove(box, at(100.1, 92));
    expect(view.container.querySelector('[data-pdf-ink-preview]')).not.toBeNull();
    fireEvent.pointerUp(box, at(100, 92));
    expect(onDraw).toHaveBeenCalledWith(1, [72, 700, 100, 700], expect.any(Number));
    expect(view.container.querySelector('[data-pdf-ink-preview]')).toBeNull();
    // The next stroke is a stroke of its own.
    fireEvent.pointerDown(box, at(80, 92));
    fireEvent.pointerMove(box, at(90, 92));
    fireEvent.pointerUp(box, at(90, 92));
    expect(onDraw).toHaveBeenLastCalledWith(1, [80, 700, 90, 700], expect.any(Number));
    expect(onMark).not.toHaveBeenCalled();
  });

  it('lets a stroke go on a cancel, a second finger, or a press that is not the main one', async () => {
    const onDraw = vi.fn();
    const { box } = await page('drawing', [], [], false, null, ink(onDraw));
    fireEvent.pointerDown(box, at(72, 92));
    fireEvent.pointerCancel(box, at(72, 92));
    fireEvent.pointerDown(box, at(72, 92));
    fireEvent.pointerDown(box, at(80, 92, 2));
    fireEvent.pointerUp(box, at(72, 92));
    fireEvent.pointerDown(box, { ...at(72, 92), button: 2 });
    fireEvent.pointerUp(box, { ...at(72, 92), button: 2 });
    expect(onDraw).not.toHaveBeenCalled();
  });
});
