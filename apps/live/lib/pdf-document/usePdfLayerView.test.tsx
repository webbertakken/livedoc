// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Layers": a person's layers, drawn with a drawer of their own, the
// file's as it sets them until they change one; a set the engine cannot draw changes nothing.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/telemetry';
import type { PdfPageDrawer } from './pdf-page-drawer';
import { usePdfLayerView } from './usePdfLayerView';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const fileDrawer = { draw: vi.fn() } as unknown as PdfPageDrawer;

function engine(can = true) {
  return {
    drawPage: vi.fn(async () => null),
    drawTile: vi.fn(async () => null),
    layerView: vi.fn(async () => can),
  };
}

describe('a person’s layers', () => {
  it('draws with the surface’s own drawer while the layers are as the file sets them', () => {
    const { result } = renderHook(() => usePdfLayerView(engine(), fileDrawer));
    expect(result.current.hidden).toBeNull();
    expect(result.current.drawer).toBe(fileDrawer);
  });

  it('hides a layer, then draws every page and tile with that person’s layers', async () => {
    const pdf = engine();
    const { result } = renderHook(() => usePdfLayerView(pdf, fileDrawer));
    await act(async () => {
      expect(await result.current.setLayer('o:5', false, ['o:6'])).toBe(true);
    });
    expect(pdf.layerView).toHaveBeenCalledWith(['o:6', 'o:5']);
    expect(result.current.hidden).toEqual(['o:6', 'o:5']);
    expect(result.current.drawer).not.toBe(fileDrawer);
    expect(track).toHaveBeenCalledWith('Pdf', 'Toggled', 'Layer.Hidden');
    await result.current.drawer!.draw(0, 1, 1);
    await result.current.drawer!.drawTile('t', 0, 1, 0, { x: 0, y: 0, width: 1, height: 1 });
    expect(pdf.drawPage).toHaveBeenCalledWith(0, 1, 1, ['o:6', 'o:5'], 'paper');
    expect(pdf.drawTile).toHaveBeenCalledWith(
      0,
      1,
      0,
      { x: 0, y: 0, width: 1, height: 1 },
      ['o:6', 'o:5'],
      'paper',
    );
    await act(async () => {
      await result.current.setLayer('o:6', true, ['o:6', 'o:5']);
    });
    expect(result.current.hidden).toEqual(['o:5']);
    expect(track).toHaveBeenCalledWith('Pdf', 'Toggled', 'Layer.Shown');
  });

  // dark-pages.md "The recolouring": Dark pages is another drawer, the file's layers as it sets them.
  it('draws with a drawer of its own under Dark pages, every page and tile asked dark', async () => {
    const pdf = engine();
    const { result } = renderHook(() => usePdfLayerView(pdf, fileDrawer, 'dark'));
    expect(result.current.drawer).not.toBe(fileDrawer);
    await result.current.drawer!.draw(0, 1, 0);
    await result.current.drawer!.drawTile('t', 0, 1, 0, { x: 0, y: 0, width: 1, height: 1 });
    expect(pdf.drawPage).toHaveBeenCalledWith(0, 1, 0, undefined, 'dark');
    expect(pdf.drawTile).toHaveBeenCalledWith(
      0,
      1,
      0,
      { x: 0, y: 0, width: 1, height: 1 },
      undefined,
      'dark',
    );
  });

  it('changes nothing where the engine cannot draw the layers so', async () => {
    const { result } = renderHook(() => usePdfLayerView(engine(false), fileDrawer));
    await act(async () => {
      expect(await result.current.setLayer('o:5', false, [])).toBe(false);
    });
    expect(result.current.hidden).toBeNull();
    expect(result.current.drawer).toBe(fileDrawer);
  });

  it('draws nothing and changes nothing while there is no file', async () => {
    const { result } = renderHook(() => usePdfLayerView(null, null));
    expect(result.current.drawer).toBeNull();
    await act(async () => {
      expect(await result.current.setLayer('o:5', false, [])).toBe(false);
    });
  });
});
