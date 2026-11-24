// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet": a finger's selection has a small bar, a toolbar
// named "Selection": Copy, Highlight, Underline, Strikethrough and Comment, each only where it can act, a dimmed one
// saying why; above the selection, below it where the top would cut it; following it as the pages move. A mouse's
// selection has none.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  HIGHLIGHT_SELECTION,
  STRIKETHROUGH_SELECTION,
  UNDERLINE_SELECTION,
} from '@/lib/pdf-document/pdf-context-menu';
import { COPY } from '@/lib/pdf-document/pdf-menus';
import type { PdfViewStore } from '@/lib/pdf-document/usePdfView';
import type { PdfTextSelected } from '@/lib/pdf-document/usePdfTextSelection';
import { PdfSelectionBar } from './PdfSelectionBar';

const SELECTED: PdfTextSelected = {
  page: 0,
  spans: [[0, 5]],
  quads: [],
  text: 'Hello',
  touch: true,
};

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect;

// The pages in a host at (0, 100), 400 wide, drawing the selection as one polygon at `top`.
function pagesDrawing(top: number | null) {
  const host = document.createElement('div');
  host.getBoundingClientRect = () => rect(0, 100, 400, 800);
  const pages = document.createElement('div');
  host.append(pages);
  if (top !== null) {
    pages.innerHTML = '<svg><g data-pdf-text-selection="true"><polygon /></g></svg>';
    pages.querySelector('polygon')!.getBoundingClientRect = () => rect(150, top, 100, 20);
  }
  return pages;
}

function viewStore() {
  const watchers = new Set<() => void>();
  const store: PdfViewStore = {
    get: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    subscribe: (watcher) => {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
  };
  return { store, tell: () => watchers.forEach((watcher) => watcher()) };
}

function bar({
  selected = SELECTED,
  actions = {
    [COPY]: { run: vi.fn() },
    [HIGHLIGHT_SELECTION]: { run: vi.fn() },
    [UNDERLINE_SELECTION]: { run: vi.fn() },
    [STRIKETHROUGH_SELECTION]: { run: vi.fn() },
  },
  top = 400,
}: { selected?: PdfTextSelected; actions?: OfficeActions; top?: number | null } = {}) {
  const pages = pagesDrawing(top);
  const { store, tell } = viewStore();
  const view = render(
    <PdfSelectionBar selected={selected} actions={actions} pages={pages} view={store} />,
  );
  const toolbar = () => screen.queryByRole('toolbar', { name: 'Selection' });
  const sized = () => {
    const shown = toolbar()!;
    Object.defineProperty(shown, 'offsetWidth', { value: 200 });
    Object.defineProperty(shown, 'offsetHeight', { value: 44 });
  };
  return { view, toolbar, sized, tell, pages, actions };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const frame = () => {
  act(() => {
    vi.advanceTimersByTime(20);
  });
};

describe('PdfSelectionBar', () => {
  it('floats centred above the selection, with the buttons that can act', () => {
    const { toolbar, sized, actions } = bar();
    sized();
    frame();
    const shown = toolbar()!;
    // The selection's top is 300 in the host; the bar 44 tall, 8 above it; centred on 200, 200 wide.
    expect(shown.style.top).toBe('248px');
    expect(shown.style.left).toBe('100px');
    expect(shown.className).not.toContain('invisible');
    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons).toEqual(['Copy', 'Highlight', 'Underline', 'Strikethrough']);
    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }));
    expect(actions[HIGHLIGHT_SELECTION]!.run).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Strikethrough' }));
    expect(actions[STRIKETHROUGH_SELECTION]!.run).toHaveBeenCalled();
  });

  it('goes below the selection and its handles where the top would cut it, and follows the pages', () => {
    const { toolbar, sized, tell, pages } = bar({ top: 120 });
    sized();
    frame();
    // The selection's bottom is 40 in the host: below it, past the handles.
    expect(toolbar()!.style.top).toBe(`${40 + 44 + 8}px`);
    pages.querySelector('polygon')!.getBoundingClientRect = () => rect(0, 600, 30, 20);
    tell();
    frame();
    expect(toolbar()!.style.top).toBe('448px');
    expect(toolbar()!.style.left).toBe('8px');
  });

  it('dims a button that cannot act now, saying why, and runs nothing', () => {
    const run = vi.fn();
    bar({
      actions: { [COPY]: { run, disabled: true, label: 'Copy (this PDF asks not to be copied)' } },
    });
    const copy = screen.getByRole('button', { name: 'Copy' });
    expect(copy.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(copy);
    expect(run).not.toHaveBeenCalled();
  });

  it('waits unseen until the selection is drawn', () => {
    const { toolbar } = bar({ top: null });
    frame();
    expect(toolbar()!.className).toContain('invisible');
  });

  it('is not there for a mouse’s selection, none, or nothing it can do', () => {
    const mouse = bar({ selected: { ...SELECTED, touch: false } });
    expect(mouse.toolbar()).toBeNull();
    mouse.view.unmount();
    const none = bar({ actions: {} });
    frame();
    expect(none.toolbar()).toBeNull();
  });
});
