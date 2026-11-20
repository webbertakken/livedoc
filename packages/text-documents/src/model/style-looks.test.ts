import { describe, expect, it } from 'vitest';
import { PLAIN_LOOK, StyleLooks, type StyleLook } from './style-looks';
import { Styles, type Style, type StyleDefaults } from './styles';

const defaults = Styles.defaults();
const blank = Styles.builtIn('odf');
const idOf = (styles: readonly Style[], role: Parameters<typeof Styles.idOfRole>[1]) =>
  Styles.idOfRole(styles, role)!;
const withChanges = (styles: readonly Style[], changed: readonly Style[]): Style[] => {
  const byId = new Map(changed.map((s) => [s.id, s]));
  const held = styles.map((s) => byId.get(s.id) ?? s);
  return [...held, ...changed.filter((s) => !styles.some((t) => t.id === s.id))];
};
const lookOf = (styles: readonly Style[], role: Parameters<typeof Styles.idOfRole>[1]) =>
  StyleLooks.of(styles, defaults, Styles.idOfRole(styles, role));
const looked = (
  base: StyleLook,
  text: Partial<StyleLook['text']>,
  paragraph: Partial<StyleLook['paragraph']> = {},
): StyleLook => ({
  text: { ...base.text, ...text },
  paragraph: { ...base.paragraph, ...paragraph },
});

describe('StyleLooks.of (text-and-paragraphs.md "A style\'s look")', () => {
  it('reads a style through its parents and the defaults, every property settled', () => {
    const look = lookOf(blank, 'heading3');
    expect(look.text).toEqual({
      ...PLAIN_LOOK.text,
      font: 'Arial',
      size: 14,
      color: '#434343',
    });
    expect(look.paragraph).toMatchObject({
      spaceBefore: 16,
      spaceAfter: 4,
      keepWithNext: true,
      widowControl: true,
      lineHeight: { rule: 'multiple', value: 1.15 },
      align: 'start',
      indentStart: 0,
    });
  });

  it('leaves a highlight, a vertical place and the outline level out of a look', () => {
    const styles = [
      ...blank.filter((s) => s.role !== 'title'),
      { ...blank[1]!, text: { size: 26, highlight: '#ffff00', vertical: 'super' as const } },
    ];
    const look = lookOf(styles, 'title');
    expect(look.text).not.toHaveProperty('highlight');
    expect(look.text).not.toHaveProperty('vertical');
    expect(look.paragraph).not.toHaveProperty('outlineLevel');
  });

  it('reads a style the document lacks as the defaults alone', () => {
    expect(StyleLooks.of(blank, defaults, 'Missing').text.size).toBe(11);
  });

  it('lower-cases a colour, so equal colours compare equal', () => {
    const styles = blank.map((s) =>
      s.role === 'normal' ? { ...s, text: { color: '#ABCDEF' } } : s,
    );
    expect(lookOf(styles, 'normal').text.color).toBe('#abcdef');
  });
});

