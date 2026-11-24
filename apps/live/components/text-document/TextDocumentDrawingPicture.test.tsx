// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Drawn": a drawing's picture draws its tab live on a transparent ground; while
// its tab loads, or where it cannot be shown, the PNG last saved shows; a failed load offers Retry.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';

const tab = (elements: unknown[] = [{ id: 'e1' }]) =>
  ({ id: 'd1', name: 'Drawing 1', elements, drawingOf: 'w' }) as unknown as Tab;

const ctx = {
  tabs: [] as Tab[],
  loadedTabIds: new Set<string>(),
  tabLoadErrors: new Set<string>(),
  loadAllTabs: vi.fn(async (_only?: readonly string[]): Promise<string[]> => []),
  isOutOfScope: vi.fn((_id: string) => false),
};
vi.mock('@/app/document/[id]/EditorContext', () => ({ useEditorContext: () => ctx }));
vi.mock('@/components/split/useTabSvg', () => ({
  useTabSvg: () => ({
    markup: '<svg><rect/><circle/></svg>',
    width: 100,
    height: 50,
    origin: { x: 0, y: 0 },
    background: '#fff',
  }),
}));

const { TextDocumentDrawingPicture, drawingPictureState } =
  await import('./TextDocumentDrawingPicture');

beforeEach(() => {
  ctx.tabs = [tab()];
  ctx.loadedTabIds = new Set(['d1']);
  ctx.tabLoadErrors = new Set();
  ctx.loadAllTabs.mockReset().mockResolvedValue([]);
  ctx.isOutOfScope.mockReset().mockReturnValue(false);
});

const draw = () => {
  const host = document.createElement('span');
  const view = render(<TextDocumentDrawingPicture drawingTabId="d1" host={host} />, {
    container: document.body.appendChild(host),
  });
  return { host, ...view };
};

describe('drawingPictureState', () => {
  it('draws a loaded drawing, and keeps the PNG otherwise', () => {
    expect(drawingPictureState(tab(), 'loaded')).toBe('drawn');
    expect(drawingPictureState(tab(), 'loading')).toBe('png');
    expect(drawingPictureState(tab([]), 'loaded')).toBe('png');
    expect(drawingPictureState(undefined, 'loaded')).toBe('png');
    expect(drawingPictureState(tab(), 'failed')).toBe('failed');
  });
});

describe('TextDocumentDrawingPicture', () => {
  it('draws its tab live, its paper hidden, and hides the PNG under it', () => {
    const { host, unmount } = draw();
    const svg = host.querySelector('[data-drawing-svg]')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 50');
    expect(svg.getAttribute('class')).toContain('[&>svg>rect:first-of-type]:hidden');
    expect(svg.querySelector('circle')).not.toBeNull();
    expect(host.hasAttribute('data-drawing-drawn')).toBe(true);
    expect(ctx.loadAllTabs).not.toHaveBeenCalled();
    unmount();
    expect(host.hasAttribute('data-drawing-drawn')).toBe(false);
  });

  it('asks for its tab once while it loads, showing the PNG meanwhile', async () => {
    ctx.loadedTabIds = new Set();
    const { host, rerender } = draw();
    expect(host.hasAttribute('data-drawing-drawn')).toBe(false);
    expect(host.querySelector('[data-drawing-svg]')).toBeNull();
    rerender(<TextDocumentDrawingPicture drawingTabId="d1" host={host} />);
    await waitFor(() => expect(ctx.loadAllTabs).toHaveBeenCalledTimes(1));
    expect(ctx.loadAllTabs).toHaveBeenCalledWith(['d1']);
  });

  it('offers Retry over the PNG when its load fails, and asks again', async () => {
    ctx.loadedTabIds = new Set();
    ctx.loadAllTabs.mockResolvedValue(['d1']);
    draw();
    const retry = await screen.findByRole('button', { name: 'Retry' });
    ctx.loadAllTabs.mockResolvedValue([]);
    await act(async () => fireEvent.click(retry));
    expect(ctx.loadAllTabs).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull());
  });

  it('asks once itself where the editor’s own load of it failed, loading meanwhile', async () => {
    ctx.loadedTabIds = new Set();
    ctx.tabLoadErrors = new Set(['d1']);
    ctx.loadAllTabs.mockReturnValue(new Promise(() => {}));
    draw();
    await waitFor(() => expect(ctx.loadAllTabs).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('keeps the PNG for a tab gone or outside the share', () => {
    ctx.tabs = [];
    expect(draw().host.querySelector('[data-drawing-svg]')).toBeNull();
    ctx.tabs = [tab()];
    ctx.isOutOfScope.mockReturnValue(true);
    expect(draw().host.querySelector('[data-drawing-svg]')).toBeNull();
    expect(ctx.loadAllTabs).not.toHaveBeenCalled();
  });
});
