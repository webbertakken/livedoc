import {
  DARK_CANVAS_BACKGROUND_COLOR,
  EVENT_STORMING_NOTES,
  MIN_TEXT_CONTRAST,
  contrastRatio,
} from '@livedoc/document';
import { describe, expect, it } from 'vitest';
import { SUGGESTION_TINT_PERCENT, suggestionInk, suggestionStroke } from './suggestion-colours';

// docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides": the change mark is worded, so
// its words are text on the tab's tint and must read at 4.5:1 (WCAG 2.2 1.4.3) on either canvas.

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexOf = (rgb: number[]) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
// The tab's ground: that much of the stroke over the canvas.
const tint = (stroke: string, canvas: string, percent: number) =>
  hexOf(
    channels(stroke).map((v, i) => (v * percent + channels(canvas)[i]! * (100 - percent)) / 100),
  );

describe('the words on a suggestion’s tint', () => {
  it.each(EVENT_STORMING_NOTES.map((n) => n.kind))('read as text on either canvas: %s', (kind) => {
    const light = tint(suggestionStroke(kind, 'light'), '#ffffff', SUGGESTION_TINT_PERCENT.light);
    const dark = tint(
      suggestionStroke(kind, 'dark'),
      DARK_CANVAS_BACKGROUND_COLOR,
      SUGGESTION_TINT_PERCENT.dark,
    );
    expect(contrastRatio(suggestionInk(kind, 'light'), light)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
    expect(contrastRatio(suggestionInk(kind, 'dark'), dark)).toBeGreaterThanOrEqual(
      MIN_TEXT_CONTRAST,
    );
  });
});
