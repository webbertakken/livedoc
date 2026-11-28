// @vitest-environment jsdom
// Pictures held in cells (docs/specs/029-sheets/inserted-objects.md "Images in a cell", D630, D632): Insert Image in
// Cell puts a picked picture in the active cell, dimmed where images cannot be placed; on a picture cell its Alt Text
// and Place Image over Cells, and an image over cells' Place Image in Selected Cell, each one write; an Editor's alone.
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetImage } from '@livedoc/sheets';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
  SHEET_ID,
  type SheetHarness,
} from '@/components/sheets/sheet-ui-test-utils';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  CELL_PICTURE_ALT_TEXT,
  IMAGES_LOCAL_IN_CELL_HINT,
  INSERT_IMAGE_IN_CELL,
  PLACE_IMAGE_OVER_CELLS,
} from '@/lib/spreadsheet/sheet-image-menu';
import { PICTURE_NOT_PLACED } from './useSpreadsheetImages';
import { useSpreadsheetCellPictures } from './useSpreadsheetCellPictures';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
import { track } from '@/lib/telemetry';

const natural = vi.fn<() => Promise<{ width: number; height: number } | null>>();
vi.mock('./picture-natural-size', () => ({ pictureNaturalSize: () => natural() }));
// The lazy picker, as a stand-in handing back a gallery picture or an embedded one.
vi.mock('next/dynamic', () => ({
  default: () =>
    function Picker(props: {
      onSelect: (p: { id: string; width: number; height: number }) => void;
      onClose: () => void;
    }) {
      return (
        <div role="dialog" aria-label="Picker">
          <button
            type="button"
            onClick={() => props.onSelect({ id: 'g-1', width: 90, height: 60 })}
          >
            pick
          </button>
          <button
            type="button"
            onClick={() => props.onSelect({ id: 'data:image/png;base64,AA', width: 9, height: 9 })}
          >
            pick embedded
          </button>
          <button type="button" onClick={props.onClose}>
            close
          </button>
        </div>
      );
    },
}));

beforeAll(stubResizeObserver);
beforeEach(() => {
  vi.mocked(track).mockClear();
  natural.mockReset();
  natural.mockResolvedValue({ width: 1200, height: 600 });
});
afterEach(cleanup);

const imagesOf = (h: SheetHarness) =>
  (h.store.sheet(SHEET_ID)?.layout.objects ?? []).filter(
    (x): x is SheetImage => x.kind === 'image',
  );

async function setup(opts: { canShape?: boolean; placing?: 'ready' | 'local' } = {}) {
  const h = await makeSheet({ rows: 10, cols: 8 });
  let actions: OfficeActions = {};
  renderSheet(
    h,
    ({ c }) => {
      const pictures = useSpreadsheetCellPictures(
        c,
        { ownerId: 'o1', documentId: 'd1', shareCode: null },
        opts.placing ?? 'ready',
      );
      actions = pictures.actions;
      return <>{pictures.dialogs}</>;
    },
    { canShape: opts.canShape ?? true },
  );
  return { h, actions: () => actions };
}

async function pictureInC3() {
  const s = await setup();
  act(() => s.h.select('C3'));
  act(() => s.actions()[INSERT_IMAGE_IN_CELL]!.run());
  fireEvent.click(screen.getByRole('button', { name: 'pick' }));
  return s;
}

