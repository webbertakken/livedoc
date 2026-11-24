import { describe, expect, it } from 'vitest';
import { childElements, parseXml, type XmlElement } from '@livedoc/office-packages';
import { readXlsxStylesheet, xlsxCellStyleOf, XlsxStyleParts } from './xlsx-cell-style';
import { SPREADSHEETML_NS } from './xlsx-parts';

const sheetOf = (body: string) => {
  const xml = `<styleSheet xmlns="${SPREADSHEETML_NS}">${body}</styleSheet>`;
  const parsed = parseXml(xml, 'xl/styles.xml');
  if (!parsed.ok) throw new Error('bad xml');
  const stylesheet = readXlsxStylesheet(parsed.root, SPREADSHEETML_NS, []);
  const xfs = childElements(childElements(parsed.root).find((e) => e.local === 'cellXfs')!);
  return (i: number) => xlsxCellStyleOf(xfs[i] as XmlElement, stylesheet);
};

const FONTS =
  '<fonts><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>' +
  '<font><b/><i/><u/><strike/><sz val="14.4"/><color rgb="FFFF0000"/><name val="Lora"/></font>' +
  '<font><b val="0"/><u val="none"/><sz val="10"/><color theme="1"/><name val="Arial"/></font>' +
  '<font><sz val="10"/><name val="Bad;Name"/></font><font><u val="double"/><sz val="999"/></font></fonts>';
const FILLS =
  '<fills><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/></patternFill></fill>' +
  '<fill><gradientFill/></fill><fill><patternFill patternType="solid"/></fill></fills>';
const BORDERS =
  '<borders><border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FF0000FF"/></left><right style="mediumDashDot"/>' +
  '<top style="double"/><bottom style="hair"/><diagonal/></border>' +
  '<border><left style="none"/><diagonal style="thin"/></border><border><left style="weird"/></border></borders>';

// standard-mapping.md "Cell styles in the file": a style read against LiveDoc's defaults (D203, D204, D206).
describe('xlsxCellStyleOf', () => {
  const xfOf = sheetOf(
    FONTS +
      FILLS +
      BORDERS +
      '<cellXfs>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>' +
      '<xf fontId="1" fillId="2" borderId="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>' +
      '<xf fontId="2"><alignment horizontal="general" vertical="center"/></xf>' +
      '<xf fontId="3" fillId="3"><alignment horizontal="justify" vertical="distributed" textRotation="45"/></xf>' +
      '<xf fontId="4" fillId="1" borderId="2"><protection locked="0"/></xf>' +
      '<xf fontId="9" fillId="4" borderId="3"><alignment horizontal="left"/><protection locked="1"/></xf>' +
      '<xf><alignment horizontal="right" vertical="bottom" wrapText="0"/></xf>' +
      '</cellXfs>',
  );

  it('reads the file’s default style as the cell’s own where it differs, its font colour as none', () => {
    expect(xlsxCellStyleOf.length).toBe(2);
    expect(xfOf(0)).toEqual({ style: { ff: 'Calibri', fs: 11, va: 'b' }, lost: false });
  });

  it('reads a font, a solid fill, borders and an alignment', () => {
    expect(xfOf(1)).toEqual({
      style: {
        b: true,
        i: true,
        u: true,
        st: true,
        fc: '#ff0000',
        ff: 'Lora',
        fs: 14,
        bg: '#ffff00',
        bl: { w: 1, s: 'solid', c: '#0000ff' },
        br: { w: 2, s: 'dashed', c: '#000000' },
        bt: { w: 3, s: 'solid', c: '#000000' },
        bb: { w: 1, s: 'dotted', c: '#000000' },
        ha: 'c',
        va: 't',
        wr: 'w',
      },
      lost: false,
    });
  });

  it('reads Arial 10 and the middle as nothing of the cell’s own (D204)', () => {
    expect(xfOf(2)).toEqual({ lost: false });
    expect(xfOf(6)).toEqual({ style: { ff: 'Calibri', fs: 11, ha: 'r', va: 'b' }, lost: false });
  });

  it('leaves out what the model cannot hold and says so', () => {
    expect(xfOf(3)).toEqual({ lost: true });
    expect(xfOf(4)).toEqual({ style: { u: true, fs: 400, va: 'b' }, lost: true });
    expect(xfOf(5)).toEqual({ style: { ha: 'l', va: 'b' }, lost: true });
  });
});