describe('StyleLooks.restyle (text-and-paragraphs.md "Update to match", "Default styles")', () => {
  it('gives the targeted style its new look, as its own over its parent', () => {
    const target = looked(lookOf(blank, 'heading1'), { font: 'Georgia', bold: true });
    const changed = StyleLooks.restyle(blank, defaults, 'odf', { heading1: target });
    const after = withChanges(blank, changed);
    expect(lookOf(after, 'heading1')).toEqual(target);
    const h1 = changed.find((s) => s.id === idOf(blank, 'heading1'))!;
    expect(h1.text).toEqual({ size: 20, font: 'Georgia', bold: true });
    expect(h1.paragraph.outlineLevel).toBe(1);
  });

  it('keeps every other style as it looks: updating Normal text changes no heading', () => {
    const target = looked(lookOf(blank, 'normal'), {
      font: 'Georgia',
      size: 12,
      color: '#ff0000',
      italic: true,
    });
    const changed = StyleLooks.restyle(blank, defaults, 'odf', { normal: target });
    const after = withChanges(blank, changed);
    expect(lookOf(after, 'normal')).toEqual(target);
    for (const role of ['title', 'subtitle', 'heading1', 'heading3', 'heading6'] as const)
      expect(lookOf(after, role)).toEqual(lookOf(blank, role));
    const h1 = changed.find((s) => s.id === idOf(blank, 'heading1'))!;
    expect(h1.text).toEqual({ size: 20, font: 'Arial', color: '#000000', italic: false });
  });

  it('keeps a style built on a heading as it looks when the heading changes', () => {
    const quote: Style = {
      id: 'Quote',
      name: 'Quote',
      family: 'paragraph',
      parent: idOf(blank, 'heading2'),
      paragraph: { pageBreakBefore: true },
      text: { highlight: '#ffff00' },
    };
    const styles = [...blank, quote];
    const before = StyleLooks.of(styles, defaults, 'Quote');
    const target = looked(lookOf(styles, 'heading2'), { size: 30 }, { align: 'center' });
    const after = withChanges(
      styles,
      StyleLooks.restyle(styles, defaults, 'odf', { heading2: target }),
    );
    expect(StyleLooks.of(after, defaults, 'Quote')).toEqual(before);
    const kept = after.find((s) => s.id === 'Quote')!;
    expect(kept.text).toEqual({ highlight: '#ffff00', size: 16 });
    expect(kept.paragraph).toEqual({ pageBreakBefore: true, align: 'start' });
  });

  it("adds a role the document lacks from the format's set, in the look asked", () => {
    const styles = blank.filter((s) => s.role !== 'title');
    const target = looked(lookOf(blank, 'title'), { size: 40 });
    const changed = StyleLooks.restyle(styles, defaults, 'ooxml', { title: target });
    expect(changed.map((s) => s.id)).toEqual(['Title']);
    expect(lookOf(withChanges(styles, changed), 'title')).toEqual(target);
  });

  it('changes nothing when every look asked is the look there is', () => {
    const targets = { normal: lookOf(blank, 'normal'), heading2: lookOf(blank, 'heading2') };
    expect(StyleLooks.restyle(blank, defaults, 'odf', targets)).toEqual([]);
  });

  it('keeps a value a style sets of its own, though its parent gives the same (Heading 5 is 11 pt)', () => {
    const targets = Object.fromEntries(
      blank.map((s) => [s.role!, StyleLooks.of(blank, defaults, s.id)]),
    );
    expect(StyleLooks.restyle(blank, defaults, 'odf', targets)).toEqual([]);
  });

  it('leaves text styles alone', () => {
    const strong: Style = {
      id: 'Strong',
      name: 'Strong',
      family: 'text',
      paragraph: {},
      text: { bold: true },
    };
    const target = looked(lookOf(blank, 'normal'), { bold: true });
    const changed = StyleLooks.restyle([...blank, strong], defaults, 'odf', { normal: target });
    expect(changed.some((s) => s.id === 'Strong')).toBe(false);
  });

  it('survives a parent cycle', () => {
    const a: Style = {
      id: 'A',
      name: 'A',
      family: 'paragraph',
      parent: 'B',
      paragraph: {},
      text: {},
    };
    const b: Style = {
      id: 'B',
      name: 'B',
      family: 'paragraph',
      parent: 'A',
      paragraph: {},
      text: {},
    };
    const target = looked(lookOf(blank, 'normal'), { size: 13 });
    expect(() =>
      StyleLooks.restyle([...blank, a, b], defaults, 'odf', { normal: target }),
    ).not.toThrow();
  });

  it('reads plain values for a document whose defaults name no font or size', () => {
    const bare: StyleDefaults = { paragraph: {}, text: {} };
    expect(StyleLooks.of(blank, bare, undefined).text).toEqual(PLAIN_LOOK.text);
  });
});
