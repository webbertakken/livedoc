// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Full screen": the pages alone on the whole screen, one page a screen
// at Fit page, the turn kept; leaving by any way brings back the view it found; a browser with no full screen dims the
// item, and one that refuses leaves the view as it was.
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debugLog } from '@/lib/debug-log';
import { track } from '@/lib/telemetry';
import { FULL_SCREEN } from './pdf-menus';
import { PdfView } from './pdf-view';
import { usePdfFullScreen } from './usePdfFullScreen';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

let full: Element | null = null;
const change = () => document.dispatchEvent(new Event('fullscreenchange'));

function browser(enabled = true) {
  Object.defineProperty(document, 'fullscreenEnabled', { value: enabled, configurable: true });
  Object.defineProperty(document, 'fullscreenElement', { get: () => full, configurable: true });
  document.exitFullscreen = vi.fn(async () => {
    full = null;
    change();
  });
}

function pagesColumn(refuse = false) {
  const element = document.createElement('div');
  element.requestFullscreen = vi.fn(async () => {
    if (refuse) throw new TypeError('not allowed');
    full = element;
    change();
  });
  return element;
}

const twoPagesZoomed = PdfView.turned(
  PdfView.withZoom(PdfView.withDisplay(PdfView.initial(), 'two'), 2),
  1,
);

function setup(element: HTMLElement | null, view = twoPagesZoomed) {
  const setWholeView = vi.fn();
  const hook = renderHook(
    (props: { view: PdfView }) => usePdfFullScreen({ element, view: props.view, setWholeView }),
    {
      initialProps: { view },
    },
  );
  return { ...hook, setWholeView };
}

beforeEach(() => {
  vi.clearAllMocks();
  full = null;
  browser();
});
afterEach(() => {
  full = null;
});

describe('Full screen', () => {
  it('starts off, its item unchecked and offered', () => {
    const { result } = setup(pagesColumn());
    expect(result.current.on).toBe(false);
    expect(result.current.actions[FULL_SCREEN]).toMatchObject({ checked: false, disabled: false });
  });

  it('shows the pages column full screen, one page a screen at Fit page, told and logged', async () => {
    const element = pagesColumn();
    const { result, setWholeView } = setup(element);
    await act(async () => result.current.actions[FULL_SCREEN]!.run());
    expect(element.requestFullscreen).toHaveBeenCalled();
    expect(result.current.on).toBe(true);
    expect(result.current.actions[FULL_SCREEN]?.checked).toBe(true);
    expect(setWholeView).toHaveBeenCalledWith(PdfView.presented(twoPagesZoomed));
    expect(track).toHaveBeenCalledWith('Pdf', 'Toggled', 'FullScreen');
    expect(debugLog).toHaveBeenCalledWith('[pdf] full-screen on=yes');
  });

  it('brings back the view it found on leaving by its item, the turn as it is now', async () => {
    const element = pagesColumn();
    const { result, rerender, setWholeView } = setup(element);
    await act(async () => result.current.actions[FULL_SCREEN]!.run());
    const turnedAgain = PdfView.turned(PdfView.presented(twoPagesZoomed), 1);
    rerender({ view: turnedAgain });
    await act(async () => result.current.actions[FULL_SCREEN]!.run());
    expect(document.exitFullscreen).toHaveBeenCalled();
    expect(result.current.on).toBe(false);
    expect(setWholeView).toHaveBeenLastCalledWith({ ...twoPagesZoomed, turns: 2 });
    expect(debugLog).toHaveBeenCalledWith('[pdf] full-screen on=no');
    // Sent on entering, never on leaving.
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('brings back the view when the browser leaves full screen its own way (Escape)', async () => {
    const element = pagesColumn();
    const { result, setWholeView } = setup(element);
    await act(async () => result.current.actions[FULL_SCREEN]!.run());
    act(() => {
      full = null;
      change();
    });
    expect(result.current.on).toBe(false);
    expect(setWholeView).toHaveBeenLastCalledWith(twoPagesZoomed);
  });

  it('pays no heed to another element going full screen', () => {
    const { result, setWholeView } = setup(pagesColumn());
    act(() => {
      full = document.createElement('video');
      change();
    });
    expect(result.current.on).toBe(false);
    expect(setWholeView).not.toHaveBeenCalled();
  });

  it('leaves the view as it was where the browser refuses, and logs it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result, setWholeView } = setup(pagesColumn(true));
    await act(async () => result.current.actions[FULL_SCREEN]!.run());
    expect(result.current.on).toBe(false);
    expect(setWholeView).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[pdf] full-screen-refused', expect.any(TypeError));
    warn.mockRestore();
  });

  it('logs a browser that will not leave, and keeps what it shows', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const element = pagesColumn();
    const { result } = setup(element);
    await act(async () => result.current.actions[FULL_SCREEN]!.run());
    document.exitFullscreen = vi.fn(async () => {
      throw new TypeError('not now');
    });
    await act(async () => result.current.actions[FULL_SCREEN]!.run());
    expect(result.current.on).toBe(true);
    expect(warn).toHaveBeenCalledWith('[pdf] full-screen-refused', expect.any(TypeError));
    warn.mockRestore();
  });

  it('dims the item where the browser has no full screen for part of a page', () => {
    browser(false);
    const { result } = setup(pagesColumn());
    expect(result.current.actions[FULL_SCREEN]?.disabled).toBe(true);
  });

  it('dims the item while there are no pages to show', () => {
    const { result } = setup(null);
    expect(result.current.actions[FULL_SCREEN]?.disabled).toBe(true);
    // Run all the same, it asks the browser for nothing.
    result.current.actions[FULL_SCREEN]!.run();
    expect(document.exitFullscreen).not.toHaveBeenCalled();
  });

  it('offers nothing as the page is first drawn, before there is a browser to ask', () => {
    function Item() {
      const { actions } = usePdfFullScreen({
        element: null,
        view: PdfView.initial(),
        setWholeView: vi.fn(),
      });
      return <i data-disabled={String(actions[FULL_SCREEN]?.disabled)} />;
    }
    expect(renderToString(<Item />)).toContain('data-disabled="true"');
  });
});
