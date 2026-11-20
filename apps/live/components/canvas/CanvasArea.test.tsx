// @vitest-environment jsdom
// docs/specs/006-document/kinds-outside-the-canvas.md "The canvas's code": the canvas's place holds the tab's paper
// while its code loads, draws the canvas once it is in, and offers Try Again when a load fails.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resetCanvasCodeForTests,
  setCanvasCodeLoaderForTests,
} from '@/lib/canvas-code/canvas-code';
import { CanvasArea, CanvasChromeSlot } from './CanvasArea';

const fakeModule = {
  EditorCanvasHost: () => <div data-testid="canvas" />,
  EditorCanvasChrome: ({ part, splitShowing }: { part: string; splitShowing: boolean }) => (
    <div data-testid="chrome" data-part={part} data-split={String(splitShowing)} />
  ),
};

afterEach(() => {
  cleanup();
  resetCanvasCodeForTests();
});

const flush = () => act(async () => {});

describe('CanvasArea', () => {
  it('holds the tab’s paper while the code loads, then draws the canvas', async () => {
    let land: (m: typeof fakeModule) => void = () => {};
    setCanvasCodeLoaderForTests(() => new Promise((resolve) => (land = resolve)));
    render(<CanvasArea paper="#123456" />);
    const place = screen.getByTestId('canvas-placeholder');
    expect(place.style.backgroundColor).toBe('rgb(18, 52, 86)');
    expect(place.getAttribute('aria-busy')).toBe('true');
    await act(async () => land(fakeModule));
    expect(screen.getByTestId('canvas')).toBeTruthy();
    expect(screen.queryByTestId('canvas-placeholder')).toBeNull();
  });

  it('says so with Try Again when the load fails, and draws the canvas once a retry lands', async () => {
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('chunk'))
      .mockResolvedValueOnce(fakeModule);
    setCanvasCodeLoaderForTests(loader);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<CanvasArea paper="#ffffff" />);
    await flush();
    expect(screen.getByRole('alert').textContent).toContain('This tab couldn’t load.');
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    await flush();
    expect(screen.getByTestId('canvas')).toBeTruthy();
  });
});

describe('CanvasChromeSlot', () => {
  it('draws nothing until the code is in, then the canvas’s chrome', async () => {
    let land: (m: typeof fakeModule) => void = () => {};
    setCanvasCodeLoaderForTests(() => new Promise((resolve) => (land = resolve)));
    render(
      <>
        <CanvasArea paper="#000000" />
        <CanvasChromeSlot part="panel" splitShowing />
      </>,
    );
    expect(screen.queryByTestId('chrome')).toBeNull();
    await act(async () => land(fakeModule));
    expect(screen.getByTestId('chrome').dataset.split).toBe('true');
    expect(screen.getByTestId('chrome').dataset.part).toBe('panel');
  });
});
