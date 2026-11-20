// docs/specs/004-interface-design/fonts.md "Substitution": the writing draws the document's defaults.
import { describe, expect, it } from 'vitest';
import { documentTextStyle } from './document-text-style';

describe('documentTextStyle', () => {
  it('draws the default family through its stack, at its size', () => {
    expect(documentTextStyle({ font: 'Georgia', size: 12 })).toBe(
      'font-family: "Georgia", "LiveDoc Gelasio", serif; font-size: 12pt',
    );
  });

  it("falls back to Google's Arial 11 pt", () => {
    expect(documentTextStyle({})).toBe(
      'font-family: "Arial", "LiveDoc Arimo", sans-serif; font-size: 11pt',
    );
    expect(documentTextStyle({ size: 0 })).toContain('font-size: 11pt');
  });
});
