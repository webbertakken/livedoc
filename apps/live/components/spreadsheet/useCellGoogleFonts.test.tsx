// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Cell } from '@livedoc/sheets';

const loadGoogleFamilies = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/document-fonts/google-families', () => ({ loadGoogleFamilies }));

import { useCellGoogleFonts } from './useCellGoogleFonts';

const cells = (...fonts: string[]) => {
  const list: Cell[] = fonts.map((ff) => ({ format: { ff } }));
  return { cells: { values: () => list.values() } };
};

// docs/specs/029-sheets/formatting.md "Font": a family the cells name that LiveDoc does not serve loads from Google
// Fonts where reachable, once per change of the families named.
describe('useCellGoogleFonts', () => {
  it('asks for the families the cells name, again only when they change', () => {
    const { rerender } = renderHook(({ list }) => useCellGoogleFonts(list), {
      initialProps: { list: cells('Bitter', 'inter') },
    });
    expect(loadGoogleFamilies).toHaveBeenCalledWith(['Bitter']);
    rerender({ list: cells('Bitter') });
    expect(loadGoogleFamilies).toHaveBeenCalledTimes(1);
    rerender({ list: cells('Bitter', 'Lora') });
    expect(loadGoogleFamilies).toHaveBeenLastCalledWith(['Bitter', 'Lora']);
    rerender({ list: cells() });
    expect(loadGoogleFamilies).toHaveBeenCalledTimes(2);
  });
});