describe('a styles part missing its lists', () => {
  it('reads a style naming parts it lacks as the defaults, Bottom for the file', () => {
    const xfOf = sheetOf('<cellXfs><xf fontId="2" fillId="5" borderId="4"/></cellXfs>');
    expect(xfOf(0)).toEqual({ style: { va: 'b' }, lost: false });
  });

  it('reads an empty fill, a pattern of no type and a border of no sides as none', () => {
    const xfOf = sheetOf(
      '<fills><fill/><fill><patternFill/></fill></fills><borders><border/></borders>' +
        '<cellXfs><xf fillId="0" borderId="0"/><xf fillId="1"/></cellXfs>',
    );
    expect(xfOf(0)).toEqual({ style: { va: 'b' }, lost: false });
    expect(xfOf(1)).toEqual({ style: { va: 'b' }, lost: false });
  });
});

describe('XlsxStyleParts', () => {
  it('writes LiveDoc’s default font first and each distinct font, fill and border once', () => {
    const parts = new XlsxStyleParts();
    expect(parts.font(undefined)).toBe(0);
    expect(parts.font({ b: true, fs: 12, fc: '#ff0000', ff: 'space-grotesk' })).toBe(1);
    expect(parts.font({ i: true, u: true, st: true })).toBe(2);
    expect(parts.font({ b: true, fs: 12, fc: '#ff0000', ff: 'space-grotesk', ha: 'c' })).toBe(1);
    expect(parts.fill({})).toBe(0);
    expect(parts.fill({ bg: '#ffff00' })).toBe(2);
    expect(parts.fill({ bg: '#ffff00' })).toBe(2);
    expect(parts.border({})).toBe(0);
    expect(parts.border({ bl: { w: 1, s: 'solid', c: '#000000' } })).toBe(1);
    expect(
      parts.border({
        bl: { w: 1, s: 'solid', c: '#0000ff' },
        br: { w: 2, s: 'solid', c: '#000000' },
        bt: { w: 3, s: 'dashed', c: '#000000' },
        bb: { w: 2, s: 'dotted', c: '#000000' },
      }),
    ).toBe(2);
    const xml = parts.xml();
    expect(xml.fonts).toBe(
      '<fonts count="3"><font><sz val="10"/><name val="Arial"/></font>' +
        '<font><b/><sz val="12"/><color rgb="FFFF0000"/><name val="Space Grotesk"/></font>' +
        '<font><i/><strike/><u/><sz val="10"/><name val="Arial"/></font></fonts>',
    );
    expect(xml.fills).toBe(
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill></fills>',
    );
    expect(xml.borders).toBe(
      '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border><left style="thin"><color rgb="FF000000"/></left><right/><top/><bottom/><diagonal/></border>' +
        '<border><left style="thin"><color rgb="FF0000FF"/></left><right style="medium"><color rgb="FF000000"/></right>' +
        '<top style="mediumDashed"><color rgb="FF000000"/></top><bottom style="dotted"><color rgb="FF000000"/></bottom>' +
        '<diagonal/></border></borders>',
    );
  });

  it('writes an alignment, the grid’s middle for none (D204)', () => {
    const parts = new XlsxStyleParts();
    expect(parts.alignment(undefined)).toBe('<alignment vertical="center"/>');
    expect(parts.alignment({ ha: 'r', va: 'b', wr: 'w' })).toBe(
      '<alignment horizontal="right" wrapText="1"/>',
    );
    expect(parts.alignment({ ha: 'l', va: 't' })).toBe(
      '<alignment horizontal="left" vertical="top"/>',
    );
    expect(parts.alignment({ ha: 'c' })).toBe('<alignment horizontal="center" vertical="center"/>');
  });
});
