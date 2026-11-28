// @vitest-environment jsdom
// A spreadsheet's images over cells (docs/specs/029-sheets/inserted-objects.md "Images over cells", D623, D625): Insert
// Image over Cells places a picked picture at the active cell, fitted to 600 by 400 and selected; dimmed where images
// cannot be placed; each image's menu sets its alt text, replaces it or deletes it, one change each; an Editor's alone.
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
import { SheetImagesOverCellsContext } from '@/components/sheets/sheet-images-over-cells-context';
import { IMAGE_MENU_LABEL, SheetImagesLayer } from '@/components/sheets/SheetImagesLayer';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import {
  IMAGES_LOCAL_HINT,
  IMAGES_UNAVAILABLE_HINT,
  INSERT_IMAGE_OVER_CELLS,
} from '@/lib/spreadsheet/sheet-image-menu';
import { PICTURE_NOT_PLACED, useSpreadsheetImages } from './useSpreadsheetImages';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
import { track } from '@/lib/telemetry';

const listImages = vi.fn<(owner: string) => Promise<unknown[] | null>>();
vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiListImages: (owner: string) => listImages(owner),
}));
const offline = vi.fn((_id: string) => false);
vi.mock('@/lib/offline/offline-store', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isOfflineIdSync: (id: string) => offline(id),
}));
vi.mock('@/hooks/persistence/useImageBlobUrl', () => ({
  useImageBlobUrl: () => ({ status: 'ready', src: 'blob:x' }),
}));
// The lazy picker, as a stand-in handing back one picture of each kind.
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
            onClick={() => props.onSelect({ id: 'g-1', width: 1200, height: 800 })}
          >
            pick wide
          </button>
          <button
            type="button"
            onClick={() => props.onSelect({ id: 'g-2', width: 100, height: 300 })}
          >
            pick tall
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
  listImages.mockReset();
  listImages.mockResolvedValue([]);
  offline.mockReturnValue(false);
});
afterEach(cleanup);

const imagesOf = (h: SheetHarness) =>
  (h.store.sheet(SHEET_ID)?.layout.objects ?? []).filter(
    (x): x is SheetImage => x.kind === 'image',
  );

async function setup(opts: { canShape?: boolean } = {}) {
  const h = await makeSheet({ rows: 10, cols: 8 });
  let actions: OfficeActions = {};
  renderSheet(
    h,
    ({ c }) => {
      const images = useSpreadsheetImages(c, { ownerId: 'o1', documentId: 'd1', shareCode: null });
      actions = images.actions;
      return (
        <SheetImagesOverCellsContext.Provider value={images.value}>
          <SheetImagesLayer />
          {images.dialogs}
        </SheetImagesOverCellsContext.Provider>
      );
    },
    { canShape: opts.canShape ?? true },
  );
  return { h, actions: () => actions };
}

const insert = (actions: () => OfficeActions) =>
  act(() => actions()[INSERT_IMAGE_OVER_CELLS]!.run());
const frame = (id: string) => document.querySelector<HTMLElement>(`[data-sheet-image="${id}"]`)!;

async function placeOne() {
  const s = await setup();
  act(() => s.h.select('C3'));
  insert(s.actions);
  fireEvent.click(screen.getByRole('button', { name: 'pick wide' }));
  const [image] = imagesOf(s.h);
  return { ...s, image: image! };
}

