// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "The pages": Selecting text. With Select in hand a mouse or a pen
// hands a press, a drag and presses in a row over as points of the page as the file has it; a finger scrolls; the
// selection is drawn over the page in the shell's focus colour.
import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PDF_LONG_PRESS_MS,
  Mark,
  PageName,
  type PageBitmap,
  type PageInfo,
  type FileMark,
  type PageLink,
  type Quad,
  type TextSelection,
} from '@livedoc/pdf-documents';
import type { PdfPageDrawer } from '@/lib/pdf-document/pdf-page-drawer';
import type { PdfPageTap } from '@/lib/pdf-document/usePdfColumnZoom';
import type { PdfPageInk, PdfPageTool } from '@/lib/pdf-document/usePdfMarkTools';
import type { PdfPageShaping } from '@/lib/pdf-document/usePdfPageShape';
import type { PdfPageStamping } from '@/lib/pdf-document/usePdfStampTool';
import type { PdfPageErasing } from '@/lib/pdf-document/usePdfErase';
import type { PdfPageTyping } from '@/lib/pdf-document/usePdfTyping';
import type { PdfPageTexts } from '@/lib/pdf-document/pdf-page-texts';
import type { PdfPageChoosing } from '@/lib/pdf-document/usePdfMarkSelection';
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

type Choosing = {
  marks?: readonly Mark[];
  // Which of `marks` are the file's own, drawn by the picture.
  fileOwn?: readonly string[];
  // What the engine reads of the file's own marks.
  fileMarks?: readonly FileMark[];
  chosen?: readonly string[];
  choosing?: PdfPageChoosing | null;
  // The pages' text, where a test reads it.
  texts?: PdfPageTexts | null;
  // Where Erase's drags go, with Erase in hand.
  erasing?: PdfPageErasing | null;
};

