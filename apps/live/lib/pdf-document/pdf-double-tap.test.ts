// docs/specs/035-pdf-documents/reading-surface.md "Phone and tablet": a double tap is two taps of one finger.
import { describe, expect, it } from 'vitest';
import { PDF_DOUBLE_TAP_MS, PDF_DOUBLE_TAP_PX } from '@livedoc/pdf-documents';
import { PdfDoubleTap, type PdfTouchPoint } from './pdf-double-tap';

const at = (time: number, x = 100, y = 200, id = 1): PdfTouchPoint => ({ id, x, y, time });

// Feeds a finger's taps, each a down and an up `held` later, and answers what the last up tapped.
function taps(
  moments: readonly { down: PdfTouchPoint; up: PdfTouchPoint }[],
  state = PdfDoubleTap.initial(),
) {
  let tapped: PdfTouchPoint | null = null;
  for (const { down, up } of moments) {
    state = PdfDoubleTap.down(state, down);
    ({ state, tapped } = PdfDoubleTap.up(state, up));
  }
  return { state, tapped };
}

describe('a double tap', () => {
  it('is two quick taps of one finger in one place, told where the second touched', () => {
    const { tapped, state } = taps([
      { down: at(0), up: at(80) },
      { down: at(200, 104, 203), up: at(260, 104, 203) },
    ]);
    expect(tapped).toEqual(at(200, 104, 203));
    // Spent: a third tap starts again.
    expect(state.last).toBeNull();
  });

  it('is none for one tap', () => {
    expect(taps([{ down: at(0), up: at(80) }]).tapped).toBeNull();
  });

  it('is none where the second touches too late after the first lifts', () => {
    const late = 80 + PDF_DOUBLE_TAP_MS + 1;
    const { tapped, state } = taps([
      { down: at(0), up: at(80) },
      { down: at(late), up: at(late + 50) },
    ]);
    expect(tapped).toBeNull();
    // The late tap may be the first of another.
    expect(state.last).toEqual(at(late + 50));
  });

  it('is none where the two land apart', () => {
    const { tapped } = taps([
      { down: at(0), up: at(80) },
      { down: at(200, 100 + PDF_DOUBLE_TAP_PX), up: at(260, 100 + PDF_DOUBLE_TAP_PX) },
    ]);
    expect(tapped).toBeNull();
  });

  it('is none where a finger moves or rests while down', () => {
    expect(
      taps([
        { down: at(0), up: at(80) },
        { down: at(200), up: at(260, 100, 200 + PDF_DOUBLE_TAP_PX) },
      ]).tapped,
    ).toBeNull();
    expect(
      taps([
        { down: at(0), up: at(80) },
        { down: at(200), up: at(201 + PDF_DOUBLE_TAP_MS) },
      ]).tapped,
    ).toBeNull();
  });

  it('is none while a second finger is down, nor till every finger lifts', () => {
    let state = taps([{ down: at(0), up: at(80) }]).state;
    state = PdfDoubleTap.down(state, at(200));
    state = PdfDoubleTap.down(state, at(210, 300, 300, 2));
    const first = PdfDoubleTap.up(state, at(250));
    expect(first.tapped).toBeNull();
    expect(first.state.spoiled).toBe(true);
    const second = PdfDoubleTap.up(first.state, at(260, 300, 300, 2));
    expect(second.tapped).toBeNull();
    expect(second.state).toEqual(PdfDoubleTap.initial());
  });

  it('is none once the browser takes the finger for a scroll', () => {
    let state = taps([{ down: at(0), up: at(80) }]).state;
    state = PdfDoubleTap.down(state, at(200));
    state = PdfDoubleTap.cancel(state, 1);
    expect(state).toEqual(PdfDoubleTap.initial());
    expect(PdfDoubleTap.up(state, at(260)).tapped).toBeNull();
  });

  it('keeps a finger still down spoiling the tap when another is taken', () => {
    let state = PdfDoubleTap.down(PdfDoubleTap.initial(), at(0));
    state = PdfDoubleTap.down(state, at(5, 300, 300, 2));
    expect(PdfDoubleTap.cancel(state, 2).spoiled).toBe(true);
  });
});
