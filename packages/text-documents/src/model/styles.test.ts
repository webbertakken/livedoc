import { describe, expect, it } from 'vitest';
import { Styles, type Style, type StyleDefaults } from './styles';

const defaults: StyleDefaults = { paragraph: {}, text: { font: 'Arial', size: 11 } };
const style = (s: Partial<Style> & { id: string }): Style => ({
  name: s.id,
  family: 'paragraph',
  paragraph: {},
  text: {},
  ...s,
});

describe('Styles.textPropsOf (text-and-paragraphs.md "Text formatting": a toggle through its styles)', () => {
  const styles = [
    style({ id: 'Normal', text: { size: 11 } }),
    style({ id: 'Heading1', parent: 'Normal', text: { size: 20, bold: true } }),
    style({ id: 'Quiet', parent: 'Heading1', text: { bold: false } }),
    style({ id: 'Strong', family: 'text', text: { bold: true, italic: true } }),
  ];

  it('reads the defaults under no style', () => {
    expect(Styles.textPropsOf(styles, defaults, undefined)).toEqual({ font: 'Arial', size: 11 });
  });

  it('layers a paragraph style over its parents over the defaults', () => {
    expect(Styles.textPropsOf(styles, defaults, 'Heading1')).toEqual({
      font: 'Arial',
      size: 20,
      bold: true,
    });
  });

  it('lets a false override a parent true', () => {
    expect(Styles.textPropsOf(styles, defaults, 'Quiet').bold).toBe(false);
  });

  it('layers a text style over the paragraph style', () => {
    expect(Styles.textPropsOf(styles, defaults, 'Normal', 'Strong')).toEqual({
      font: 'Arial',
      size: 11,
      bold: true,
      italic: true,
    });
  });

  it('stops at a loop of parents and ignores an unknown id', () => {
    const looped = [
      style({ id: 'A', parent: 'B', text: { italic: true } }),
      style({ id: 'B', parent: 'A', text: { size: 9 } }),
    ];
    expect(Styles.textPropsOf(looped, defaults, 'A')).toEqual({
      font: 'Arial',
      size: 9,
      italic: true,
    });
    expect(Styles.textPropsOf(looped, defaults, 'Gone', 'Gone')).toEqual(defaults.text);
  });
});
