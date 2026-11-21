// @vitest-environment jsdom

// A picture IMAGE shows in its cell (docs/specs/029-sheets/imports.md "IMAGE"): nothing until it arrives or when it
// failed, then drawn in the cell's box by its mode, named for assistive technology, faded while waiting; and the
// loader the spreadsheet provides only once access is allowed, let go when it closes.
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CellImage } from '@livedoc/sheets';
import { SheetImage } from './SheetImage';
import { SheetImageLoader } from './sheet-image-loader';
import { useSheetImageLoader } from './sheet-images-context';

vi.mock('@/lib/api/sheet-imports', () => ({ fetchSheetImage: vi.fn(async () => null) }));

afterEach(cleanup);

const box = { x: 10, y: 20, w: 100, h: 40 };
const picture = (over: Partial<CellImage> = {}): CellImage => ({
  url: 'https://a.example/a.png',
  mode: 1,
  height: null,
  width: null,
  ...over,
});

function loaderWith(blob: Blob | null) {
  let made = 0;
  return new SheetImageLoader({
    fetch: async () => blob,
    objectUrl: () => `blob:${++made}`,
    revoke: () => {},
  });
}

const png = new Blob([new Uint8Array([1])], { type: 'image/png' });

describe('SheetImage', () => {
  it('draws nothing while it loads, then the picture in the cell’s box', async () => {
    const loader = loaderWith(png);
    const { container } = render(<SheetImage image={picture()} loader={loader} box={box} />);
    const shown = await screen.findByRole('img', { name: 'Image from a.example' });
    expect(shown.style.left).toBe('10px');
    expect(shown.style.width).toBe('100px');
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('blob:1');
    expect(img.getAttribute('alt')).toBe('');
    expect(img.style.objectFit).toBe('contain');
  });

  it.each<[Partial<CellImage>, Record<string, string>]>([
    [{ mode: 2 }, { objectFit: 'fill', width: '100%' }],
    [{ mode: 3 }, { maxWidth: 'none', width: '' }],
    [
      { mode: 4, height: 30, width: 50 },
      { width: '50px', height: '30px' },
    ],
    [
      { mode: 4, height: 30 },
      { width: 'auto', height: '30px' },
    ],
    [
      { mode: 4, width: 50 },
      { width: '50px', height: 'auto' },
    ],
  ])('sizes %j by its mode', async (over, style) => {
    const { container } = render(
      <SheetImage image={picture(over)} loader={loaderWith(png)} box={box} />,
    );
    await screen.findByRole('img');
    const img = container.querySelector('img')!;
    for (const [k, v] of Object.entries(style)) expect(img.style[k as 'width']).toBe(v);
  });

  it('fades while its value waits, and draws nothing for a picture not fetched', async () => {
    const shown = render(
      <SheetImage image={picture()} loader={loaderWith(png)} box={box} waitingOpacity={0.55} />,
    );
    expect((await screen.findByRole('img')).style.opacity).toBe('0.55');
    shown.unmount();
    const failing = loaderWith(null);
    const { container } = render(<SheetImage image={picture()} loader={failing} box={box} />);
    await act(async () => {});
    expect(failing.state(picture().url)).toEqual({ status: 'failed' });
    expect(container.innerHTML).toBe('');
  });
});

describe('useSheetImageLoader', () => {
  const scope = { documentId: 'd', ownerId: 'o', shareCode: null, tabId: null };

  it('is none until access is allowed, then one, let go when the spreadsheet closes', async () => {
    const { result, rerender, unmount } = renderHook(
      ({ allowed }) => useSheetImageLoader(scope, allowed),
      { initialProps: { allowed: false } },
    );
    expect(result.current).toBeNull();
    rerender({ allowed: true });
    const loader = result.current!;
    expect(loader).toBeInstanceOf(SheetImageLoader);
    const dispose = vi.spyOn(loader, 'dispose');
    // A new scope object of the same document keeps the loader.
    rerender({ allowed: true });
    expect(result.current).toBe(loader);
    loader.want('https://a.example/a.png');
    await act(async () => {});
    expect(loader.state('https://a.example/a.png')).toEqual({ status: 'failed' });
    unmount();
    expect(dispose).toHaveBeenCalled();
  });
});
