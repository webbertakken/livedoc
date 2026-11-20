import { describe, expect, it } from 'vitest';
import { DefaultStyles, DEFAULT_STYLES_MAX_CHARS } from './default-styles';
import { StyleLooks } from './style-looks';
import { STYLE_ROLES, Styles, type Style } from './styles';

const defaults = Styles.defaults();
const blank = Styles.builtIn('odf');
const builtInLook = (role: (typeof STYLE_ROLES)[number]) =>
  StyleLooks.of(blank, defaults, Styles.idOfRole(blank, role));

describe('DefaultStyles.of (text-and-paragraphs.md "Default styles": only what differs is kept)', () => {
  it("keeps nothing for a document in Google's defaults", () => {
    expect(DefaultStyles.of(blank, defaults)).toEqual({});
    expect(DefaultStyles.of(Styles.builtIn('ooxml'), defaults)).toEqual({});
  });

  it("keeps, per role, the look's values that differ from Google's", () => {
    const styles = blank.map((s): Style =>
      s.role === 'normal'
        ? { ...s, text: { font: 'Georgia' } }
        : s.role === 'heading2'
          ? { ...s, paragraph: { ...s.paragraph, align: 'center' } }
          : s,
    );
    expect(DefaultStyles.of(styles, defaults)).toEqual({
      normal: { text: { font: 'Georgia' } },
      // Every style built on Normal text draws in Georgia too, so their looks differ as well.
      title: { text: { font: 'Georgia' } },
      subtitle: { text: { font: 'Georgia' } },
      heading1: { text: { font: 'Georgia' } },
      heading2: { text: { font: 'Georgia' }, paragraph: { align: 'center' } },
      heading3: { text: { font: 'Georgia' } },
      heading4: { text: { font: 'Georgia' } },
      heading5: { text: { font: 'Georgia' } },
      heading6: { text: { font: 'Georgia' } },
    });
  });

  it('keeps nothing for a role the document lacks', () => {
    expect(
      DefaultStyles.of(
        blank.filter((s) => s.role !== 'title'),
        defaults,
      ),
    ).toEqual({});
  });
});

describe("DefaultStyles.looks (Use my default styles: Google's for a look not saved)", () => {
  it("gives every role its saved look over Google's", () => {
    const looks = DefaultStyles.looks({ heading1: { text: { size: 24, color: '#112233' } } });
    expect(Object.keys(looks)).toEqual([...STYLE_ROLES]);
    expect(looks.heading1).toEqual({
      text: { ...builtInLook('heading1').text, size: 24, color: '#112233' },
      paragraph: builtInLook('heading1').paragraph,
    });
    expect(looks.normal).toEqual(builtInLook('normal'));
  });

  it("gives Google's looks when nothing is saved: Reset styles", () => {
    const looks = DefaultStyles.looks({});
    for (const role of STYLE_ROLES) expect(looks[role]).toEqual(builtInLook(role));
  });

  it('round-trips: the looks saved are the looks used', () => {
    const styles = blank.map((s): Style =>
      s.role === 'subtitle' ? { ...s, text: { ...s.text, italic: true, size: 18 } } : s,
    );
    const looks = DefaultStyles.looks(DefaultStyles.of(styles, defaults));
    expect(looks.subtitle).toEqual(StyleLooks.of(styles, defaults, 'Subtitle'));
  });
});

describe('DefaultStyles.parse (text-and-paragraphs.md "Default styles": unreadable is ignored whole)', () => {
  it('reads a saved set back', () => {
    const saved = {
      normal: {
        text: { font: 'Georgia', size: 12, bold: true, transform: 'uppercase', color: '#a0b0c0' },
      },
      heading1: {
        paragraph: { align: 'justify', spaceBefore: 0, lineHeight: { rule: 'exact', pt: 18 } },
      },
    };
    expect(DefaultStyles.parse(saved)).toEqual(saved);
  });

  it("drops keys it does not know, so a later version's set still reads", () => {
    expect(
      DefaultStyles.parse({ normal: { text: { size: 12, glow: true }, extra: 1 }, aside: {} }),
    ).toEqual({ normal: { text: { size: 12 } } });
  });

  it.each([
    ['not an object', 'Georgia'],
    ['a list', []],
    ['null', null],
    ['a role that is not an object', { normal: 3 }],
    ['a size out of range', { normal: { text: { size: 0 } } }],
    ['a size that is no number', { normal: { text: { size: '12' } } }],
    ['a colour that is not #rrggbb', { normal: { text: { color: 'red; background: url(x)' } } }],
    ['a font with markup', { normal: { text: { font: '</style><script>' } } }],
    ['a font too long', { normal: { text: { font: 'A'.repeat(101) } } }],
    ['a toggle that is no boolean', { normal: { text: { bold: 'yes' } } }],
    ['a case not known', { normal: { text: { transform: 'shout' } } }],
    ['an alignment not known', { normal: { paragraph: { align: 'middle' } } }],
    ['a space past the limit', { normal: { paragraph: { spaceAfter: 1585 } } }],
    ['a line height not known', { normal: { paragraph: { lineHeight: { rule: 'tall' } } } }],
    [
      'a multiple out of range',
      { normal: { paragraph: { lineHeight: { rule: 'multiple', value: 0 } } } },
    ],
  ])('refuses %s', (_name, value) => {
    expect(DefaultStyles.parse(value)).toBeNull();
  });
});

describe('DEFAULT_STYLES_MAX_CHARS (text-and-paragraphs.md: all nine looks changed fit the preferences)', () => {
  it('holds a set with every property of every look changed', () => {
    const changed = {
      text: {
        font: 'P'.repeat(100),
        size: 72.5,
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        smallCaps: true,
        transform: 'capitalize' as const,
        color: '#123456',
      },
      paragraph: {
        align: 'justify' as const,
        indentStart: 123.25,
        indentEnd: 123.25,
        indentFirst: -36.75,
        spaceBefore: 1234.5,
        spaceAfter: 1234.5,
        lineHeight: { rule: 'atLeast' as const, pt: 123.5 },
        keepWithNext: false,
        keepTogether: true,
        widowControl: false,
      },
    };
    const styles = blank.map((s): Style => ({ ...s, ...changed }));
    const saved = DefaultStyles.of(styles, defaults);
    expect(Object.keys(saved)).toHaveLength(9);
    expect(JSON.stringify(saved).length).toBeLessThanOrEqual(DEFAULT_STYLES_MAX_CHARS);
    expect(DefaultStyles.parse(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });

  it('is what the preferences spec allows the set: 5,000 characters', () => {
    expect(DEFAULT_STYLES_MAX_CHARS).toBe(5000);
  });
});
