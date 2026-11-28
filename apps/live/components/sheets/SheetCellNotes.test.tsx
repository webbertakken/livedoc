// @vitest-environment jsdom
// A cell's note on hover (docs/specs/029-sheets/review.md "Notes"): the pointer resting on a noted cell for 400 ms
// shows its note in a read-only card at the cell's top right; nothing for a cell without one, nor while the cell is
// edited or its note box is open; a merged cell's note is its top-left cell's.
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
import { SheetCellNotes } from './SheetCellNotes';

beforeAll(stubResizeObserver);
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function hovering(
  hover: { r: number; c: number } | null,
  opts: { open?: OpenNoteCell | null } = {},
) {
  const h = await makeSheet({ notes: { B2: 'Line one\nline two' } });
  vi.useFakeTimers();
  renderSheet(h, (p) => {
    parts = p;
    return (
      <SheetNoteOpenContext.Provider value={opts.open ?? null}>
        <SheetCellNotes hover={hover} />
      </SheetNoteOpenContext.Provider>
    );
  });
  return h;
}

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
