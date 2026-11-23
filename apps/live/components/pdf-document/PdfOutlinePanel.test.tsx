// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Outline": the file's bookmarks as a tree, folded below the top,
// a press following one, the one for the page in view marked, the tree's keys, and what is said of none, too many
// and one that cannot be read.
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PageName, type Outline, type OutlineItem, type PageInfo } from '@livedoc/pdf-documents';
import { debugLog } from '@/lib/debug-log';
import { OUTLINE_COPY, PdfOutlinePanel } from './PdfOutlinePanel';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

const page = (object: number): PageInfo => ({
  name: PageName.ofObject(object),
  width: 612,
  height: 792,
  rotation: 0,
  label: null,
});
const PAGES = [1, 2, 3, 4].map(page);
const place = (object: number): OutlineItem['target'] => ({
  kind: 'place',
  page: PageName.ofObject(object),
  x: null,
  y: null,
});
const ITEMS: OutlineItem[] = [
  { title: 'Intro', depth: 0, target: place(1) },
  { title: 'Part A', depth: 0, target: place(2) },
  { title: 'A.1', depth: 1, target: place(3) },
  { title: 'Gone', depth: 0, target: place(99) },
];

async function show(outline: Promise<Outline>, inView = 0) {
  const onFollow = vi.fn();
  const view = render(
    <PdfOutlinePanel
      engine={{ outline: () => outline }}
      pages={PAGES}
      page={inView}
      onFollow={onFollow}
    />,
  );
  await act(async () => {
    await outline.catch(() => {});
  });
  return { ...view, onFollow };
}

const items = () => screen.getAllByRole('treeitem');
const titles = () => items().map((item) => item.textContent);

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => {
    run(0);
    return 0;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('the outline panel', () => {
  it('says it is reading until the outline arrives', () => {
    render(
      <PdfOutlinePanel
        engine={{ outline: () => new Promise(() => {}) }}
        pages={PAGES}
        page={0}
        onFollow={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(OUTLINE_COPY.reading);
  });

  it('shows the top level, folded, as a tree named Bookmarks', async () => {
    await show(Promise.resolve({ items: ITEMS, cut: false }));
    expect(screen.getByRole('tree', { name: 'Bookmarks' })).toBeTruthy();
    expect(titles()).toEqual(['Intro', 'Part A', `Gone${OUTLINE_COPY.nowhere}`]);
    const partA = items()[1]!;
    expect(partA.getAttribute('aria-expanded')).toBe('false');
    expect(items()[0]!.getAttribute('aria-expanded')).toBeNull();
    expect([
      partA.getAttribute('aria-level'),
      partA.getAttribute('aria-posinset'),
      partA.getAttribute('aria-setsize'),
    ]).toEqual(['1', '2', '3']);
  });

  it('unfolds a bookmark from its chevron without following it', async () => {
    const { onFollow, container } = await show(Promise.resolve({ items: ITEMS, cut: false }));
    fireEvent.click(container.querySelector('[data-pdf-bookmark-fold="1"]')!);
    expect(titles()).toContain('A.1');
    expect(screen.getByRole('treeitem', { name: 'A.1' }).getAttribute('aria-level')).toBe('2');
    expect(onFollow).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('[data-pdf-bookmark-fold="1"]')!);
    expect(titles()).not.toContain('A.1');
    // A leaf's chevron is no fold: a press on it follows the bookmark.
    fireEvent.click(container.querySelector('[data-pdf-bookmark="0"] span')!);
    expect(onFollow).toHaveBeenCalledWith(ITEMS[0]!.target);
  });

  it('follows a bookmark when it is pressed', async () => {
    const { onFollow } = await show(Promise.resolve({ items: ITEMS, cut: false }));
    fireEvent.click(screen.getByRole('treeitem', { name: 'Part A' }));
    expect(onFollow).toHaveBeenCalledWith(ITEMS[1]!.target);
  });

  it('marks the bookmark for the page in view, or its shown parent while folded', async () => {
    const { rerender, onFollow } = await show(Promise.resolve({ items: ITEMS, cut: false }), 2);
    const partA = screen.getByRole('treeitem', { name: 'Part A' });
    expect(partA.getAttribute('aria-current')).toBe('location');
    expect(partA.tabIndex).toBe(0);
    expect(partA.hasAttribute('data-panel-start')).toBe(true);
    fireEvent.keyDown(partA, { key: 'ArrowRight' });
    expect(screen.getByRole('treeitem', { name: 'A.1' }).getAttribute('aria-current')).toBe(
      'location',
    );
    rerender(
      <PdfOutlinePanel
        engine={{ outline: () => Promise.resolve({ items: ITEMS, cut: false }) }}
        pages={PAGES}
        page={0}
        onFollow={onFollow}
      />,
    );
    expect(screen.getByRole('treeitem', { name: 'Intro' }).getAttribute('aria-current')).toBe(
      'location',
    );
  });

  it('moves, unfolds and folds with the tree’s keys, and follows with Enter', async () => {
    const { onFollow } = await show(Promise.resolve({ items: ITEMS, cut: false }));
    const at = (name: string) => screen.getByRole('treeitem', { name });
    at('Intro').focus();
    fireEvent.keyDown(at('Intro'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(at('Part A'));
    fireEvent.keyDown(at('Part A'), { key: 'ArrowRight' });
    expect(at('Part A').getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(at('Part A'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(at('A.1'));
    fireEvent.keyDown(at('A.1'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(at('Part A'));
    fireEvent.keyDown(at('Part A'), { key: 'ArrowLeft' });
    expect(titles()).not.toContain('A.1');
    fireEvent.keyDown(at('Part A'), { key: '*' });
    expect(titles()).toContain('A.1');
    fireEvent.keyDown(at('Part A'), { key: 'q' });
    fireEvent.keyDown(at('Part A'), { key: 'Enter' });
    expect(onFollow).toHaveBeenCalledWith(ITEMS[1]!.target);
  });

  it('says a file has no bookmarks', async () => {
    await show(Promise.resolve({ items: [], cut: false }));
    expect(screen.getByText(OUTLINE_COPY.none)).toBeTruthy();
  });

  it('says when the file holds more bookmarks than are listed', async () => {
    await show(Promise.resolve({ items: ITEMS, cut: true }));
    expect(screen.getByText(OUTLINE_COPY.cut)).toBeTruthy();
  });

  it('says and logs an outline that cannot be read', async () => {
    await show(Promise.reject(new Error('stopped')));
    expect(screen.getByRole('alert').textContent).toBe(OUTLINE_COPY.failed);
    expect(debugLog).toHaveBeenCalledWith('[pdf] outline-failed', 'Error: stopped');
  });

  it('drops an outline that arrives after the panel closed', async () => {
    let answer: (outline: Outline) => void = () => {};
    const { unmount } = render(
      <PdfOutlinePanel
        engine={{ outline: () => new Promise((resolve) => (answer = resolve)) }}
        pages={PAGES}
        page={0}
        onFollow={vi.fn()}
      />,
    );
    unmount();
    await act(async () => answer({ items: ITEMS, cut: false }));
    expect(screen.queryByRole('tree')).toBeNull();
  });
});
