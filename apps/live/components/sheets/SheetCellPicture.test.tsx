// @vitest-environment jsdom

// A gallery picture held in a cell (docs/specs/029-sheets/inserted-objects.md "Images in a cell", D630, D631): nothing
// until its bytes arrive or when they fail, then drawn filling the cell's box in proportion, faded while waiting; drawn
// by the grid where the spreadsheet says who asks for the bytes, in its cell and through a reference to it; spoken by
// its alt text, else as "Image".
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CellMap, cellKey, pictureInput, Workbook, type Sheet } from '@livedoc/sheets';
import { planPalette } from '@/components/plan/plan-palette';
import { cellSpokenValue, pictureLabel } from './sheet-cell-speech';
import { SheetCellPicture } from './SheetCellPicture';
import { SheetCells } from './SheetCells';
import { geometryOf, visibleWindow } from './sheet-geometry';
import { SheetPictureAccessContext } from './sheet-picture-access-context';

type BlobState = { status: 'loading' } | { status: 'ready'; src: string } | { status: 'broken' };
const blobState = vi.fn<(owner: string, id: string | null, opts: unknown) => BlobState>();
vi.mock('@/hooks/persistence/useImageBlobUrl', () => ({
  useImageBlobUrl: (owner: string, id: string | null, opts: unknown) => blobState(owner, id, opts),
}));

beforeEach(() => {
  blobState.mockReset();
  blobState.mockReturnValue({ status: 'ready', src: 'blob:p' });
});
afterEach(cleanup);

const access = { ownerId: 'o1', documentId: 'd1', shareCode: 'share' };
const box = { x: 10, y: 20, w: 100, h: 40 };

describe('SheetCellPicture', () => {
  it('asks for its bytes as the document’s, then fills the cell’s box in proportion', () => {
    const { container } = render(
      <SheetCellPicture picture={{ id: 'g-1' }} access={access} box={box} />,
    );
    expect(blobState).toHaveBeenCalledWith('o1', 'g-1', { documentId: 'd1', shareCode: 'share' });
    const shown = container.querySelector<HTMLElement>('[data-sheet-cell-picture="g-1"]')!;
    expect(shown.style.left).toBe('10px');
    expect(shown.style.height).toBe('40px');
    expect(shown.style.opacity).toBe('');
    const img = shown.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('blob:p');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.style.objectFit).toBe('contain');
  });

  it.each([{ status: 'loading' as const }, { status: 'broken' as const }])(
    'draws nothing while $status',
    (state) => {
      blobState.mockReturnValue(state);
      const { container } = render(
        <SheetCellPicture picture={{ id: 'g-1' }} access={access} box={box} />,
      );
      expect(container.innerHTML).toBe('');
    },
  );

  it('fades as a waiting value does', () => {
    const { container } = render(
      <SheetCellPicture picture={{ id: 'g-1' }} access={access} box={box} waitingOpacity={0.5} />,
    );
    expect(container.querySelector<HTMLElement>('[data-sheet-cell-picture]')!.style.opacity).toBe(
      '0.5',
    );
  });
});

function pictured(): { sheet: Sheet; workbook: Workbook } {
  const layout = {
    rows: ['r0', 'r1', 'r2'],
    cols: ['c0', 'c1', 'c2'],
  };
  const sheet: Sheet = {
    id: 's1',
    tabId: 't1',
    title: 'Sheet 1',
    layout,
    cells: new CellMap(),
    rev: 0,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: { id: '', name: '', color: '#000000' },
  };
  sheet.cells.set(cellKey('r0', 'c0'), { input: pictureInput('g-cat', 'A cat') });
  sheet.cells.set(cellKey('r1', 'c0'), { input: pictureInput('g-dot') });
  sheet.cells.set(cellKey('r2', 'c1'), { input: { f: { t: '=@0', r: [{ r1: 'r0', c1: 'c0' }] } } });
  return { sheet, workbook: new Workbook({ sheets: [sheet], locale: 'en-GB' }) };
}

describe('a cell’s picture in the grid', () => {
  it('is drawn in its cell and through a reference, only where the spreadsheet gives access', () => {
    const { sheet, workbook } = pictured();
    const geometry = geometryOf(sheet.layout);
    const scroll = { top: 0, left: 0 };
    const cells = (
      <SheetCells
        sheet={sheet}
        workbook={workbook}
        version={0}
        geometry={geometry}
        window={visibleWindow(geometry, scroll, { width: 800, height: 400 })}
        scroll={scroll}
        palette={planPalette('light')}
        locale="en-GB"
      />
    );
    const plain = render(cells);
    expect(plain.container.querySelector('[data-sheet-cell-picture]')).toBeNull();
    plain.unmount();
    const { container } = render(
      <SheetPictureAccessContext.Provider value={access}>
        {cells}
      </SheetPictureAccessContext.Provider>,
    );
    const drawn = [...container.querySelectorAll('[data-sheet-cell-picture]')].map((e) =>
      e.getAttribute('data-sheet-cell-picture'),
    );
    expect(drawn).toEqual(['g-cat', 'g-dot', 'g-cat']);
  });

  it('is spoken by its alt text, else as an image', () => {
    const { sheet, workbook } = pictured();
    expect(cellSpokenValue(sheet, workbook, 'en-GB', 0, 0)).toBe('A cat');
    expect(cellSpokenValue(sheet, workbook, 'en-GB', 1, 0)).toBe('Image');
    expect(cellSpokenValue(sheet, workbook, 'en-GB', 2, 1)).toBe('A cat');
    expect(pictureLabel({ id: 'x', alt: '' })).toBe('Image');
  });
});
