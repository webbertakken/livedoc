// docs/specs/029-sheets/standard-mapping.md "Sheet name, hidden, tab colour": a table style's display and tab colour.
import { parseXml, ODF_NS } from '@livedoc/office-packages';
import { describe, expect, it } from 'vitest';
import { readOds } from './ods-read';
import { odsTabLooks, odsTableProperties } from './ods-tab-look';
import { writeFlatOds, writeOds } from './ods-write';

const styles = (body: string) => {
  const parsed = parseXml(
    `<office:document-content xmlns:office="${ODF_NS.office}" xmlns:style="${ODF_NS.style}" ` +
      `xmlns:table="${ODF_NS.table}" xmlns:tableooo="${ODF_NS.tableooo}">` +
      `<office:automatic-styles>${body}</office:automatic-styles></office:document-content>`,
  );
  if (!parsed.ok) throw new Error('xml');
  return odsTabLooks([parsed.root]);
};

describe('the ODF tab look', () => {
  it("reads a table style's display and tab colour, nothing for others", () => {
    const look = styles(
      '<style:style style:name="ta1" style:family="table">' +
        '<style:table-properties table:display="false" tableooo:tab-color="#1A73E8"/></style:style>' +
        '<style:style style:name="ta2" style:family="table">' +
        '<style:table-properties table:display="true" tableooo:tab-color="blue"/></style:style>' +
        '<style:style style:name="ta4" style:family="table">' +
        '<style:table-properties table:tab-color="#00FF00"/></style:style>' +
        '<style:style style:name="ce1" style:family="table-cell"><style:table-properties/></style:style>' +
        '<style:style style:family="table"><style:table-properties/></style:style>' +
        '<style:style style:name="ta3" style:family="table"/>',
    );
    expect(look('ta1')).toEqual({ tabColour: '#1a73e8', hidden: true });
    expect(look('ta4')).toEqual({ tabColour: '#00ff00' });
    expect([look('ta2'), look('ce1'), look('ta3'), look('none'), look(undefined)]).toEqual([
      {},
      {},
      {},
      {},
      {},
    ]);
  });

  it('writes the properties a look needs, and none for none', () => {
    expect(odsTableProperties({})).toBeNull();
    expect(odsTableProperties({ tabColour: '#00ff00' })).toBe(
      '<style:table-properties table:display="true" table:tab-color="#00ff00"/>',
    );
  });

  it('carries a hidden sheet and a tab colour through a file, one style for each look', async () => {
    const sheet = { rows: 1, cols: 1, cells: [] };
    const file = {
      sheets: [
        { ...sheet, name: 'A', hidden: true as const },
        { ...sheet, name: 'B', tabColour: '#1a73e8' },
        { ...sheet, name: 'C', hidden: true as const },
        { ...sheet, name: 'D' },
      ],
    };
    const read = await readOds(writeOds(file, 'T').data);
    if (!read.ok) throw new Error(read.rejection);
    expect(read.file.sheets.map((s) => [s.hidden, s.tabColour])).toEqual([
      [true, undefined],
      [undefined, '#1a73e8'],
      [true, undefined],
      [undefined, undefined],
    ]);
    const flat = writeFlatOds(file, 'T').data;
    expect(flat.match(/style:family="table"/g)).toHaveLength(2);
    expect(flat).toContain('table:tab-color="#1a73e8"');
  });
});
