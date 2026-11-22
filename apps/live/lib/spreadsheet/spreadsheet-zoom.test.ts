import { describe, expect, it, vi } from 'vitest';
import { SPREADSHEET_ZOOM_DEFAULT, ZOOM_ITEMS, zoomBindings } from './spreadsheet-zoom';

describe('spreadsheet zoom', () => {
  it('lists Google\'s seven levels, without Fit (surface.md "Grid")', () => {
    expect(ZOOM_ITEMS.map((i) => i.label)).toEqual([
      '50%',
      '75%',
      '90%',
      '100%',
      '125%',
      '150%',
      '200%',
    ]);
    expect(SPREADSHEET_ZOOM_DEFAULT).toBe(100);
  });

  it('ticks the level in force and sets the one picked', () => {
    const set = vi.fn();
    const actions = zoomBindings({ value: 125, onChange: set });
    expect(actions['zoom-125']?.checked).toBe(true);
    expect(actions['zoom-100']?.checked).toBe(false);
    actions['zoom-50']!.run();
    expect(set).toHaveBeenCalledWith(50);
  });

  it('ticks none for a typed level between them', () => {
    const actions = zoomBindings({ value: 110, onChange: vi.fn() });
    expect(Object.values(actions).some((a) => a?.checked)).toBe(false);
  });
});
