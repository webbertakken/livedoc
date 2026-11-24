// docs/specs/029-sheets/standard-mapping.md "Sheet name, hidden, tab colour" (D182).
import { parseXml } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readXlsxTabLook, tabColourOfRgb, xlsxTabColor } from './xlsx-tab-look';
import { SPREADSHEETML_NS } from './xlsx-parts';

const root = (xml: string) => {
  const parsed = parseXml(xml);
  if (!parsed.ok) throw new Error('xml');
  return parsed.root;
};
const look = (state: string, sheetPr: string) =>
  readXlsxTabLook(
    root(`<sheet name="S"${state}/>`),
    root(`<worksheet xmlns="${SPREADSHEETML_NS}">${sheetPr}</worksheet>`),
    SPREADSHEETML_NS,
  );

describe('the XLSX tab look', () => {
  it('reads hidden and very hidden as hidden, and an rgb tab colour', () => {
    expect(look(' state="hidden"', '<sheetPr><tabColor rgb="FF1A73E8"/></sheetPr>')).toEqual({
      tabColour: '#1a73e8',
      hidden: true,
    });
    expect(look(' state="veryHidden"', '')).toEqual({ hidden: true });
    expect(look(' state="visible"', '<sheetPr><tabColor theme="4"/></sheetPr>')).toEqual({});
    expect(look('', '<sheetPr/>')).toEqual({});
  });

  it('takes six or eight digits, and writes eight, opaque', () => {
    expect(tabColourOfRgb('00ff00')).toBe('#00ff00');
    expect([tabColourOfRgb('red'), tabColourOfRgb(undefined)]).toEqual([null, null]);
    expect(xlsxTabColor('#1a73e8')).toBe('<tabColor rgb="FF1A73E8"/>');
    expect(xlsxTabColor('#1a73e8', 'x:')).toBe('<x:tabColor rgb="FF1A73E8"/>');
  });
});
