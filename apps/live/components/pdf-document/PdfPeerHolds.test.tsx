// @vitest-environment jsdom
// The marks collaborators hold (docs/specs/035-pdf-documents/live-editing-and-storage.md "Presence"; marks.md
// "Together"): outlined in their colour, their name shown after the hold moves and while the pointer is over it.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mark, PageName, type PageMatrix, type Quad } from '@livedoc/pdf-documents';
import type { PdfPeerHold } from '@/lib/pdf-document/pdf-presence-held';
import { PDF_PRESENCE_FRESH_MS } from '@/lib/pdf-document/pdf-presence-store';
import { PdfPeerHolds } from './PdfPeerHolds';

const MATRIX: PageMatrix = [1, 0, 0, -1, 0, 100];

const highlight = (id: string, quad: Quad): Mark =>
  Mark.highlight({
    id,
    page: PageName.ofObject(1),
    quads: [quad],
    text: 'words',
    colour: '#ffeb3b',
    opacity: 1,
    author: 'Ada',
    createdAt: 0,
  })!;

const ADA: PdfPeerHold = {
  id: 'ada',
  name: 'Ada',
  color: '#e11d48',
  mark: highlight('m1', [10, 20, 50, 20, 10, 10, 50, 10]),
};

// The page's point is the client's: page space as the matrix's inverse has it.
const pointAt = (client: { x: number; y: number }) => ({ x: client.x, y: 100 - client.y });

function holds(list: readonly PdfPeerHold[], target: HTMLElement | null = null) {
  return (
    <PdfPeerHolds
      holds={list}
      matrix={MATRIX}
      width={100}
      height={100}
      gap={0}
      target={target}
      pointAt={pointAt}
    />
  );
}

const outline = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-pdf-peer-hold="m1"]')!;

afterEach(() => {
  vi.useRealTimers();
});

describe('PdfPeerHolds', () => {
  it('outlines the mark held in the person\u2019s colour, round the mark, letting presses through', () => {
    const { container } = render(holds([ADA]));
    const box = outline(container);
    expect(box.dataset.pdfPeer).toBe('ada');
    expect(box.style.border).toContain('2px solid');
    expect(box.getAttribute('style')).toMatch(/#e11d48|rgb\(225, 29, 72\)/);
    expect(box.style.left).toBe('10%');
    expect(box.style.top).toBe('80%');
    expect(box.style.width).toBe('40%');
    expect(box.style.height).toBe('10%');
    expect(box.className).toContain('pointer-events-none');
  });

  it('names the person, then lets the name go once the hold has been still for PDF_PRESENCE_FRESH_MS', () => {
    vi.useFakeTimers();
    render(holds([ADA]));
    expect(screen.getByText('Ada')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(PDF_PRESENCE_FRESH_MS);
    });
    expect(screen.queryByText('Ada')).toBeNull();
  });

  it('names the person again when the mark held moves, or another is held', () => {
    vi.useFakeTimers();
    const { rerender } = render(holds([ADA]));
    act(() => {
      vi.advanceTimersByTime(PDF_PRESENCE_FRESH_MS);
    });
    const moved = { ...ADA, mark: highlight('m1', [12, 20, 52, 20, 12, 10, 52, 10]) };
    rerender(holds([moved]));
    expect(screen.getByText('Ada')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(PDF_PRESENCE_FRESH_MS);
    });
    rerender(holds([{ ...ADA, mark: highlight('m2', [10, 60, 50, 60, 10, 50, 50, 50]) }]));
    expect(screen.getByText('Ada')).toBeTruthy();
  });

  it('names the person while the pointer is over the mark held', () => {
    vi.useFakeTimers();
    const page = document.createElement('div');
    document.body.append(page);
    render(holds([ADA], page));
    act(() => {
      vi.advanceTimersByTime(PDF_PRESENCE_FRESH_MS);
    });
    fireEvent.pointerMove(page, { clientX: 30, clientY: 85 });
    expect(screen.getByText('Ada')).toBeTruthy();
    fireEvent.pointerMove(page, { clientX: 30, clientY: 40 });
    expect(screen.queryByText('Ada')).toBeNull();
    fireEvent.pointerMove(page, { clientX: 30, clientY: 85 });
    fireEvent.pointerLeave(page);
    expect(screen.queryByText('Ada')).toBeNull();
    page.remove();
  });

  it('draws nothing with nobody holding anything on the page', () => {
    const { container } = render(holds([]));
    expect(container.innerHTML).toBe('');
  });

  it('tints a collaborator’s text selection in their colour, named over it', () => {
    vi.useFakeTimers();
    const text = {
      id: 'bo',
      name: 'Bo',
      color: '#2563eb',
      quads: [[10, 20, 50, 20, 10, 10, 50, 10] as Quad, [10, 40, 30, 40, 10, 30, 30, 30] as Quad],
    };
    const { container } = render(
      <PdfPeerHolds
        holds={[]}
        texts={[text, { ...text, id: 'cy', name: 'Cy', quads: [] }]}
        matrix={MATRIX}
        width={100}
        height={100}
        gap={0}
        target={null}
        pointAt={pointAt}
      />,
    );
    const tint = container.querySelector('[data-pdf-peer-tint="bo"]')!;
    expect(tint.getAttribute('fill')).toBe('#2563eb');
    expect(tint.querySelectorAll('polygon')).toHaveLength(2);
    const box = container.querySelector<HTMLElement>('[data-pdf-peer-text="bo"]')!;
    expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual([
      '10%',
      '60%',
      '40%',
      '30%',
    ]);
    expect(box.style.border).toBe('');
    expect(screen.getByText('Bo')).toBeTruthy();
    // A selection the page’s text cannot draw is not drawn, nor named.
    expect(container.querySelector('[data-pdf-peer-tint="cy"]')).toBeNull();
    expect(screen.queryByText('Cy')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(PDF_PRESENCE_FRESH_MS);
    });
    expect(screen.queryByText('Bo')).toBeNull();
  });
});
