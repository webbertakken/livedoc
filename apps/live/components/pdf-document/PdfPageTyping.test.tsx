// @vitest-environment jsdom
// docs/specs/035-pdf-documents/marks.md "Making a mark": a Text by a press or a drag, opened for typing at once; a
// Callout by a press on what is meant, then a press for its words; Enter a new line; Escape, or a press anywhere else,
// ends the typing and that press makes nothing else; ended with nothing typed, no mark; the writing direction follows
// what is typed; the box is typed turned with a turned view.
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  PDF_TEXT_BOX_WIDTH_PT,
  PDF_TEXT_PADDING_PT,
  TYPED_LINE_HEIGHT,
  type PageMatrix,
  type PagePoint,
} from '@livedoc/pdf-documents';
import { PdfLookContext } from '@/lib/pdf-document/pdf-look';
import type { PdfPageTyping as Typing } from '@/lib/pdf-document/usePdfTyping';
import { PdfPageTyping } from './PdfPageTyping';

// Page space to view space as drawn at 72 dpi: y runs down from the top of a 612 by 792 page.
const UPRIGHT: PageMatrix = [1, 0, 0, -1, 0, 792];
const SHOWN = { width: 612, height: 792 };
const SCREEN = { left: 0, top: 0, right: 612, bottom: 792 };
const ONE_LINE = 2 * PDF_TEXT_PADDING_PT + TYPED_LINE_HEIGHT * 12;

function typingOf(over: Partial<Typing> = {}): Typing {
  return {
    kind: 'text',
    colour: '#d93025',
    opacity: 1,
    size: 12,
    tip: null,
    onTip: vi.fn(),
    onTyped: vi.fn(),
    ...over,
  };
}

type Around = {
  matrix?: PageMatrix;
  look?: 'paper' | 'dark';
  pointAt?: (client: { x: number; y: number }) => PagePoint | null;
  screenBox?: () => typeof SCREEN | null;
};

function layer(
  typing: Typing,
  {
    matrix = UPRIGHT,
    look = 'paper',
    pointAt = (client) => ({ x: client.x, y: 792 - client.y }),
    screenBox = () => SCREEN,
  }: Around = {},
) {
  // What the pages around the layer hear of its keys.
  const keys = vi.fn();
  const view = render(
    <PdfLookContext.Provider value={look}>
      <div onKeyDown={keys}>
        <PdfPageTyping
          index={1}
          typing={typing}
          matrix={matrix}
          shown={SHOWN}
          cssPerPoint={2}
          pointAt={pointAt}
          screenBox={screenBox}
        />
      </div>
    </PdfLookContext.Provider>,
  );
  const box = view.container.querySelector<HTMLElement>('[data-pdf-typing-layer]')!;
  box.setPointerCapture = vi.fn();
  const area = () => view.container.querySelector<HTMLTextAreaElement>('textarea');
  return { view, box, area, keys };
}

const at = (x: number, y: number, over: Record<string, unknown> = {}) => ({
  button: 0,
  pointerId: 1,
  clientX: x,
  clientY: y,
  ...over,
});

/** A press and its let-go at one place. */
function press(box: HTMLElement, x: number, y: number) {
  fireEvent.pointerDown(box, at(x, y));
  fireEvent.pointerUp(box, at(x, y));
}

describe('a Text opened by a press', () => {
  it('opens for typing at once, PDF_TEXT_BOX_WIDTH_PT wide from the press, upright, in the tool’s look', () => {
    const { box, area } = layer(typingOf());
    press(box, 72, 92);
    const typed = area()!;
    expect(document.activeElement).toBe(typed);
    expect(typed.getAttribute('aria-label')).toBe('Text');
    expect(typed.dir).toBe('auto');
    expect(typed.style.left).toBe('144px');
    expect(typed.style.top).toBe('184px');
    expect(typed.style.width).toBe(`${PDF_TEXT_BOX_WIDTH_PT * 2}px`);
    expect(parseFloat(typed.style.height)).toBeCloseTo(ONE_LINE * 2);
    expect(typed.style.transform).toBe('rotate(0rad)');
    expect(typed.style.color).toBe('rgb(217, 48, 37)');
  });

  it('makes a Text of what was typed once the typing ends, narrowed to its words', () => {
    const typing = typingOf();
    const { box, area } = layer(typing);
    press(box, 72, 92);
    fireEvent.change(area()!, { target: { value: 'Hello' } });
    fireEvent.blur(area()!);
    expect(typing.onTyped).toHaveBeenCalledOnce();
    const [index, kind, typed] = vi.mocked(typing.onTyped).mock.calls[0]!;
    expect([index, kind]).toEqual([1, 'text']);
    expect(typed).toMatchObject({ kind: 'text', words: 'Hello', size: 12, callout: null });
    expect(typed!.rect[0]).toBe(72);
    expect(typed!.rect[3]).toBe(700);
    expect(typed!.rect[2]).toBeLessThan(72 + PDF_TEXT_BOX_WIDTH_PT);
    expect(area()).toBeNull();
  });

  it('ends with Escape, making nothing of nothing typed, its keys its own', () => {
    const typing = typingOf();
    const { box, area, keys } = layer(typing);
    press(box, 72, 92);
    const typed = area()!;
    fireEvent.keyDown(typed, { key: 'Enter' });
    fireEvent.keyDown(typed, { key: 'Escape' });
    fireEvent.blur(typed);
    expect(typing.onTyped).toHaveBeenCalledExactlyOnceWith(1, 'text', null);
    expect(keys).not.toHaveBeenCalled();
    expect(area()).toBeNull();
  });

  it('ends the typing with a press elsewhere, which opens nothing else', () => {
    const typing = typingOf();
    const { box, area } = layer(typing);
    press(box, 72, 92);
    fireEvent.change(area()!, { target: { value: 'Note' } });
    press(box, 300, 300);
    expect(typing.onTyped).toHaveBeenCalledOnce();
    expect(area()).toBeNull();
  });

  it('leaves a press in the box to move its caret', () => {
    const { box, area } = layer(typingOf());
    press(box, 72, 92);
    fireEvent.pointerDown(area()!, at(80, 95));
    expect(area()).not.toBeNull();
  });
});

