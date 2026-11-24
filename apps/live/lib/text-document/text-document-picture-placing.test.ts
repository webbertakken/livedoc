import { describe, expect, it } from 'vitest';
import { PicturePlacements, type PicturePlacement } from '@livedoc/text-documents';
import {
  PICTURE_WRAP_CHOICES,
  evenMargin,
  moved,
  offset,
  withMargin,
  wrapChoiceOf,
  wrapped,
} from './text-document-picture-placing';

const placed = (over: Partial<PicturePlacement> = {}): PicturePlacement => ({
  wrap: 'wrap',
  margin: PicturePlacements.margin(9),
  moves: 'with-text',
  x: 20,
  y: 30,
  ...over,
});

describe('picture placing', () => {
  it('names the choices in Google order', () => {
    expect(PICTURE_WRAP_CHOICES.map((c) => c.label)).toEqual([
      'In line',
      'Wrap text',
      'Break text',
      'Behind text',
      'In front of text',
    ]);
  });

  it('reads the choice in force', () => {
    expect(wrapChoiceOf(undefined)).toBe('inline');
    expect(wrapChoiceOf(placed({ wrap: 'behind' }))).toBe('behind');
  });

  it('places a picture leaving in line where it stands, moving with text', () => {
    expect(wrapped(undefined, 'wrap', { x: 12.5, y: -4 })).toEqual(
      placed({ x: 12.5, y: -4, margin: PicturePlacements.margin(9) }),
    );
    expect(wrapped(undefined, 'front', { x: 1, y: 2 })).toEqual(
      placed({ wrap: 'front', x: 1, y: 2, margin: PicturePlacements.margin(0) }),
    );
  });

  it('cannot place a picture leaving in line without its spot', () => {
    expect(wrapped(undefined, 'break', null)).toBeNull();
  });

  it('drops the placement for in line', () => {
    expect(wrapped(placed(), 'inline', null)).toBeUndefined();
  });

  it('keeps the margin between wrap and break, and sets one coming from behind or in front', () => {
    const margin = PicturePlacements.margin(30);
    expect(wrapped(placed({ margin }), 'break', null)).toEqual(placed({ wrap: 'break', margin }));
    expect(wrapped(placed({ wrap: 'behind', margin }), 'wrap', null)).toEqual(placed());
    expect(wrapped(placed({ margin }), 'front', null)).toEqual(placed({ wrap: 'front', margin }));
  });

  it('keeps the place and how it moves when the wrap changes', () => {
    const page = placed({ moves: 'page', x: 100, y: 200 });
    expect(wrapped(page, 'behind', null)).toEqual({ ...page, wrap: 'behind' });
  });

  it('sets one margin on every side, within an inch', () => {
    expect(withMargin(placed(), 18.0004)).toEqual(placed({ margin: PicturePlacements.margin(18) }));
    expect(withMargin(placed(), 100)?.margin.top).toBe(72);
    expect(withMargin(placed(), -3)?.margin.left).toBe(0);
  });

  it('reads one margin, or none where the sides differ', () => {
    expect(evenMargin(placed())).toBe(9);
    expect(evenMargin(placed({ margin: { top: 1, right: 9, bottom: 9, left: 9 } }))).toBeNull();
  });

  it('keeps the picture in place as it switches between text and page', () => {
    const paragraph = { x: 72, y: 300 };
    const fixed = moved(placed(), 'page', paragraph);
    expect(fixed).toEqual(placed({ moves: 'page', x: 92, y: 330 }));
    expect(moved(fixed!, 'with-text', paragraph)).toEqual(placed());
    expect(moved(placed(), 'with-text', null)).toEqual(placed());
  });

  it('cannot switch without its paragraph measured', () => {
    expect(moved(placed(), 'page', null)).toBeNull();
  });

  it('holds its offsets within 22 inches', () => {
    expect(offset(placed(), 'x', -40.1234)).toEqual(placed({ x: -40.123 }));
    expect(offset(placed(), 'y', 5000)?.y).toBe(1584);
    expect(moved(placed({ x: 1580 }), 'page', { x: 72, y: 0 })?.x).toBe(1584);
  });
});
