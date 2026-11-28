// @vitest-environment jsdom
// A spreadsheet's images over cells (docs/specs/029-sheets/inserted-objects.md "Images over cells"): drawn at their
// places from their bytes, moved, resized (corners in proportion, edges stretching) and removed by an Editor as one
// change each, their menu opened by the ⋮ button or a right-click; named by their alt text; only looked at by others.
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SheetImage } from '@livedoc/sheets';
import type { ImageBox } from '@/lib/spreadsheet/sheet-image-place';
import {
  markPlacedImage,
  SheetImagesOverCellsContext,
  type PlacedSheetImage,
  type SheetImagesOverCells,
} from './sheet-images-over-cells-context';
import { draggedImageBox, IMAGE_MENU_LABEL, SheetImagesLayer } from './SheetImagesLayer';
import { makeSheet, renderSheet, type SheetHarness } from './sheet-ui-test-utils';

type BlobState =
  | { status: 'loading' }
  | { status: 'ready'; src: string }
  | { status: 'broken' }
  | { status: 'idle' };
const blob = vi.fn((_owner: string, _id: string | null, _opts: unknown): BlobState => ({
  status: 'ready',
  src: 'blob:one',
}));
vi.mock('@/hooks/persistence/useImageBlobUrl', () => ({
  useImageBlobUrl: (owner: string, id: string | null, opts: unknown) => blob(owner, id, opts),
}));

const image = (id: string, over: Partial<SheetImage> = {}): SheetImage => ({
  id,
  kind: 'image',
  at: { r: 'r', c: 'c', dx: 0, dy: 0 },
  width: 200,
  height: 100,
  imageId: `g-${id}`,
  ...over,
});
const placed = (img: SheetImage, x = 100, y = 50): PlacedSheetImage => ({ image: img, x, y });

let value: SheetImagesOverCells;
let h: SheetHarness;
const place = vi.fn<(id: string, box: ImageBox, what: 'moved' | 'resized') => void>();
const remove = vi.fn<(id: string) => void>();
const menu = vi.fn<(id: string, at: DOMRect) => void>();

function mount(
  images: readonly PlacedSheetImage[],
  opts: { canShape?: boolean; editable?: boolean; menuFor?: string } = {},
) {
  value = {
    images,
    access: { ownerId: 'o1', documentId: 'd1', shareCode: 'sc' },
    editable: opts.editable ?? true,
    place,
    remove,
    menu,
    menuFor: opts.menuFor ?? null,
  };
  return renderSheet(
    h,
    () => (
      <SheetImagesOverCellsContext.Provider value={value}>
        <SheetImagesLayer />
      </SheetImagesOverCellsContext.Provider>
    ),
    { canShape: opts.canShape ?? true, interactive: true },
  );
}

const box = (id: string) => document.querySelector<HTMLElement>(`[data-sheet-image="${id}"]`)!;
const drag = (target: HTMLElement, dx: number, dy: number) => {
  fireEvent.pointerDown(target, { button: 0, clientX: 10, clientY: 10, pointerId: 1 });
  act(() => {
    target.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 10 + dx, clientY: 10 + dy, bubbles: true }),
    );
  });
  act(() => {
    target.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });
};

beforeEach(async () => {
  blob.mockReset();
  blob.mockImplementation(() => ({ status: 'ready', src: 'blob:one' }));
  place.mockClear();
  remove.mockClear();
  menu.mockClear();
  h = await makeSheet();
});
afterEach(cleanup);

