// Rows and columns in ODF (standard-mapping.md "Rows and columns in the file", D124, D167).
import { describe, expect, it } from 'vitest';
import { childElement, ODF_NS, parseXml } from '@livedoc/office-packages';
import { odsLineStyles, OdsAxisOut, readOdsLines } from './ods-lines';

const { office, style, table } = ODF_NS;
const STYLES =
  `<office:automatic-styles>` +
  `<style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="1in"/></style:style>` +
  `<style:style style:name="co2" style:family="table-column"><style:table-column-properties style:column-width="2in"/></style:style>` +
  `<style:style style:name="co3" style:family="table-column"><style:table-column-properties/></style:style>` +
  `<style:style style:name="ro1" style:family="table-row"><style:table-row-properties style:row-height="0.25in" style:use-optimal-row-height="true"/></style:style>` +
  `<style:style style:name="ro2" style:family="table-row"><style:table-row-properties style:row-height="0.5in"/></style:style>` +
  `<style:style style:name="ro3" style:family="table-row"/><style:default-style/><style:style/>` +
  `</office:automatic-styles>`;

function read(body: string, max = { rows: 20, cols: 6 }) {
  const parsed = parseXml(
    `<office:document xmlns:office="${office}" xmlns:style="${style}" xmlns:table="${table}">${STYLES}` +
      `<table:table>${body}</table:table></office:document>`,
  );
  if (!parsed.ok) throw new Error('xml');
  const t = childElement(parsed.root, table, 'table')!;
  return readOdsLines(t, odsLineStyles([parsed.root]), max);
}

describe('readOdsLines', () => {
  it('reads sizes, the size most lines carry as the sheet’s own, rows sized only off their text’s height', () => {
    const lines = read(
      '<table:table-header-columns><table:table-column table:style-name="co2"/></table:table-header-columns>' +
        '<table:table-column table:style-name="co1" table:number-columns-repeated="3"/>' +
        '<table:table-column table:style-name="co3" table:number-columns-repeated="0"/>' +
        '<table:table-column table:style-name="co1" table:number-columns-repeated="99"/>' +
        '<table:table-row table:style-name="ro2"/><table:table-row table:style-name="ro1" table:number-rows-repeated="5"/>' +
        '<table:table-row table:style-name="ro3"/><table:table-row/><foreign/>',
    );
    expect(lines.c).toEqual({ lines: new Map([[0, { size: 192 }]]), collapsed: [], size: 96 });
    expect(lines.r).toEqual({ lines: new Map([[0, { size: 48 }]]), collapsed: [], size: 24 });
  });

  it('reads hidden lines and nested groups, a collapsed one by its display, the controls after (D167)', () => {
    const lines = read(
      '<table:table-rows><table:table-row table:visibility="collapse"/><table:table-row table:visibility="filter"/></table:table-rows>' +
        '<table:table-row-group><table:table-row/>' +
        '<table:table-row-group table:display="false"><table:table-row table:visibility="collapse"/></table:table-row-group>' +
        '<table:table-row-group table:display="false"/></table:table-row-group>',
    );
    expect(lines.r).toEqual({
      lines: new Map([
        [0, { hidden: true }],
        [2, { depth: 1 }],
        [3, { hidden: true, depth: 2 }],
      ]),
      collapsed: [{ at: 3, depth: 2 }],
      after: true,
    });
    expect(lines.c).toBeUndefined();
  });

  it('reads no further than the grid a sheet makes', () => {
    const lines = read(
      '<table:table-row table:visibility="collapse" table:number-rows-repeated="1048576"/>',
      {
        rows: 3,
        cols: 1,
      },
    );
    expect(lines.r?.lines.size).toBe(3);
  });
});

describe('OdsAxisOut', () => {
  it('writes a sheet with no lines of its own unstyled, in no group', () => {
    const out = new OdsAxisOut(undefined, 'table-row', () => 'ro1');
    expect(out.breaks()).toEqual([]);
    expect(out.at(3)).toEqual({ attrs: '', depth: 0 });
    expect(out.nest([{ from: 0, xml: ['<row/>'] }], 'table-row-group')).toEqual(['<row/>']);
  });

  it('closes the groups still open at the end', () => {
    const out = new OdsAxisOut(
      { lines: new Map([[1, { depth: 1 }]]), collapsed: [] },
      'table-row',
      () => 'ro1',
    );
    expect(
      out.nest(
        [
          { from: 0, xml: ['<a/>'] },
          { from: 1, xml: ['<b/>'] },
        ],
        'table-row-group',
      ),
    ).toEqual(['<a/>', '<table:table-row-group>', '<b/>', '</table:table-row-group>']);
  });
});
