// docs/specs/034-text-documents/page-layout.md "Page setup", editing-surface.md "The ruler": the page drawn at its
// setup, and a dragged margin held so the text area keeps an inch.
import { describe, expect, it } from 'vitest';
import { PageSetup } from '@livedoc/text-documents';
import { MIN_TEXT_WIDTH_PT, pageBox, setMargin, textWidthOf } from './text-document-page';

const letter = PageSetup.of('letter');

describe('the page at its setup', () => {
  it('draws its width, height and margins', () => {
    expect(pageBox(letter)).toEqual({
      '--page-width': '612pt',
      '--page-height': '792pt',
      '--page-top': '72pt',
      '--page-bottom': '72pt',
      '--page-left': '72pt',
      '--page-right': '72pt',
    });
    expect(textWidthOf(letter)).toBe(468);
  });

  it('holds a margin between the edge and an inch short of the other margin', () => {
    expect(setMargin(letter, 'left', 36.0004).margins).toMatchObject({ left: 36, right: 72 });
    expect(setMargin(letter, 'right', -5).margins.right).toBe(0);
    expect(setMargin(letter, 'left', 600).margins.left).toBe(612 - 72 - MIN_TEXT_WIDTH_PT);
  });
});
