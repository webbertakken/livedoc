// docs/specs/034-text-documents/page-layout.md "Page setup", editing-surface.md "The ruler": the page drawn at its
// setup, and a dragged margin held so the text area keeps an inch.
import { describe, expect, it } from 'vitest';
import { PageSetup, paperFill } from '@livedoc/text-documents';
import { MIN_TEXT_SIDE_PT } from '@livedoc/text-documents';
import {
  PAGELESS_TEXT_WIDTH_PT,
  pageBox,
  pagelessColumnPt,
  TEXT_WIDTHS,
  pagelessSetup,
  setMargin,
  textWidthOf,
} from './text-document-page';

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
    expect(setMargin(letter, 'left', 600).margins.left).toBe(612 - 72 - MIN_TEXT_SIDE_PT);
  });
});

describe('the page colour', () => {
  it('draws a page colour as a fill for the paper it is on, and none for white', () => {
    expect(pageBox({ ...letter, pageColor: '#fff2cc' })).toMatchObject({
      '--page-colour': paperFill('#fff2cc'),
    });
    expect(pageBox(letter)).not.toHaveProperty('--page-colour');
  });
});

describe('the page pageless', () => {
  it('is a column 8 in wide, narrower where the room is less, never under an inch', () => {
    expect(pagelessColumnPt(2000, 1)).toBe(PAGELESS_TEXT_WIDTH_PT);
    // 600 px is 450 pt, less half an inch each side.
    expect(pagelessColumnPt(600, 1)).toBe(378);
    expect(pagelessColumnPt(600, 2)).toBe(153);
    expect(pagelessColumnPt(150, 1)).toBe(MIN_TEXT_SIDE_PT);
  });

  // "View > Text width": narrow 6.5 in, wide 10 in, full the room less half an inch each side.
  it('is the chosen text width, never wider than the room', () => {
    expect(pagelessColumnPt(2000, 1, 'narrow')).toBe(468);
    expect(pagelessColumnPt(2000, 1, 'wide')).toBe(720);
    // 2000 px is 1500 pt, less half an inch each side.
    expect(pagelessColumnPt(2000, 1, 'full')).toBe(1428);
    expect(pagelessColumnPt(600, 1, 'wide')).toBe(378);
    expect(TEXT_WIDTHS).toEqual(['narrow', 'medium', 'wide', 'full']);
  });

  it('draws the column with no side margins, keeping the colour', () => {
    const coloured = { ...letter, pageColor: '#fff2cc' };
    expect(pagelessSetup(coloured, 500)).toEqual({
      ...coloured,
      width: 500,
      margins: { top: 36, bottom: 36, left: 0, right: 0 },
    });
  });
});
