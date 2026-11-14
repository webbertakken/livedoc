// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  createFreehand,
  createShape,
  LABEL_FONT_PX,
  type BoxedElement,
  type ShapeElement,
  type StickyElement,
} from '@livedoc/document';
import { renderLabel } from './element-labels';

// A note's words take the colour the element view sets (its own textColor, else the note default),
// so a note coloured on purpose (a dark preset, an imported note) reads in its own ink.
const note = (over: Partial<StickyElement> = {}): StickyElement => ({
  id: 's',
  type: 'sticky',
  x: 0,
  y: 0,
  width: 160,
  height: 120,
  label: 'Words',
  ...over,
});

const shown = (el: StickyElement) =>
  render(
    <div style={{ color: 'rgb(241, 245, 249)' }}>
      {renderLabel(
        el,
        el.label ?? '',
        'sm',
        'center',
        'middle',
        14,
        false,
        () => {},
        () => {},
        false,
      )}
    </div>,
  ).container;

describe('a note label', () => {
  it("takes the element's ink rather than a fixed colour", () => {
    expect(shown(note()).querySelector('.text-amber-950')).toBeNull();
  });

  it('keeps that ink through formatted runs', () => {
    const el = note({ richText: [{ text: 'Wor', bold: true }, { text: 'ds' }] });
    expect(shown(el).querySelector('.text-amber-950')).toBeNull();
  });
});

// docs/specs/004-interface-design/fonts.md "Text size": Scale on a single-line label is a middling fixed px, never
// stretched to its box, and a shape's label at Scale shrinks to fit like any size.
describe('a single-line label at Scale', () => {
  const shape = (over: Partial<ShapeElement> = {}): ShapeElement => ({
    ...createShape('square', 0, 0),
    id: 'sq',
    width: 240,
    height: 240,
    label: 'Image',
    ...over,
  });
  const drawn = (el: BoxedElement) =>
    render(
      <>
        {renderLabel(
          el,
          el.label ?? '',
          'scale',
          'center',
          'middle',
          8,
          false,
          () => {},
          () => {},
          false,
        )}
      </>,
    ).container;

  it('draws at the label scale\u2019s fixed px, not fitted to the box', () => {
    const container = drawn(shape());
    expect(container.querySelector('svg')).toBeNull();
    const words = container.querySelector<HTMLElement>('[data-label-words]')!;
    expect(words.textContent).toBe('Image');
    expect(words.closest<HTMLElement>('[style*="font-size"]')!.style.fontSize).toBe(
      `${LABEL_FONT_PX.scale}px`,
    );
  });

  it('draws a stroke\u2019s label at the same fixed px', () => {
    const stroke = {
      ...createFreehand(
        [
          { x: 0, y: 0 },
          { x: 240, y: 240 },
        ],
        false,
      ),
      label: 'Image',
    } as BoxedElement;
    const words = drawn(stroke).querySelector<HTMLElement>('[data-label-words]')!;
    expect(words.closest<HTMLElement>('[style*="font-size"]')!.style.fontSize).toBe(
      `${LABEL_FONT_PX.scale}px`,
    );
  });

  it('marks each formatted run as the label\u2019s words', () => {
    const el = shape({ richText: [{ text: 'Ima', bold: true }, { text: 'ge' }] });
    expect(drawn(el).querySelectorAll('[data-label-words]')).toHaveLength(2);
  });
});