describe('the images over cells', () => {
  it('draws each at its place from its bytes, scrolling with the cells', () => {
    mount([placed(image('a'))]);
    expect(box('a').style.left).toBe('100px');
    expect(box('a').style.width).toBe('200px');
    expect(box('a').querySelector('img')!.getAttribute('src')).toBe('blob:one');
    expect(blob).toHaveBeenCalledWith('o1', 'g-a', { documentId: 'd1', shareCode: 'sc' });
    act(() => h.ctl().setScroll({ top: 30, left: 40 }));
    expect(box('a').style.left).toBe('60px');
    expect(box('a').style.top).toBe('20px');
  });

  it('sits in a row and cell of its own, inside the grid', () => {
    mount([placed(image('a'))]);
    const cell = box('a').parentElement!;
    expect(cell.getAttribute('role')).toBe('gridcell');
    expect(cell.parentElement!.getAttribute('role')).toBe('row');
  });

  it('draws nothing without any, or without a spreadsheet', () => {
    const { container } = mount([]);
    expect(container.querySelector('[data-sheet-images]')).toBeNull();
  });

  it('names each by its alt text, else Image', () => {
    mount([placed(image('a', { alt: 'A cat' })), placed(image('b'))]);
    expect(box('a').getAttribute('aria-label')).toBe('A cat');
    expect(box('b').getAttribute('aria-label')).toBe('Image');
    expect(box('a').getAttribute('role')).toBe('group');
  });

  it('shows a skeleton while its bytes come, and the broken state when they cannot', () => {
    blob.mockImplementation((_owner, id) =>
      id === 'g-a' ? { status: 'loading' } : { status: 'broken' },
    );
    mount([placed(image('a')), placed(image('b'))]);
    expect(box('a').querySelector('[data-sheet-image-loading]')).not.toBeNull();
    expect(box('b').textContent).toContain('Image unavailable');
  });

  it('shows the broken state for bytes that will not decode', () => {
    mount([placed(image('a'))]);
    fireEvent.error(box('a').querySelector('img')!);
    expect(box('a').textContent).toContain('Image unavailable');
  });

  it('is only looked at by someone who may not shape the sheet', () => {
    mount([placed(image('a'))], { canShape: false });
    expect(box('a').getAttribute('role')).toBe('img');
    expect(box('a').tabIndex).toBe(-1);
    drag(box('a'), 30, 30);
    fireEvent.contextMenu(box('a'));
    expect(place).not.toHaveBeenCalled();
    expect(menu).not.toHaveBeenCalled();
  });

  it('is selected as it arrives after Insert Image over Cells', () => {
    markPlacedImage('a');
    mount([placed(image('a'))]);
    expect(document.activeElement).toBe(box('a'));
    expect(box('a').hasAttribute('data-selected')).toBe(true);
    expect(box('a').querySelectorAll('[data-sheet-object-handle]')).toHaveLength(8);
  });

  it('moves by the distance dragged, as one change', () => {
    mount([placed(image('a'))]);
    drag(box('a'), 30, -20);
    expect(place).toHaveBeenCalledWith('a', { x: 130, y: 30, width: 200, height: 100 }, 'moved');
  });

  it('keeps its proportion by a corner handle and stretches by an edge', () => {
    mount([placed(image('a', { naturalWidth: 400, naturalHeight: 400 }))]);
    fireEvent.focus(box('a'));
    drag(box('a').querySelector<HTMLElement>('[data-sheet-object-handle="se"]')!, 100, 0);
    expect(place).toHaveBeenLastCalledWith(
      'a',
      { x: 100, y: 50, width: 300, height: 300 },
      'resized',
    );
    fireEvent.focus(box('a'));
    drag(box('a').querySelector<HTMLElement>('[data-sheet-object-handle="w"]')!, 20, 0);
    expect(place).toHaveBeenLastCalledWith(
      'a',
      { x: 120, y: 50, width: 180, height: 100 },
      'resized',
    );
  });

  it('moves with the arrow keys and stretches with Alt', () => {
    mount([placed(image('a'))]);
    fireEvent.focus(box('a'));
    fireEvent.keyDown(box('a'), { key: 'ArrowRight', shiftKey: true });
    expect(place).toHaveBeenLastCalledWith(
      'a',
      { x: 110, y: 50, width: 200, height: 100 },
      'moved',
    );
    fireEvent.keyDown(box('a'), { key: 'ArrowDown', altKey: true });
    expect(place).toHaveBeenLastCalledWith(
      'a',
      { x: 100, y: 50, width: 200, height: 101 },
      'resized',
    );
    fireEvent.keyDown(box('a'), { key: 'ArrowLeft', altKey: true });
    expect(place).toHaveBeenLastCalledWith(
      'a',
      { x: 100, y: 50, width: 199, height: 100 },
      'resized',
    );
  });

  it('is removed by Delete, the keys going back to the grid', () => {
    mount([placed(image('a'))]);
    fireEvent.focus(box('a'));
    fireEvent.keyDown(box('a'), { key: 'Delete' });
    expect(remove).toHaveBeenCalledWith('a');
  });

  it('lets go with Escape, and when focus leaves it', () => {
    mount([placed(image('a'))]);
    fireEvent.focus(box('a'));
    fireEvent.keyDown(box('a'), { key: 'Escape' });
    expect(box('a').hasAttribute('data-selected')).toBe(false);
    fireEvent.focus(box('a'));
    fireEvent.blur(box('a'), { relatedTarget: document.body });
    expect(box('a').hasAttribute('data-selected')).toBe(false);
  });

  it('opens its menu by the ⋮ button and a right-click', () => {
    mount([placed(image('a'))]);
    fireEvent.focus(box('a'));
    fireEvent.click(screen.getByRole('button', { name: IMAGE_MENU_LABEL }));
    expect(menu).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(box('a'), { clientX: 50, clientY: 60 });
    expect(menu).toHaveBeenCalledTimes(2);
    expect(menu.mock.calls[1]![1]).toMatchObject({ x: 50, y: 56 });
  });
});

describe('an image whose menu is open', () => {
  it('is drawn selected while it is', () => {
    mount([placed(image('a'))], { menuFor: 'a' });
    expect(box('a').hasAttribute('data-selected')).toBe(true);
  });
});

describe('draggedImageBox', () => {
  it('never moves an image past A1', () => {
    expect(
      draggedImageBox(placed(image('a'), 10, 10), { kind: 'move', handle: 'se', dx: -50, dy: -50 }),
    ).toMatchObject({ x: 0, y: 0 });
  });

  it('keeps a box proportion where the natural size is unknown', () => {
    expect(
      draggedImageBox(placed(image('a')), { kind: 'resize', handle: 'nw', dx: -200, dy: 0 }),
    ).toEqual({ x: 0, y: 0, width: 400, height: 200 });
  });
});
