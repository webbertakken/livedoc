// @vitest-environment jsdom
// docs/specs/035-pdf-documents/dark-pages.md "The first-time question": a card, never a dialog, said politely once,
// the open page shown as it is and as Dark pages; two answers, a close, and Escape that gives focus back.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PageBitmap } from '@livedoc/pdf-documents';
import { DARK_PAGES_PREVIEW_PX, PdfDarkPagesQuestion } from './PdfDarkPagesQuestion';

const bitmap: PageBitmap = {
  width: 1,
  height: 1,
  rgba: new Uint8ClampedArray([255, 255, 255, 255]),
  toView: [1, 0, 0, 1, 0, 0],
};

function shown() {
  const engine = { drawPage: vi.fn(async () => bitmap) };
  const onAnswer = vi.fn();
  const onLeave = vi.fn();
  const view = render(
    <>
      <button type="button">Before</button>
      <PdfDarkPagesQuestion
        engine={engine}
        page={2}
        width={612}
        turns={1}
        onAnswer={onAnswer}
        onLeave={onLeave}
      />
    </>,
  );
  return { engine, onAnswer, onLeave, ...view };
}

describe('the first-time question’s card', () => {
  it('asks, says so politely, and draws the open page both ways', async () => {
    const putImageData = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      putImageData,
    } as never);
    vi.stubGlobal('ImageData', class {});
    const { engine } = shown();
    expect(screen.getByRole('region', { name: 'Show PDF pages dark?' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
    await act(async () => new Promise((done) => setTimeout(done, 0)));
    expect(screen.getByRole('status').textContent).toBe('Question: show PDF pages dark?');
    expect(screen.getByText('As they are')).toBeTruthy();
    const scale = DARK_PAGES_PREVIEW_PX / 612;
    expect(engine.drawPage).toHaveBeenCalledWith(2, scale, 1, undefined, 'paper');
    expect(engine.drawPage).toHaveBeenCalledWith(2, scale, 1, undefined, 'dark');
    await act(async () => {});
    expect(putImageData).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('answers by either button', () => {
    const { onAnswer } = shown();
    fireEvent.click(screen.getByRole('button', { name: 'Use dark pages' }));
    expect(onAnswer).toHaveBeenLastCalledWith('Use');
    fireEvent.click(screen.getByRole('button', { name: 'Keep as they are' }));
    expect(onAnswer).toHaveBeenLastCalledWith('Keep');
  });

  it('is dismissed by its close, focus going to the pages', () => {
    const { onAnswer, onLeave } = shown();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onAnswer).toHaveBeenCalledWith('Dismissed');
    expect(onLeave).toHaveBeenCalled();
  });

  it('is dismissed by Escape inside it, focus given back to where it came from', () => {
    const { onAnswer, onLeave } = shown();
    const before = screen.getByRole('button', { name: 'Before' });
    const use = screen.getByRole('button', { name: 'Use dark pages' });
    before.focus();
    fireEvent.focus(use, { relatedTarget: before });
    use.focus();
    // A move inside the card keeps where focus came from.
    fireEvent.focus(use, { relatedTarget: screen.getByRole('button', { name: 'Close' }) });
    fireEvent.keyDown(use, { key: 'Enter' });
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.keyDown(use, { key: 'Escape' });
    expect(onAnswer).toHaveBeenCalledWith('Dismissed');
    expect(document.activeElement).toBe(before);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it('draws nothing once it is gone before the engine answers, nor what the engine could not draw', async () => {
    let answer: (bitmap: PageBitmap | null) => void = () => {};
    const engine = {
      drawPage: vi.fn(
        (_page: number, _scale: number, _turns?: number, _hidden?: unknown, look?: string) =>
          look === 'dark'
            ? Promise.resolve(null)
            : new Promise<PageBitmap | null>((resolve) => (answer = resolve)),
      ),
    };
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
    const { unmount } = render(
      <PdfDarkPagesQuestion
        engine={engine}
        page={0}
        width={612}
        turns={0}
        onAnswer={() => {}}
        onLeave={() => {}}
      />,
    );
    await act(async () => {});
    unmount();
    await act(async () => answer(bitmap));
    expect(getContext).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