describe('Insert Image over Cells', () => {
  it('places the picked picture at the active cell, fitted to 600 by 400, selected', async () => {
    const { h, image } = await placeOne();
    const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
    expect(image).toMatchObject({
      kind: 'image',
      at: { r: rows[2], c: cols[2], dx: 0, dy: 0 },
      width: 600,
      height: 400,
      imageId: 'g-1',
      naturalWidth: 1200,
      naturalHeight: 800,
    });
    expect(screen.queryByRole('dialog', { name: 'Picker' })).toBeNull();
    expect(track).toHaveBeenCalledWith('Spreadsheet', 'Added', 'ImageOverCells');
    expect(track).toHaveBeenCalledWith('Sheet', 'Changed', 'Image');
    expect(document.activeElement).toBe(frame(image.id));
  });

  it('never places an embedded picture, saying so', async () => {
    const { h, actions } = await setup();
    insert(actions);
    fireEvent.click(screen.getByRole('button', { name: 'pick embedded' }));
    expect(imagesOf(h)).toEqual([]);
    expect(h.announce).toHaveBeenCalledWith(PICTURE_NOT_PLACED);
  });

  it('closes the picker without placing anything', async () => {
    const { h, actions } = await setup();
    insert(actions);
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    expect(screen.queryByRole('dialog', { name: 'Picker' })).toBeNull();
    expect(imagesOf(h)).toEqual([]);
  });

  it('is dimmed where image storage is not set up', async () => {
    listImages.mockResolvedValue(null);
    const { actions } = await setup();
    await waitFor(() => expect(actions()[INSERT_IMAGE_OVER_CELLS]?.disabled).toBe(true));
    expect(actions()[INSERT_IMAGE_OVER_CELLS]?.hint).toBe(IMAGES_UNAVAILABLE_HINT);
    expect(listImages).toHaveBeenCalledWith('o1');
  });

  it('stays ready when the probe fails', async () => {
    listImages.mockRejectedValue(new Error('offline'));
    const { actions } = await setup();
    await waitFor(() => expect(listImages).toHaveBeenCalled());
    expect(actions()[INSERT_IMAGE_OVER_CELLS]?.disabled).toBeUndefined();
  });

  it('is dimmed in This Browser, never probing', async () => {
    offline.mockReturnValue(true);
    const { actions } = await setup();
    expect(actions()[INSERT_IMAGE_OVER_CELLS]).toMatchObject({
      disabled: true,
      hint: IMAGES_LOCAL_HINT,
    });
    act(() => actions()[INSERT_IMAGE_OVER_CELLS]!.run());
    expect(screen.queryByRole('dialog', { name: 'Picker' })).toBeNull();
    expect(listImages).not.toHaveBeenCalled();
  });

  it('is an Editor’s alone', async () => {
    const { actions } = await setup({ canShape: false });
    expect(actions()[INSERT_IMAGE_OVER_CELLS]).toBeUndefined();
    expect(listImages).not.toHaveBeenCalled();
  });
});

describe("an image's menu", () => {
  const openMenu = (id: string) => {
    fireEvent.click(screen.getByRole('button', { name: IMAGE_MENU_LABEL }));
    expect(frame(id)).toBeTruthy();
  };

  it('sets its alt text, the title folded in, and takes it away when emptied', async () => {
    const { h, image } = await placeOne();
    openMenu(image.id);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Alt Text' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Cat' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
      target: { value: 'On a mat' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(imagesOf(h)[0]!.alt).toBe('Cat\nOn a mat');
    expect(frame(image.id).getAttribute('aria-label')).toBe('Cat\nOn a mat');

    fireEvent.contextMenu(frame(image.id), { clientX: 20, clientY: 30 });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Alt Text' }));
    const description = screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Description' });
    expect(description.value).toBe('Cat\nOn a mat');
    fireEvent.change(description, { target: { value: ' ' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(imagesOf(h)[0]).not.toHaveProperty('alt');
  });

  it('leaves the alt text as it was on Cancel', async () => {
    const { h, image } = await placeOne();
    openMenu(image.id);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Alt Text' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Alt text' })).toBeNull();
    expect(imagesOf(h)[0]).not.toHaveProperty('alt');
  });

  it('replaces the picture, keeping the width', async () => {
    const { h, image } = await placeOne();
    openMenu(image.id);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replace Image' }));
    fireEvent.click(screen.getByRole('button', { name: 'pick tall' }));
    expect(imagesOf(h)[0]).toMatchObject({
      id: image.id,
      imageId: 'g-2',
      width: 600,
      height: 1800,
      naturalWidth: 100,
      naturalHeight: 300,
    });
  });

  it('changes nothing when the image went while its dialog or picker was open', async () => {
    const { h, image } = await placeOne();
    const gone = () =>
      act(() => {
        h.store.write(SHEET_ID, {
          kind: 'layout',
          changes: [{ k: 'object', id: image.id, object: null }],
        });
      });
    openMenu(image.id);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replace Image' }));
    fireEvent.contextMenu(frame(image.id));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Alt Text' }));
    gone();
    expect(screen.queryByRole('dialog', { name: 'Alt text' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'pick tall' }));
    expect(imagesOf(h)).toEqual([]);
  });

  it('deletes it', async () => {
    const { h, image } = await placeOne();
    openMenu(image.id);
    expect(frame(image.id).hasAttribute('data-selected')).toBe(true);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(imagesOf(h)).toEqual([]);
  });

  it('moves it to the cell under its new top-left', async () => {
    const { h, image } = await placeOne();
    const target = frame(image.id);
    fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
    act(() => {
      target.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 15, clientY: 40, bubbles: true }),
      );
    });
    act(() => {
      target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    });
    const { rows, cols } = h.store.sheet(SHEET_ID)!.layout;
    const moved = imagesOf(h)[0]!;
    expect(moved.at.c).toBe(cols[2]);
    expect(moved.at.r).not.toBe(rows[2]);
  });
});
