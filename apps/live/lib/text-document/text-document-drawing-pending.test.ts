// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DRAWING_PENDING_KEY,
  drawingPending,
  drawingReady,
  putDrawingPending,
  readyDrawingFor,
  takeDrawing,
} from './text-document-drawing-pending';

// docs/specs/034-text-documents/objects.md "Where it goes": the caret's place is kept in this browser's session from
// New until Save and close; the picture made on Save and close waits for its text document to place it.
describe('a drawing waiting to be placed', () => {
  beforeEach(() => {
    sessionStorage.clear();
    takeDrawing('d1');
    takeDrawing('d2');
  });

  const where = { textDocumentTabId: 'w', documentTab: 't.0', anchor: 'AAA=' };

  it('keeps where it goes in the session, by its drawing tab', () => {
    putDrawingPending('d1', where);
    expect(drawingPending('d1')).toEqual(where);
    expect(JSON.parse(sessionStorage.getItem(DRAWING_PENDING_KEY)!)).toEqual({ d1: where });
    expect(drawingPending('d2')).toBeNull();
  });

  it('answers the one ready for a text document tab, with where it goes', () => {
    putDrawingPending('d1', where);
    putDrawingPending('d2', { ...where, textDocumentTabId: 'v' });
    const bytes = new Uint8Array([1, 2]);
    drawingReady('d1', { bytes, stored: 'img-1' });
    expect(readyDrawingFor('v')).toBeNull();
    expect(readyDrawingFor('w')).toEqual({ drawingTabId: 'd1', where, bytes, stored: 'img-1' });
  });

  it('is taken once placed, from the session too', () => {
    putDrawingPending('d1', where);
    drawingReady('d1', { bytes: new Uint8Array([1]), stored: null });
    takeDrawing('d1');
    expect(drawingPending('d1')).toBeNull();
    expect(readyDrawingFor('w')).toBeNull();
    expect(JSON.parse(sessionStorage.getItem(DRAWING_PENDING_KEY)!)).toEqual({});
  });

  it('reads a session it cannot parse as none waiting', () => {
    sessionStorage.setItem(DRAWING_PENDING_KEY, 'not json');
    expect(drawingPending('d1')).toBeNull();
  });
});
