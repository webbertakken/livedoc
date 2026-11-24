// docs/specs/034-text-documents/objects.md "The document around it": a drawing's picture asked for waits, one per text
// document tab, newest winning, until its surface takes it once.
import { describe, expect, it, vi } from 'vitest';
import {
  onDrawingReveal,
  revealDrawingPicture,
  takeDrawingReveal,
} from './text-document-drawing-reveal';

describe('the drawing reveal', () => {
  it('holds the newest ask per text document tab, taken once', () => {
    revealDrawingPicture('w', 'd1');
    revealDrawingPicture('w', 'd2');
    revealDrawingPicture('v', 'd3');
    expect(takeDrawingReveal('w')).toBe('d2');
    expect(takeDrawingReveal('w')).toBeNull();
    expect(takeDrawingReveal('v')).toBe('d3');
  });

  it('tells each listener which tab was asked, until it leaves', () => {
    const heard = vi.fn();
    const leave = onDrawingReveal(heard);
    revealDrawingPicture('w', 'd1');
    leave();
    revealDrawingPicture('w', 'd2');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith('w');
    takeDrawingReveal('w');
  });
});
