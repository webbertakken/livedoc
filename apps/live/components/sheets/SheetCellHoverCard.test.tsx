// @vitest-environment jsdom
// A cell's note and thread on hover (docs/specs/029-sheets/review.md "Notes", "In the grid", D644): the pointer
// resting on a noted or anchored cell for 400 ms shows a read-only card at the cell's top right, the note first, then
// the thread's first comment, author and how many more; nothing for a cell without either, nor while the cell is
// edited, its note box is open or its thread's card is; a merged cell's are its top-left cell's.
import { act, cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  makeSheet,
  renderSheet,
  SHEET_ID,
  stubResizeObserver,
  type SheetParts,
} from './sheet-ui-test-utils';
import { SheetNoteOpenContext, type OpenNoteCell } from './sheet-note-open-context';
import { SheetCellHoverCard } from './SheetCellHoverCard';
import { cellKey } from '@livedoc/sheets';
import type { SheetThread } from '@livedoc/document';
import { SheetThreadMarksContext, type SheetThreadMarks } from './sheet-thread-marks-context';

beforeAll(stubResizeObserver);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function hovering(
  hover: { r: number; c: number } | null,
  opts: {
    open?: OpenNoteCell | null;
    notes?: Record<string, string>;
    marks?: (key: (r: number, c: number) => string) => SheetThreadMarks;
  } = {},
) {
  const h = await makeSheet({ notes: opts.notes ?? { B2: 'Line one\nline two' } });
  const layout = h.store.sheet(SHEET_ID)!.layout;
  const key = (r: number, c: number) => cellKey(layout.rows[r]!, layout.cols[c]!);
  vi.useFakeTimers();
  renderSheet(h, (p) => {
    parts = p;
    return (
      <SheetThreadMarksContext.Provider value={opts.marks?.(key) ?? null}>
        <SheetNoteOpenContext.Provider value={opts.open ?? null}>
          <SheetCellHoverCard hover={hover} />
        </SheetNoteOpenContext.Provider>
      </SheetThreadMarksContext.Provider>
    );
  });
  return h;
}

const said = (id: string, text: string, name: string) => ({
  id,
  text,
  at: 1,
  author: { key: 'k-' + id, name, colour: '#0284c7' },
});
const THREAD: SheetThread = {
  id: 'th1',
  sheetId: SHEET_ID,
  anchor: { r1: 'r', c1: 'c', r2: 'r', c2: 'c' },
  resolved: false,
  comments: [
    said('a', 'Check this total', 'Ada'),
    said('b', 'Done', 'Bo'),
    said('c', 'Thanks', 'Ada'),
  ],
  v: 3,
};

let parts: SheetParts;
const card = () => screen.queryByRole('tooltip');

describe('the note card', () => {
  it('shows a noted cell’s note after the pointer rests a moment', async () => {
    await hovering({ r: 1, c: 1 });
    expect(card()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(card()?.textContent).toBe('Line one\nline two');
    expect(card()?.hasAttribute('data-sheet-note-card')).toBe(true);
  });

  it('shows nothing on a cell without a note, nor while the note box is open on it', async () => {
    await hovering({ r: 0, c: 0 });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(card()).toBeNull();
    cleanup();
    await hovering({ r: 1, c: 1 }, { open: { sheetId: SHEET_ID, r: 1, c: 1 } });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(card()).toBeNull();
  });

  it("shows a merged cell's note, its top-left cell's, and hides while a cell is edited", async () => {
    const h = await hovering({ r: 2, c: 2 });
    act(() => h.select('B2:C3'));
    act(() => parts.actions.merge('all', () => true));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(card()?.textContent).toBe('Line one\nline two');
    act(() => parts.actions.startEdit('type', 'x'));
    expect(card()).toBeNull();
  });
});

describe('the comment card', () => {
  const rest = () =>
    act(() => {
      vi.advanceTimersByTime(400);
    });

  it('shows an anchored cell’s first comment, its author and how many more', async () => {
    await hovering(
      { r: 0, c: 0 },
      { marks: (key) => ({ byCell: new Map([[key(0, 0), THREAD]]), openCell: null }) },
    );
    rest();
    expect(card()?.hasAttribute('data-sheet-comment-card')).toBe(true);
    expect(card()?.hasAttribute('data-sheet-note-card')).toBe(false);
    expect(card()?.textContent).toBe('AdaCheck this total2 more');
  });

  it('shows the note first, then the thread, on a cell with both (D644)', async () => {
    await hovering(
      { r: 1, c: 1 },
      {
        marks: (key) => ({
          byCell: new Map([[key(1, 1), { ...THREAD, comments: THREAD.comments.slice(0, 1) }]]),
          openCell: null,
        }),
      },
    );
    rest();
    expect(card()?.textContent).toBe('Line one\nline twoAdaCheck this total');
  });

  it('leaves the thread out while its card is open, and shows nothing then on a cell with no note', async () => {
    await hovering(
      { r: 1, c: 1 },
      { marks: (key) => ({ byCell: new Map([[key(1, 1), THREAD]]), openCell: key(1, 1) }) },
    );
    rest();
    expect(card()?.textContent).toBe('Line one\nline two');
    cleanup();
    await hovering(
      { r: 0, c: 0 },
      {
        notes: {},
        marks: (key) => ({ byCell: new Map([[key(0, 0), THREAD]]), openCell: key(0, 0) }),
      },
    );
    rest();
    expect(card()).toBeNull();
  });
});