async function page(
  tool: PdfPageTool = 'select',
  selected: readonly Quad[] = [],
  links: readonly PageLink[] = [],
  handles = false,
  marked: TextSelection | null = null,
  ink: PdfPageInk | null = null,
  shaping: PdfPageShaping | null = null,
  typing: PdfPageTyping | null = null,
  stamping: PdfPageStamping | null = null,
  {
    marks = [],
    fileOwn = [],
    fileMarks = [],
    chosen = [],
    choosing = null,
    texts = null,
    erasing = null,
  }: Choosing = {},
) {
  const onFileMarks = vi.fn();
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
        fileMarks: async () => fileMarks,
        links: async () => links,
      }}
      drawer={drawer}
      marks={{ marks, fileOwn: new Set(fileOwn) }}
      onFileMarks={onFileMarks}
      tool={tool}
      onMark={onMark}
      ink={ink}
      shaping={shaping}
      typing={typing}
      stamping={stamping}
      erasing={erasing}
      selected={selected}
      handles={handles}
      chosen={chosen}
      choosing={choosing}
      onText={onText}
      texts={texts}
      linkName={(target) => `Link to ${target.kind}`}
      onFollow={onFollow}
      found={null}
      onDoubleTap={onDoubleTap}
      register={() => {}}
      holds={[]}
      peerTexts={[]}
      peerDrafts={[]}
    />,
  );
  const box = view.container.querySelector<HTMLElement>('[data-pdf-page]')!;
  box.getBoundingClientRect = () => ({ left: 0, top: 0, width: 612, height: 792 }) as DOMRect;
  box.setPointerCapture = vi.fn();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return { box, onText, onMark, onFollow, onDoubleTap, onFileMarks, view };
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
  const ink = (onDraw = vi.fn(), onStroke = vi.fn()): PdfPageInk => ({
    colour: '#d93025',
    opacity: 1,
    width: 2,
    onDraw,
    onStroke,
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
    expect(view.container.querySelector('[data-pdf-draft="drawing"]')).not.toBeNull();
    fireEvent.pointerUp(box, at(100, 92));
    expect(onDraw).toHaveBeenCalledWith(1, [72, 700, 100, 700], expect.any(Number));
    expect(view.container.querySelector('[data-pdf-draft="drawing"]')).toBeNull();
    // The next stroke is a stroke of its own.
    fireEvent.pointerDown(box, at(80, 92));
    fireEvent.pointerMove(box, at(90, 92));
    fireEvent.pointerUp(box, at(90, 92));
    expect(onDraw).toHaveBeenLastCalledWith(1, [80, 700, 90, 700], expect.any(Number));
    expect(onMark).not.toHaveBeenCalled();
  });

  // live-editing-and-storage.md "A mark as it is made": each point told as it goes, for collaborators, then the end.
  it('tells the stroke as it grows, and its end after it is handed over', async () => {
    const order: string[] = [];
    const onDraw = vi.fn(() => void order.push('draw'));
    const onStroke = vi.fn((_index: number, stroke: readonly number[] | null) => {
      order.push(stroke ? `stroke ${stroke.length}` : 'end');
    });
    const { box } = await page('drawing', [], [], false, null, ink(onDraw, onStroke));
    fireEvent.pointerDown(box, at(72, 92));
    fireEvent.pointerMove(box, at(100, 92));
    fireEvent.pointerUp(box, at(100, 92));
    expect(onStroke).toHaveBeenNthCalledWith(1, 1, [72, 700]);
    expect(onStroke).toHaveBeenNthCalledWith(2, 1, [72, 700, 100, 700]);
    expect(order).toEqual(['stroke 2', 'stroke 4', 'draw', 'end']);
    // A stroke let go unmade ends too.
    fireEvent.pointerDown(box, at(72, 92));
    fireEvent.pointerCancel(box, at(72, 92));
    expect(onStroke).toHaveBeenLastCalledWith(1, null);
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

// marks.md "Changing a mark": Erase dragged across a Drawing's strokes, those passed over drawn gone at once and handed
// over once let go; a cancel rubs out none.
describe('erasing on a page', () => {
  const drawing = Mark.drawing({
    id: 'd',
    page: PAGE.name,
    strokes: [
      [50, 700, 150, 700],
      [50, 600, 150, 600],
    ],
    width: 2,
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 1,
  })!;
  const at = (x: number, y: number) => ({
    button: 0,
    pointerType: 'mouse',
    pointerId: 1,
    clientX: x,
    clientY: y,
  });
  const lines = (view: ReturnType<typeof render>) =>
    view.container.querySelectorAll('[data-pdf-mark="d"] polyline').length;

  it('shows the strokes passed over gone and hands them over once let go', async () => {
    const onErase = vi.fn();
    const { box, view, onMark } = await page('erase', [], [], false, null, null, null, null, null, {
      marks: [drawing],
      erasing: { onErase },
    });
    expect(box.className).toContain('cursor-crosshair touch-none');
    expect(lines(view)).toBe(2);
    fireEvent.pointerDown(box, at(100, 70));
    fireEvent.pointerMove(box, at(100, 110));
    expect(lines(view)).toBe(1);
    fireEvent.pointerUp(box, at(100, 110));
    expect(onErase).toHaveBeenCalledWith(1, [{ mark: drawing, gone: [0] }]);
    expect(lines(view)).toBe(2);
    expect(onMark).not.toHaveBeenCalled();
  });

  it('rubs out none on a cancel, or for a drag that passes nothing', async () => {
    const onErase = vi.fn();
    const { box, view } = await page('erase', [], [], false, null, null, null, null, null, {
      marks: [drawing],
      erasing: { onErase },
    });
    fireEvent.pointerDown(box, at(100, 70));
    fireEvent.pointerMove(box, at(100, 300));
    expect(view.container.querySelector('[data-pdf-mark="d"]')).toBeNull();
    fireEvent.pointerCancel(box, at(100, 300));
    expect(lines(view)).toBe(2);
    fireEvent.pointerDown(box, at(400, 400));
    fireEvent.pointerUp(box, at(400, 410));
    expect(onErase).not.toHaveBeenCalled();
  });
});

// marks.md "Making a mark": a line or shape dragged with a shape tool in hand, shown as it is dragged, handed over in
// the page's points once let go, held to the page.
describe('dragging a shape on a page', () => {
  const at = (x: number, y: number, over: Record<string, unknown> = {}) => ({
    button: 0,
    pointerType: 'mouse',
    pointerId: 1,
    clientX: x,
    clientY: y,
    ...over,
  });

  it('hands the shape over in the page’s points, shown while dragged, and marks no text', async () => {
    const onShape = vi.fn();
    const shaping: PdfPageShaping = {
      kind: 'rectangle',
      colour: '#d93025',
      opacity: 1,
      width: 2,
      onShape,
    };
    const { box, view, onMark } = await page('rectangle', [], [], false, null, null, shaping);
    expect(box.className).toContain('cursor-crosshair touch-none');
    fireEvent.pointerDown(box, at(72, 92));
    fireEvent.pointerMove(box, at(172, 9999));
    expect(view.container.querySelector('[data-pdf-draft="rectangle"]')).not.toBeNull();
    fireEvent.pointerUp(box, at(172, 9999));
    // Page one is 792 points high: the drag past its foot stops at it, y 0 in page space.
    const [[index, shape]] = onShape.mock.calls as [[number, { rect: number[] }]];
    expect(index).toBe(1);
    // A foot at y 0 may come back as -0: the same place.
    expect({ ...shape, rect: shape.rect.map((n) => n + 0) }).toEqual({
      kind: 'rectangle',
      rect: [72, 0, 172, 700],
      width: 2,
    });
    expect(view.container.querySelector('[data-pdf-draft]')).toBeNull();
    fireEvent.pointerDown(box, at(72, 92));
    fireEvent.pointerCancel(box, at(72, 92));
    expect(onShape).toHaveBeenCalledOnce();
    expect(onMark).not.toHaveBeenCalled();
  });
});

// marks.md "Making a mark": with the Text tool in hand a press opens a box for typing at once; a drag marks no text.
describe('typing on a page', () => {
  it('lays a typing layer over the page with Text in hand, which opens a box and marks no text', async () => {
    const typing: PdfPageTyping = {
      kind: 'text',
      colour: '#d93025',
      opacity: 1,
      size: 12,
      tip: null,
      onTip: vi.fn(),
      onWords: vi.fn(),
      onTyped: vi.fn(),
      id: null,
    };
    const { view, onMark } = await page('text', [], [], false, null, null, null, typing);
    const layer = view.container.querySelector<HTMLElement>('[data-pdf-typing-layer="text"]')!;
    layer.setPointerCapture = vi.fn();
    const at = { button: 0, pointerId: 1, clientX: 72, clientY: 92 };
    fireEvent.pointerDown(layer, at);
    fireEvent.pointerUp(layer, at);
    expect(view.container.querySelector('textarea[data-pdf-typing="text"]')).not.toBeNull();
    expect(onMark).not.toHaveBeenCalled();
  });

  // live-editing-and-storage.md "A mark as it is made": the person typing sees the box, never the mark beneath it.
  it('leaves the mark being typed to its box, drawing every other', async () => {
    const typed = (id: string) =>
      Mark.text({
        id,
        page: PAGE.name,
        rect: [72, 600, 272, 640],
        words: 'Check',
        size: 12,
        colour: '#d93025',
        opacity: 1,
        author: 'Ada',
        createdAt: 0,
      })!;
    const typing: PdfPageTyping = {
      kind: 'text',
      colour: '#d93025',
      opacity: 1,
      size: 12,
      tip: null,
      onTip: vi.fn(),
      onWords: vi.fn(),
      onTyped: vi.fn(),
      id: 't1',
    };
    const { view } = await page('text', [], [], false, null, null, null, typing, null, {
      marks: [typed('t1'), typed('t2')],
    });
    expect(view.container.querySelector('[data-pdf-mark="t1"]')).toBeNull();
    expect(view.container.querySelector('[data-pdf-mark="t2"]')).not.toBeNull();
  });
});

// marks.md "Stamps": with the Stamp tool in hand a press places the stamp where it lands, in the page as the file has it.
describe('placing a stamp on a page', () => {
  it('hands a press over in the page’s points, with the page’s box, and marks no text', async () => {
    const onStamp = vi.fn();
    const { box, onMark } = await page('stamp', [], [], false, null, null, null, null, { onStamp });
    expect(box.className).toContain('cursor-crosshair touch-none');
    fireEvent.pointerDown(box, { button: 0, pointerId: 1, clientX: 72, clientY: 92 });
    fireEvent.pointerUp(box, { button: 0, pointerId: 1, clientX: 72, clientY: 92 });
    expect(onStamp).toHaveBeenCalledWith(1, { x: 72, y: 700 }, [0, 0, 612, 792]);
    fireEvent.pointerDown(box, { button: 2, pointerId: 1, clientX: 72, clientY: 92 });
    expect(onStamp).toHaveBeenCalledOnce();
    expect(onMark).not.toHaveBeenCalled();
  });
});

// marks.md "Changing a mark": with Select in hand a press on a mark selects it and puts the keys on it, a drag moves the
// selection once let go, outlined as it goes; a press on nothing lets the marks go and selects text.
describe('changing a mark on a page', () => {
  const arrow = Mark.line('arrow', {
    id: 'a1',
    page: PAGE.name,
    line: [100, 700, 200, 700],
    width: 2,
    colour: '#d93025',
    opacity: 1,
    author: 'Ada',
    createdAt: 0,
  })!;
  const choosing = (): PdfPageChoosing => ({
    mayChange: () => true,
    chooseAll: vi.fn(),
    choose: vi.fn(),
    letGo: vi.fn(),
    leave: vi.fn(),
    move: vi.fn(),
    reshape: vi.fn(),
    remove: vi.fn(),
  });

  it('selects a mark pressed, puts the keys on it, and moves it by a drag', async () => {
    const chose = choosing();
    const { box, onText, view } = await page(
      'select',
      [],
      [],
      false,
      null,
      null,
      null,
      null,
      null,
      {
        marks: [arrow],
        chosen: ['a1'],
        choosing: chose,
      },
    );
    const control = view.getByRole('button', { name: 'Arrow by Ada' });
    fireEvent.pointerDown(box, {
      button: 0,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 150,
      clientY: 92,
    });
    expect(chose.choose).toHaveBeenCalledWith(1, 'a1', false);
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 160, clientY: 82 });
    expect(view.container.querySelector('[data-pdf-mark-outline="a1"]')!.getAttribute('x')).toBe(
      '106',
    );
    fireEvent.pointerUp(box, { pointerId: 1, clientX: 160, clientY: 82 });
    expect(chose.move).toHaveBeenCalledWith(1, { x: 10, y: 10 });
    expect(document.activeElement).toBe(control);
    expect(onText).not.toHaveBeenCalled();
    fireEvent.keyDown(control, { key: 'ArrowRight' });
    expect(chose.move).toHaveBeenLastCalledWith(1, { x: 1, y: 0 });
  });

  // marks.md "Changing a mark": one selected mark has handles; a handle dragged or ⌥ with an arrow key resizes it.
  it('resizes the one selected mark by a handle and by ⌥ with an arrow key', async () => {
    const chose = choosing();
    const { view } = await page('select', [], [], false, null, null, null, null, null, {
      marks: [arrow],
      chosen: ['a1'],
      choosing: chose,
    });
    const end = view.container.querySelector<HTMLElement>('[data-pdf-mark-handle="end"]')!;
    end.setPointerCapture = vi.fn();
    fireEvent.pointerDown(end, { pointerId: 2, clientX: 200, clientY: 92 });
    fireEvent.pointerMove(end, { pointerId: 2, clientX: 250, clientY: 62 });
    expect(
      view.container.querySelector('[data-pdf-mark="a1"] polyline')!.getAttribute('points'),
    ).toContain('250,62');
    fireEvent.pointerUp(end, { pointerId: 2, clientX: 250, clientY: 62 });
    expect(chose.reshape).toHaveBeenCalledWith(1, 'a1', { line: [100, 700, 250, 730] });
    fireEvent.keyDown(view.getByRole('button', { name: 'Arrow by Ada' }), {
      key: 'ArrowRight',
      altKey: true,
    });
    expect(chose.reshape).toHaveBeenLastCalledWith(1, 'a1', { line: [100, 700, 201, 700] });
  });

  it('shows no handles for two marks selected', async () => {
    const other = Mark.line('line', { ...arrow, id: 'b1' })!;
    const { view } = await page('select', [], [], false, null, null, null, null, null, {
      marks: [arrow, other],
      chosen: ['a1', 'b1'],
      choosing: choosing(),
    });
    expect(view.container.querySelector('[data-pdf-mark-handle]')).toBeNull();
  });

  it('lets the marks go for a press on nothing, which selects text', async () => {
    const chose = choosing();
    const { box, onText } = await page('select', [], [], false, null, null, null, null, null, {
      marks: [arrow],
      choosing: chose,
    });
    fireEvent.pointerDown(box, {
      button: 0,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 400,
      clientY: 400,
    });
    expect(chose.letGo).toHaveBeenCalled();
    expect(onText).toHaveBeenCalledWith(1, expect.objectContaining({ kind: 'press' }));
  });

  // marks.md "Changing a mark": a drag from empty space draws a box that selects the marks it touches.
  it('draws a box from empty space and selects the marks it touches, the text left alone', async () => {
    const chose = choosing();
    const texts: PdfPageTexts = { read: async () => null, tags: async () => null };
    const { box, onText, view } = await page(
      'select',
      [],
      [],
      false,
      null,
      null,
      null,
      null,
      null,
      {
        marks: [arrow],
        choosing: chose,
        texts,
      },
    );
    fireEvent.pointerDown(box, {
      button: 0,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    });
    await act(async () => {});
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 300, clientY: 120 });
    expect(view.container.querySelector('[data-pdf-mark-box]')).not.toBeNull();
    fireEvent.pointerUp(box, { pointerId: 1, clientX: 300, clientY: 120 });
    expect(chose.chooseAll).toHaveBeenCalledWith(1, ['a1'], false);
    expect(view.container.querySelector('[data-pdf-mark-box]')).toBeNull();
    expect(onText).not.toHaveBeenCalledWith(1, expect.objectContaining({ kind: 'drag' }));
  });

  // marks.md "Changing a mark": a finger's tap selects the mark it lands on.
  it('selects the mark a finger taps, and leaves the text alone', async () => {
    const chose = choosing();
    const { box, onText } = await page('select', [], [], false, null, null, null, null, null, {
      marks: [arrow],
      choosing: chose,
    });
    const finger = { pointerType: 'touch', pointerId: 7, clientX: 150, clientY: 100 };
    fireEvent.pointerDown(box, finger);
    fireEvent.pointerUp(box, finger);
    expect(chose.choose).toHaveBeenCalledWith(1, 'a1', false);
    expect(onText).not.toHaveBeenCalled();
  });

  // marks.md "Share roles": Select reaches a Participant's own marks alone; a press on another's falls to the text.
  it('passes a press on a mark the session may not change to the text beneath', async () => {
    const chose = { ...choosing(), mayChange: () => false };
    const { box, onText } = await page('select', [], [], false, null, null, null, null, null, {
      marks: [arrow],
      choosing: chose,
    });
    fireEvent.pointerDown(box, {
      button: 0,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 150,
      clientY: 92,
    });
    expect(chose.choose).not.toHaveBeenCalled();
    expect(onText).toHaveBeenCalledWith(1, expect.objectContaining({ kind: 'press' }));
  });

  // marks.md "Changing a mark": marks the file arrived with behave the same; the picture draws them.
  it('selects and drags a mark the file arrived with, drawn by the picture until dragged', async () => {
    const chose = choosing();
    const theirs = Mark.line('arrow', { ...arrow, id: 'o:9' })!;
    const read = { id: 'o:9', subtype: 'line', mark: theirs } as unknown as FileMark;
    const unread = { id: 'o:10', subtype: 'caret', mark: null } as unknown as FileMark;
    const { box, view, onFileMarks } = await page(
      'select',
      [],
      [],
      false,
      null,
      null,
      null,
      null,
      null,
      { marks: [theirs], fileOwn: ['o:9'], fileMarks: [read, unread], choosing: chose },
    );
    expect(onFileMarks).toHaveBeenCalledWith(PageName.ofObject(3), [theirs]);
    expect(view.container.querySelector('[data-pdf-mark="o:9"]')).toBeNull();
    expect(view.getByRole('button', { name: 'Arrow by Ada' })).toBeTruthy();
    fireEvent.pointerDown(box, {
      button: 0,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 150,
      clientY: 92,
    });
    expect(chose.choose).toHaveBeenCalledWith(1, 'o:9', false);
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 160, clientY: 82 });
    expect(view.container.querySelector('[data-pdf-mark="o:9"]')).not.toBeNull();
    fireEvent.pointerUp(box, { pointerId: 1, clientX: 160, clientY: 82 });
    expect(chose.move).toHaveBeenCalledWith(1, { x: 10, y: 10 });
  });

  it('hands a drag that began on a text mark to the text', async () => {
    const highlight = Mark.highlight({
      ...arrow,
      id: 'h1',
      quads: [[100, 716, 200, 716, 100, 700, 200, 700]],
      text: 'x',
    })!;
    const { box, onText } = await page('select', [], [], false, null, null, null, null, null, {
      marks: [highlight],
      choosing: choosing(),
    });
    fireEvent.pointerDown(box, {
      button: 0,
      pointerType: 'mouse',
      pointerId: 1,
      clientX: 150,
      clientY: 84,
    });
    fireEvent.pointerMove(box, { pointerId: 1, clientX: 180, clientY: 84 });
    expect(onText).toHaveBeenNthCalledWith(1, 1, {
      kind: 'press',
      at: { x: 150, y: 708 },
      shift: false,
      alt: false,
    });
    expect(onText).toHaveBeenNthCalledWith(2, 1, { kind: 'drag', at: { x: 180, y: 708 } });
    fireEvent.pointerCancel(box, { pointerId: 1 });
  });
});
