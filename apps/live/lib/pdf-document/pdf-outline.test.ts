// docs/specs/035-pdf-documents/reading-surface.md "Outline": the file's bookmarks as a tree, folded below the top,
// the one for the place in view, and the keys between them.
import { describe, expect, it } from 'vitest';
import { PageName, type OutlineItem } from '@livedoc/pdf-documents';
import { PdfOutline } from './pdf-outline';

const place = (page: number): OutlineItem['target'] => ({
  kind: 'place',
  page: PageName.ofObject(page),
  x: null,
  y: null,
});
// 0 Intro (p1) · 1 Part A (p2) · 2 A.1 (p3) · 3 A.1.a (p4) · 4 A.2 (p5) · 5 Part B (address) · 6 B.1 (p7, depth jump)
const ITEMS: OutlineItem[] = [
  { title: 'Intro', depth: 0, target: place(1) },
  { title: 'Part A', depth: 0, target: place(2) },
  { title: 'A.1', depth: 1, target: place(3) },
  { title: 'A.1.a', depth: 2, target: place(4) },
  { title: 'A.2', depth: 1, target: place(5) },
  { title: 'Part B', depth: 0, target: { kind: 'address', address: 'https://example.com/' } },
  { title: 'B.1', depth: 3, target: place(7) },
];
const PAGES = [1, 2, 3, 4, 5, 6, 7].map((n) => PageName.ofObject(n));
const tree = PdfOutline.of(ITEMS);

describe('the outline', () => {
  it('finds each bookmark’s parent, a deeper jump nesting under the nearest shallower one', () => {
    expect(tree.nodes.map((node) => node.parent)).toEqual([null, null, 1, 2, 1, null, 5]);
    expect(tree.nodes.map((node) => node.children)).toEqual([[], [2, 4], [3], [], [], [6], []]);
  });

  it('shows the top level, and a bookmark’s children only while it is unfolded', () => {
    expect(PdfOutline.shown(tree, new Set())).toEqual([0, 1, 5]);
    expect(PdfOutline.shown(tree, new Set([1]))).toEqual([0, 1, 2, 4, 5]);
    expect(PdfOutline.shown(tree, new Set([1, 2]))).toEqual([0, 1, 2, 3, 4, 5]);
    // A child of a folded bookmark stays hidden though it is unfolded itself.
    expect(PdfOutline.shown(tree, new Set([2]))).toEqual([0, 1, 5]);
  });

  it('unfolds every bookmark that has children', () => {
    expect([...PdfOutline.allOpen(tree)].toSorted()).toEqual([1, 2, 5]);
  });

  it('finds the bookmark for the page in view: the last whose page is it or the nearest before', () => {
    expect(PdfOutline.current(tree, PAGES, 0)).toBe(0);
    expect(PdfOutline.current(tree, PAGES, 3)).toBe(3);
    // Page six has no bookmark: page five's is the nearest before it.
    expect(PdfOutline.current(tree, PAGES, 5)).toBe(4);
    expect(PdfOutline.current(tree, PAGES, 6)).toBe(6);
    expect(PdfOutline.current(PdfOutline.of([ITEMS[5]!]), PAGES, 3)).toBeNull();
  });

  it('marks the nearest shown parent of a folded current bookmark', () => {
    expect(PdfOutline.shownOf(tree, new Set(), 3)).toBe(1);
    expect(PdfOutline.shownOf(tree, new Set([1]), 3)).toBe(2);
    expect(PdfOutline.shownOf(tree, new Set([1, 2]), 3)).toBe(3);
    expect(PdfOutline.shownOf(tree, new Set(), null)).toBeNull();
  });

  describe('keys', () => {
    const open = new Set([1]);
    const move = (key: string, at: number, folds = open) => PdfOutline.key(tree, folds, at, key);

    it('moves down and up between the bookmarks shown, stopping at the ends', () => {
      expect(move('ArrowDown', 1)).toEqual({ focus: 2 });
      expect(move('ArrowDown', 4)).toEqual({ focus: 5 });
      expect(move('ArrowDown', 5)).toEqual({ focus: 5 });
      expect(move('ArrowUp', 2)).toEqual({ focus: 1 });
      expect(move('ArrowUp', 0)).toEqual({ focus: 0 });
      expect(move('Home', 4)).toEqual({ focus: 0 });
      expect(move('End', 0)).toEqual({ focus: 5 });
    });

    it('unfolds with Right, then moves to the first child; does nothing on a leaf', () => {
      expect(move('ArrowRight', 2)).toEqual({ focus: 2, open: 2 });
      expect(move('ArrowRight', 1)).toEqual({ focus: 2 });
      expect(move('ArrowRight', 0)).toEqual({ focus: 0 });
    });

    it('folds with Left, then moves to the parent', () => {
      expect(move('ArrowLeft', 1)).toEqual({ focus: 1, close: 1 });
      expect(move('ArrowLeft', 4)).toEqual({ focus: 1 });
      expect(move('ArrowLeft', 0)).toEqual({ focus: 0 });
    });

    it('unfolds every bookmark with *', () => {
      expect(move('*', 0)).toEqual({ focus: 0, openAll: true });
    });

    it('leaves any other key alone', () => {
      expect(move('a', 0)).toBeNull();
    });
  });
});
