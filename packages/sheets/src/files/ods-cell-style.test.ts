import { describe, expect, it } from 'vitest';
import { ODF_NS, parseXml } from '@livedoc/office-packages';
import { ODS_DEFAULT_CELL_STYLES, odsCellLooks, odsStyleProperties } from './ods-cell-style';

const ns = Object.entries(ODF_NS)
  .map(([p, uri]) => `xmlns:${p}="${uri}"`)
  .join(' ');
const root = (inner: string) => {
  const parsed = parseXml(`<office:document ${ns}>${inner}</office:document>`, 'content.xml');
  if (!parsed.ok) throw new Error('bad xml');
  return parsed.root;
};

// LibreOffice's own: Liberation Sans by its font face, 10 pt, its default vertical alignment (bottom).
const LIBREOFFICE =
  '<office:font-face-decls><style:font-face style:name="Liberation Sans" svg:font-family="&apos;Liberation Sans&apos;"/>' +
  '<style:font-face style:name="Lora1" svg:font-family="Lora"/><style:font-face style:name="Nameless"/></office:font-face-decls>' +
  '<office:styles><style:default-style style:family="table-cell"><style:table-cell-properties fo:wrap-option="wrap"/><style:text-properties style:font-name="Liberation Sans" fo:font-size="10pt" fo:color="#000000"/></style:default-style>' +
  '<style:style style:name="Default" style:family="table-cell"/>' +
  '<style:style style:name="Heading" style:family="table-cell" style:parent-style-name="Default"><style:text-properties fo:font-weight="bold" fo:font-size="16pt"/></style:style>' +
  '</office:styles>';

const AUTOMATIC =
  '<office:automatic-styles>' +
  '<style:style style:name="ce1" style:family="table-cell" style:parent-style-name="Heading"><style:table-cell-properties fo:background-color="#ffff00" style:vertical-align="top" fo:wrap-option="wrap" fo:border="0.74pt solid #ff0000" fo:border-left="2.49pt dashed #0000ff"/>' +
  '<style:paragraph-properties fo:text-align="center" style:text-align-source="fix"/>' +
  '<style:text-properties fo:font-style="italic" style:text-underline-style="dotted" style:text-line-through-style="solid" fo:color="#00ff00" style:font-name="Lora1" fo:font-weight="normal"/></style:style>' +
  '<style:style style:name="ce2" style:family="table-cell"><style:table-cell-properties style:vertical-align="middle" fo:background-color="transparent" fo:border-bottom="1.76pt dotted #000000" fo:border-top="0.06pt double #000000" fo:border-right="none"/><style:paragraph-properties fo:text-align="end" style:text-align-source="fix"/><style:text-properties fo:font-weight="700" fo:font-family="&apos;Roboto Mono&apos;"/></style:style>' +
  '<style:style style:name="ce3" style:family="table-cell"><style:table-cell-properties style:rotation-angle="90" style:diagonal-tl-br="0.74pt solid #000000"/><style:paragraph-properties fo:text-align="justify"/></style:style>' +
  '<style:style style:name="ce4" style:family="table-cell"><style:paragraph-properties fo:text-align="start" style:text-align-source="value-type" fo:margin-left="0cm"/><style:text-properties fo:font-size="120%"/></style:style>' +
  '<style:style style:name="ce5" style:family="table-cell"><style:table-cell-properties style:cell-protect="none" style:shrink-to-fit="true"/><style:paragraph-properties fo:margin-left="0.5cm"/><style:text-properties fo:font-family="Bad;Name" style:text-underline-style="none" fo:font-size="2.3mm"/></style:style>' +
  '<style:style style:name="ce6" style:family="table-cell"><style:table-cell-properties fo:border="0.5mm wave #000000" style:cell-protect="protected" style:rotation-angle="0"/><style:paragraph-properties fo:text-align="left"/></style:style>' +
  '<style:style style:name="ce7" style:family="table-cell" style:parent-style-name="ce7"/>' +
  '<style:style style:name="ce8" style:family="table-cell"><style:map style:condition="cell-content()=1" style:apply-style-name="ce1"/><style:table-cell-properties fo:border-top="0.74pt solid red" fo:border-left="0.74pt #000000" style:vertical-align="justify"/><style:text-properties style:font-name="Unknown Face"/></style:style>' +
  '<style:style style:name="P1" style:family="paragraph"/>' +
  '</office:automatic-styles>';

