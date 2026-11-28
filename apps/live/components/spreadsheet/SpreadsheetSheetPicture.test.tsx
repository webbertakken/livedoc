// @vitest-environment jsdom
// docs/specs/029-sheets/plan-links.md "The Spreadsheet slot" (D507): a sheet read-only, as a picture of its cells from
// A1, in a region that scrolls and takes focus.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { applySheetWrite, emptySheet, NOBODY, Workbook, type Sheet } from '@livedoc/sheets';
import { SpreadsheetSheetPicture } from './SpreadsheetSheetPicture';
import { sheetPictureSvg } from './sheet-picture';

afterEach(cleanup);

function book(text: string): Workbook {
  let sheet: Sheet = emptySheet({
    id: 'sheetA',
    tabId: 'tabA',
    title: 'Costs',
    layout: { rows: ['r1', 'r2'], cols: ['c1', 'c2'] },
  });
  sheet = applySheetWrite(
    sheet,
    { kind: 'cells', cells: [{ r: 'r1', c: 'c1', i: { s: text } }] },
    { now: 0, by: NOBODY },
  ).sheet;
  return new Workbook({ sheets: [sheet], locale: 'en-GB' });
}

describe('a sheet’s picture', () => {
  it('draws its cells as an SVG document, none for a sheet it does not hold', () => {
    const svg = sheetPictureSvg(book('Rent'), 'sheetA', 'Costs')!;
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('Rent');
    expect(sheetPictureSvg(book('Rent'), 'nope', 'Costs')).toBeNull();
  });

  it('shows it as an image in a focusable region named for it', () => {
    render(
      <SpreadsheetSheetPicture
        wb={book('Rent <b>&')}
        sheetId="sheetA"
        title="Costs"
        label="Costs · Budget"
        version={1}
      />,
    );
    const region = screen.getByRole('region', { name: 'Costs · Budget' });
    expect(region.tabIndex).toBe(0);
    const img = screen.getByRole<HTMLImageElement>('img', { name: 'Costs · Budget' });
    expect(img.src.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    // The cell's text is escaped in the picture, never markup of its own.
    const svg = decodeURIComponent(img.src.slice(img.src.indexOf(',') + 1));
    expect(svg).toContain('Rent &lt;b&gt;&amp;');
  });

  it('draws nothing for a sheet the workbook does not hold', () => {
    const { container } = render(
      <SpreadsheetSheetPicture wb={book('x')} sheetId="nope" title="C" label="C" version={1} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
