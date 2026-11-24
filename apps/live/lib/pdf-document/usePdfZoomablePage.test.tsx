// @vitest-environment jsdom
// docs/specs/035-pdf-documents/accessibility.md "Seeing": a PDF tab's page zooms with the browser; the editor's pin
// comes back as the PDF's surface goes.
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { debugLog } from '@/lib/debug-log';
import { PDF_ZOOMABLE_VIEWPORT, usePdfZoomablePage } from './usePdfZoomablePage';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const PINNED = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';

afterEach(() => {
  document.head.innerHTML = '';
});

describe('usePdfZoomablePage', () => {
  it('drops the pin while a PDF is shown, logs it, and puts it back as the PDF goes', () => {
    document.head.innerHTML = `<meta name="viewport" content="${PINNED}">`;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!;

    const hook = renderHook(() => usePdfZoomablePage());
    expect(meta.content).toBe(PDF_ZOOMABLE_VIEWPORT);
    expect(debugLog).toHaveBeenCalledWith('[pdf] viewport zoomable');

    hook.unmount();
    expect(meta.content).toBe(PINNED);
  });

  it('leaves a page with no viewport of its own as it is', () => {
    const hook = renderHook(() => usePdfZoomablePage());
    hook.unmount();
    expect(document.head.querySelector('meta')).toBeNull();
  });
});