describe('a Text opened by a drag', () => {
  it('shows the box as it is dragged, held to the page, then opens it as wide as the drag', () => {
    const typing = typingOf();
    const { box, area, view } = layer(typing);
    fireEvent.pointerDown(box, at(72, 92));
    fireEvent.pointerMove(box, at(272, 9999));
    expect(view.container.querySelector('[data-pdf-typing-draft="rectangle"]')).not.toBeNull();
    fireEvent.pointerUp(box, at(272, 9999));
    expect(view.container.querySelector('[data-pdf-typing-draft]')).toBeNull();
    expect(area()!.style.width).toBe('400px');
    // To the page's foot: 700 points high.
    expect(area()!.style.height).toBe('1400px');
  });

  it('shows nothing for a drag too short to open a box, and lets a cancel go', () => {
    const { box, area, view } = layer(typingOf());
    fireEvent.pointerDown(box, at(72, 92));
    fireEvent.pointerMove(box, at(73, 93));
    expect(view.container.querySelector('[data-pdf-typing-draft]')).toBeNull();
    fireEvent.pointerMove(box, at(200, 200, { pointerId: 2 }));
    fireEvent.pointerUp(box, at(200, 200, { pointerId: 2 }));
    expect(area()).toBeNull();
    fireEvent.pointerCancel(box, at(73, 93));
    fireEvent.pointerUp(box, at(73, 93));
    expect(area()).toBeNull();
  });

  it('opens a box at the press where the page’s box on screen is not known', () => {
    const { box, area } = layer(typingOf(), { screenBox: () => null });
    fireEvent.pointerDown(box, at(72, 92));
    fireEvent.pointerMove(box, at(272, 300));
    fireEvent.pointerUp(box, at(272, 300));
    expect(area()!.style.width).toBe(`${PDF_TEXT_BOX_WIDTH_PT * 2}px`);
  });
});

describe('a press the typing tool takes no part in', () => {
  it('is another button’s, or lands where the page is not drawn', () => {
    const { box, area } = layer(typingOf(), { pointAt: () => null });
    fireEvent.pointerDown(box, at(72, 92, { button: 2 }));
    press(box, 72, 92);
    fireEvent.pointerMove(box, at(80, 95));
    expect(area()).toBeNull();
  });
});

describe('a Callout', () => {
  it('marks what is meant with its first press', () => {
    const typing = typingOf({ kind: 'callout' });
    const { box, area } = layer(typing);
    press(box, 400, 300);
    expect(typing.onTip).toHaveBeenCalledExactlyOnceWith(1, { x: 400, y: 492 });
    expect(area()).toBeNull();
  });

  it('shows the first press, then opens its box at the second, hanging left of what is meant, its line drawn', () => {
    const typing = typingOf({ kind: 'callout', tip: { index: 1, at: { x: 400, y: 492 } } });
    const { box, area, view } = layer(typing, { look: 'dark' });
    expect(view.container.querySelector('[data-pdf-typing-draft="drawing"]')).not.toBeNull();
    press(box, 300, 100);
    expect(typing.onTip).toHaveBeenCalledExactlyOnceWith(1, null);
    expect(area()!.getAttribute('aria-label')).toBe('Callout');
    // Hanging from its top right: the press, 300 points across.
    expect(parseFloat(area()!.style.left) + parseFloat(area()!.style.width)).toBe(600);
    expect(view.container.querySelector('[data-pdf-typing-draft="callout"]')).not.toBeNull();
    // Dark pages: the tool's colour as the step shows it.
    expect(area()!.style.color).not.toBe('rgb(217, 48, 37)');
    fireEvent.change(area()!, { target: { value: 'Why?' } });
    fireEvent.blur(area()!);
    const [, kind, typed] = vi.mocked(typing.onTyped).mock.calls[0]!;
    expect(kind).toBe('callout');
    expect(typed!.callout!.slice(0, 2)).toEqual([400, 492]);
  });

  it('takes a first press on another page as none: this press is a first press', () => {
    const typing = typingOf({ kind: 'callout', tip: { index: 0, at: { x: 1, y: 1 } } });
    const { box, view } = layer(typing);
    expect(view.container.querySelector('[data-pdf-typing-draft]')).toBeNull();
    press(box, 50, 50);
    expect(typing.onTip).toHaveBeenCalledExactlyOnceWith(1, { x: 50, y: 742 });
  });
});

describe('a turned view', () => {
  it('turns the box with the page, so the words are typed upright on the page as the file has it', () => {
    // A quarter turn clockwise: the page's across runs down the view.
    const { box, area } = layer(typingOf(), {
      matrix: [0, 1, 1, 0, 0, 0],
      pointAt: (client) => ({ x: client.y, y: client.x }),
    });
    press(box, 300, 72);
    expect(area()!.style.transform).toMatch(/^rotate\(1\.57\d*rad\)$/);
  });
});
