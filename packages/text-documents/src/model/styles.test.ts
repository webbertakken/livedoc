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

describe('Styles.paragraphPropsOf (text-and-paragraphs.md "Paragraph styles": a paragraph drawn in its style)', () => {
  const base: StyleDefaults = {
    paragraph: { lineHeight: { rule: 'multiple', value: 1.15 } },
    text: {},
  };
  const styles = [
    style({ id: 'Normal', paragraph: { spaceAfter: 0 } }),
    style({ id: 'Heading1', parent: 'Normal', paragraph: { spaceBefore: 20, spaceAfter: 6 } }),
    style({ id: 'Loop', parent: 'Loop', paragraph: { align: 'center' } }),
  ];

  it('layers a style over its parents over the defaults', () => {
    expect(Styles.paragraphPropsOf(styles, base, 'Heading1')).toEqual({
      lineHeight: { rule: 'multiple', value: 1.15 },
      spaceBefore: 20,
      spaceAfter: 6,
    });
  });

  it('reads the defaults under no style, or one the document lacks, and stops at a loop', () => {
    expect(Styles.paragraphPropsOf(styles, base, undefined)).toEqual(base.paragraph);
    expect(Styles.paragraphPropsOf(styles, base, 'Missing')).toEqual(base.paragraph);
    expect(Styles.paragraphPropsOf(styles, base, 'Loop').align).toBe('center');
  });
});

// standard-mapping.md "Conversion": a paragraph written under the other format while a conversion arrived.
describe('Styles.byId', () => {
  const odf = Styles.builtIn('odf');
  const ooxml = Styles.builtIn('ooxml');

  it('finds a style by its own id first', () => {
    const custom = [...odf, style({ id: 'Heading1', name: 'Mine' })];
    expect(Styles.byId(custom, 'Heading1')?.name).toBe('Mine');
    expect(Styles.byId(odf, 'Heading_20_2')?.role).toBe('heading2');
  });

  it('reads a built-in style id of the other format as the style with its role', () => {
    expect(Styles.byId(ooxml, 'Heading_20_1')?.id).toBe('Heading1');
    expect(Styles.byId(odf, 'Normal')?.id).toBe('Standard');
  });

  it('finds nothing for an unknown id, or none', () => {
    expect(Styles.byId(odf, 'Quote')).toBeUndefined();
    expect(Styles.byId(odf, undefined)).toBeUndefined();
  });
});