// standard-mapping.md "Cell styles in the file": a style read through its parents to the default (D203, D204, D206).
describe('odsCellLooks', () => {
  const looks = odsCellLooks([root(LIBREOFFICE + AUTOMATIC)]);

  // The default style's wrap is LibreOffice's, never drawn (D207).
  it('reads the default as the cell’s own where it differs from LiveDoc’s, its ink as none', () => {
    expect(looks.of(undefined)).toEqual({ style: { ff: 'Liberation Sans', va: 'b' }, lost: false });
    expect(looks.of('Default')).toBe(looks.of(undefined));
    expect(looks.of('Heading')).toEqual({
      style: { b: true, ff: 'Liberation Sans', fs: 16, va: 'b' },
      lost: false,
    });
  });

  it('reads a style over its parents, property by property', () => {
    expect(looks.of('ce1')).toEqual({
      style: {
        i: true,
        u: true,
        st: true,
        fc: '#00ff00',
        bg: '#ffff00',
        ff: 'Lora',
        fs: 16,
        ha: 'c',
        va: 't',
        wr: 'w',
        bt: { w: 1, s: 'solid', c: '#ff0000' },
        br: { w: 1, s: 'solid', c: '#ff0000' },
        bb: { w: 1, s: 'solid', c: '#ff0000' },
        bl: { w: 3, s: 'dashed', c: '#0000ff' },
      },
      lost: false,
    });
    expect(looks.of('ce2')).toEqual({
      style: {
        b: true,
        ff: 'Roboto Mono',
        ha: 'r',
        bt: { w: 1, s: 'solid', c: '#000000' },
        bb: { w: 2, s: 'dotted', c: '#000000' },
      },
      lost: false,
    });
  });

  it('leaves out what the model cannot hold and says so', () => {
    expect(looks.of('ce3')).toEqual({ style: { ff: 'Liberation Sans', va: 'b' }, lost: true });
    expect(looks.of('ce4')).toEqual({ style: { ff: 'Liberation Sans', va: 'b' }, lost: true });
    expect(looks.of('ce5')).toEqual({ style: { fs: 7, va: 'b' }, lost: true });
    expect(looks.of('ce6')).toEqual({
      style: {
        ff: 'Liberation Sans',
        ha: 'l',
        va: 'b',
        bt: { w: 2, s: 'dashed', c: '#000000' },
        br: { w: 2, s: 'dashed', c: '#000000' },
        bb: { w: 2, s: 'dashed', c: '#000000' },
        bl: { w: 2, s: 'dashed', c: '#000000' },
      },
      lost: false,
    });
  });

  it('names a border, an alignment or a face it cannot read, and reads a face it does not declare by its name', () => {
    expect(looks.of('ce8')).toEqual({ style: { ff: 'Unknown Face' }, lost: true });
    expect(looks.of('P1')).toBe(looks.of(undefined));
  });

  it('reads a style it does not know, or one naming itself, as far as it goes', () => {
    expect(looks.of('missing')).toBe(looks.of(undefined));
    expect(looks.of('ce7')).toEqual(looks.of(undefined));
  });

  it('reads a file of no default style as saying nothing of its cells’ look (D203)', () => {
    expect(odsCellLooks([root('')]).of(undefined)).toEqual({ lost: false });
    const named = odsCellLooks([
      root(
        '<office:automatic-styles><style:style style:name="ce1" style:family="table-cell"><style:text-properties fo:font-weight="bold"/></style:style></office:automatic-styles>',
      ),
    ]);
    expect(named.of('ce1')).toEqual({ style: { b: true }, lost: false });
  });

  it('reads LiveDoc’s own default style as nothing of the cell’s own', () => {
    const own = odsCellLooks([
      root(`<office:styles>${ODS_DEFAULT_CELL_STYLES.join('')}</office:styles>`),
    ]);
    expect(own.of(undefined)).toEqual({ lost: false });
  });
});

describe('odsStyleProperties', () => {
  it('writes a style’s cell, paragraph and text properties', () => {
    expect(
      odsStyleProperties({
        b: true,
        i: true,
        u: true,
        st: true,
        fc: '#ff0000',
        bg: '#ffff00',
        ff: 'space-grotesk',
        fs: 12,
        ha: 'c',
        va: 't',
        wr: 'w',
        bt: { w: 1, s: 'solid', c: '#000000' },
        br: { w: 2, s: 'dashed', c: '#000000' },
        bb: { w: 3, s: 'dotted', c: '#0000ff' },
      }),
    ).toBe(
      '<style:table-cell-properties fo:background-color="#ffff00" fo:border-top="0.74pt solid #000000" ' +
        'fo:border-right="1.76pt dashed #000000" fo:border-bottom="2.49pt dotted #0000ff" style:vertical-align="top" ' +
        'fo:wrap-option="wrap"/><style:paragraph-properties fo:text-align="center" style:text-align-source="fix"/>' +
        '<style:text-properties fo:font-weight="bold" fo:font-style="italic" style:text-underline-style="solid" ' +
        'style:text-underline-width="auto" style:text-underline-color="font-color" style:text-line-through-style="solid" ' +
        `fo:color="#ff0000" fo:font-family="'Space Grotesk'" fo:font-size="12pt"/>`,
    );
  });

  it('writes the bottom and the start as themselves, and nothing for none', () => {
    expect(odsStyleProperties({ va: 'b', ha: 'l' })).toBe(
      '<style:table-cell-properties style:vertical-align="bottom"/>' +
        '<style:paragraph-properties fo:text-align="start" style:text-align-source="fix"/>',
    );
    expect(odsStyleProperties({ ha: 'r' })).toBe(
      '<style:paragraph-properties fo:text-align="end" style:text-align-source="fix"/>',
    );
    expect(odsStyleProperties(undefined)).toBe('');
    expect(odsStyleProperties({ b: true })).toBe('<style:text-properties fo:font-weight="bold"/>');
  });
});
