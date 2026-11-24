import { describe, expect, it } from 'vitest';
import {
  drawingTabIdsOf,
  isDrawingTab,
  listedTabIdFor,
  listedTabs,
  nextDrawingName,
} from './drawing-tabs';

const text = { id: 'doc', name: 'Notes', kind: 'text-document' as const };
const drawing = { id: 'd1', drawingOf: 'doc' };
const other = { id: 'd2', drawingOf: 'elsewhere' };
const board = { id: 'b' };

// docs/specs/034-text-documents/objects.md "A drawing tab": a drawing tab belongs to one text document tab and is never
// listed; an address naming it opens its text document tab.
describe('drawing tabs', () => {
  it('knows a drawing tab by the text document tab it belongs to', () => {
    expect(isDrawingTab(drawing)).toBe(true);
    expect(isDrawingTab(board)).toBe(false);
    expect(isDrawingTab(text)).toBe(false);
  });

  it('lists every tab but the drawing tabs, in order', () => {
    expect(listedTabs([board, drawing, text, other]).map((t) => t.id)).toEqual(['b', 'doc']);
  });

  it('names the drawing tabs of one text document tab', () => {
    expect(drawingTabIdsOf([board, drawing, text, other], 'doc')).toEqual(['d1']);
    expect(drawingTabIdsOf([board, text], 'doc')).toEqual([]);
  });

  it('opens a drawing tab’s text document tab in its place', () => {
    const tabs = [board, text, drawing, other];
    expect(listedTabIdFor(tabs, 'd1')).toBe('doc');
    expect(listedTabIdFor(tabs, 'b')).toBe('b');
  });

  it('answers null for a drawing tab whose text document tab is gone, or a tab that is not there', () => {
    const tabs = [board, text, other];
    expect(listedTabIdFor(tabs, 'd2')).toBeNull();
    expect(listedTabIdFor(tabs, 'missing')).toBeNull();
  });
});

// docs/specs/034-text-documents/objects.md "A drawing tab": named Drawing N, N the next free number in its text document.
describe('nextDrawingName', () => {
  it('names the first drawing Drawing 1', () => {
    expect(nextDrawingName([text], 'doc')).toBe('Drawing 1');
  });

  it('numbers past the highest of the text document’s own drawings, whatever their order', () => {
    const tabs = [
      text,
      { id: 'a', name: 'Drawing 3', drawingOf: 'doc' },
      { id: 'b', name: 'Drawing 1', drawingOf: 'doc' },
      { id: 'c', name: 'Drawing 9', drawingOf: 'elsewhere' },
      { id: 'd', name: 'Sketch', drawingOf: 'doc' },
    ];
    expect(nextDrawingName(tabs, 'doc')).toBe('Drawing 4');
  });
});
