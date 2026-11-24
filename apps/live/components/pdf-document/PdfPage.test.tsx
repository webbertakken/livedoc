// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages": Selecting text. With Select in hand a mouse or a pen
// hands a press, a drag and presses in a row over as points of the page as the file has it; a finger scrolls; the
// selection is drawn over the page in the shell's focus colour.
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PageName,
  type PageBitmap,
  type PageInfo,
  type PageLink,
  type Quad,
} from '@livedoc/pdf-documents';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import type { PdfPageTap } from '@/lib/pdf-document/usePdfColumnZoom';
import { PdfPage, type PdfPageTool } from './PdfPage';

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
) {
  const onText = vi.fn();
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
      engine={{ selectText: async () => null, fileMarks: async () => [], links: async () => links }}
      drawer={drawer}
      marks={[]}
      tool={tool}
      onHighlight={vi.fn()}
      selected={selected}
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
  return { box, onText, onFollow, onDoubleTap, view };
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
    expect(onText).not.toHaveBeenCalled();
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