describe('Insert Image in Cell', () => {
  it('puts the picked picture in the active cell, one change, counted', async () => {
    const { h, actions } = await pictureInC3();
    expect(h.cell('C3')?.input).toEqual({ img: { id: 'g-1' } });
    expect(screen.queryByRole('dialog', { name: 'Picker' })).toBeNull();
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Added', 'ImageInCell');
    expect(actions()[CELL_PICTURE_ALT_TEXT]).toBeDefined();
    expect(actions()[PLACE_IMAGE_OVER_CELLS]).toBeDefined();
  });

  it('never places an embedded picture, saying so', async () => {
    const { h, actions } = await setup();
    act(() => actions()[INSERT_IMAGE_IN_CELL]!.run());
    fireEvent.click(screen.getByRole('button', { name: 'pick embedded' }));
    expect(h.cell('A1')).toBeUndefined();
    expect(h.announce).toHaveBeenCalledWith(PICTURE_NOT_PLACED);
  });

  it('closes the picker without placing anything', async () => {
    const { h, actions } = await setup();
    act(() => actions()[INSERT_IMAGE_IN_CELL]!.run());
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByRole('dialog', { name: 'Picker' })).toBeNull();
    expect(h.cell('A1')).toBeUndefined();
  });

  it('is dimmed in This Browser, saying to sync', async () => {
    const { actions } = await setup({ placing: 'local' });
    expect(actions()[INSERT_IMAGE_IN_CELL]).toMatchObject({
      disabled: true,
      hint: IMAGES_LOCAL_IN_CELL_HINT,
    });
  });

  it('is an Editor’s alone, as are a picture cell’s items', async () => {
    const { actions } = await setup({ canShape: false });
    expect(actions()).toEqual({});
  });

  it('offers a cell’s items only on a cell holding a picture', async () => {
    const { h, actions } = await pictureInC3();
    act(() => h.select('A1'));
    expect(actions()[CELL_PICTURE_ALT_TEXT]).toBeUndefined();
    expect(actions()[INSERT_IMAGE_IN_CELL]).toBeDefined();
  });
});

describe('a cell’s picture', () => {
  it('takes alt text, the title folded in, and loses it when emptied', async () => {
    const { h, actions } = await pictureInC3();
    act(() => actions()[CELL_PICTURE_ALT_TEXT]!.run());
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Cat' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'On a mat' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(h.cell('C3')?.input).toEqual({ img: { id: 'g-1', alt: 'Cat\nOn a mat' } });
    act(() => actions()[CELL_PICTURE_ALT_TEXT]!.run());
    const description = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Description' });
    expect(description.value).toBe('Cat\nOn a mat');
    fireEvent.change(description, { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(h.cell('C3')?.input).toEqual({ img: { id: 'g-1' } });
  });

  it('keeps its alt text on Cancel, and changes nothing when the picture went meanwhile', async () => {
    const { h, actions } = await pictureInC3();
    act(() => actions()[CELL_PICTURE_ALT_TEXT]!.run());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.cell('C3')?.input).toEqual({ img: { id: 'g-1' } });
    act(() => actions()[CELL_PICTURE_ALT_TEXT]!.run());
    act(() => {
      const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
      h.store.write(SHEET_ID, {
        kind: 'cells',
        cells: [{ r: rows[2]!, c: cols[2]!, i: { s: 'typed over' } }],
      });
    });
    expect(screen.queryByRole('dialog', { name: 'Alt text' })).toBeNull();
    expect(h.cell('C3')?.input).toEqual({ s: 'typed over' });
  });

  it('is placed over the cells at its cell, fitted, its cell emptied, in one change', async () => {
    const { h, actions } = await pictureInC3();
    act(() => actions()[CELL_PICTURE_ALT_TEXT]!.run());
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'Wide' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    act(() => actions()[PLACE_IMAGE_OVER_CELLS]!.run());
    await waitFor(() => expect(imagesOf(h)).toHaveLength(1));
    const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
    expect(imagesOf(h)[0]).toMatchObject({
      at: { r: rows[2], c: cols[2], dx: 0, dy: 0 },
      width: 600,
      height: 300,
      imageId: 'g-1',
      alt: 'Wide',
    });
    expect(h.cell('C3')).toBeUndefined();
  });

  it('lands square over the cells when its size cannot be read', async () => {
    natural.mockResolvedValue(null);
    const { h, actions } = await pictureInC3();
    act(() => actions()[PLACE_IMAGE_OVER_CELLS]!.run());
    await waitFor(() => expect(imagesOf(h)[0]).toMatchObject({ width: 400, height: 400 }));
  });
});
