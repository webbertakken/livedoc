import { describe, expect, it } from 'vitest';
import { parseXml } from '@livedoc/office-packages';
import { cellsLinked, readXlsxHyperlinks } from './xlsx-hyperlinks';
import { cellLinkHref } from './ods-cell-text';
import type { FileCell } from './workbook-file';
import { SPREADSHEETML_NS } from './xlsx-parts';

// docs/specs/029-sheets/standard-mapping.md "Links in the file" (D642): what a worksheet's hyperlinks read as.

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const sheet = (links: string) => {
  const parsed = parseXml(
    `<worksheet xmlns="${SPREADSHEETML_NS}" xmlns:r="${R}" xmlns:x="urn:other"><hyperlinks>${links}</hyperlinks></worksheet>`,
  );
  if (!parsed.ok) throw new Error('xml');
  return parsed.root;
};
const rels = [{ id: 'rId1', type: 'h', target: 'https://docs.nu/', external: true }];

describe('readXlsxHyperlinks', () => {
  it('reads none from a sheet without hyperlinks', () => {
    const parsed = parseXml(`<worksheet xmlns="${SPREADSHEETML_NS}"/>`);
    if (!parsed.ok) throw new Error('xml');
    expect(readXlsxHyperlinks(parsed.root, SPREADSHEETML_NS, R, rels, () => true)).toEqual({
      links: [],
      read: [],
    });
  });

  it('passes over what is no cell’s link, reading the element whole', () => {
    const root = sheet(
      [
        '<x:hyperlink ref="A1" r:id="rId1"/>',
        '<hyperlink r:id="rId1"/>',
        '<hyperlink ref="A1:B2:C3" r:id="rId1"/>',
        '<hyperlink ref="A1:nope" r:id="rId1"/>',
        '<hyperlink ref="C3:B2" r:id="rId1"/>',
        '<hyperlink ref="A9" r:id="rIdGone"/>',
      ].join(''),
    );
    const read = readXlsxHyperlinks(root, SPREADSHEETML_NS, R, rels, () => true);
    expect(read.links).toEqual([
      { r1: 1, c1: 1, r2: 2, c2: 2, link: { href: 'https://docs.nu/' } },
    ]);
    expect(read.read).toHaveLength(1);
  });
});

describe('cellsLinked', () => {
  it('links a block’s cells read and its top left, none past the limits', () => {
    const cells: FileCell[] = [
      { r: 0, c: 0 },
      { r: 1, c: 1 },
      { r: 5, c: 5 },
    ];
    const link = { href: 'https://docs.nu/' };
    cellsLinked(
      cells,
      [
        { r1: 1, c1: 0, r2: 2, c2: 1, link },
        { r1: 9, c1: 0, r2: 9, c2: 0, link },
        { r1: 0, c1: 9, r2: 0, c2: 9, link },
      ],
      { rows: 8, cols: 8 },
    );
    expect(cells.filter((c) => c.link).map((c) => [c.r, c.c])).toEqual([
      [1, 1],
      [1, 0],
    ]);
    cellsLinked(cells, [], { rows: 8, cols: 8 });
  });
});

describe('cellLinkHref', () => {
  const cell = (inner: string) => {
    const parsed = parseXml(
      `<table:table-cell xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:xlink="http://www.w3.org/1999/xlink">${inner}</table:table-cell>`,
    );
    if (!parsed.ok) throw new Error('xml');
    return parsed.root;
  };
  it('reads a cell wholly one address, never one without an address or text', () => {
    expect(
      cellLinkHref(cell('<text:p><text:a xlink:href="https://docs.nu/">a</text:a></text:p>')),
    ).toBe('https://docs.nu/');
    expect(cellLinkHref(cell('<text:p><text:a xlink:href="">a</text:a></text:p>'))).toBeNull();
    expect(
      cellLinkHref(cell('<text:p><text:a xlink:href="https://docs.nu/"></text:a></text:p>')),
    ).toBeNull();
    expect(cellLinkHref(cell(''))).toBeNull();
    expect(cellLinkHref(cell('<text:p><text:span>a</text:span></text:p>'))).toBeNull();
    expect(
      cellLinkHref(
        cell(
          '<text:p><text:a xlink:href="https://a/">a</text:a></text:p><text:p><text:a xlink:href="https://b/">b</text:a></text:p>',
        ),
      ),
    ).toBeNull();
  });
});
