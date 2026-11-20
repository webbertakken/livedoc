// @vitest-environment jsdom
// docs/specs/004-interface-design/fonts.md "Substitution", "More fonts": a family LiveDoc does not serve loads from
// Google Fonts when Google Fonts has it.
import { describe, expect, it, vi } from 'vitest';
import type { GoogleFont } from './google-font-catalogue';
import { loadGoogleFamilies } from './google-families';
import type { GoogleFontLoads } from './google-font-loading';

const rubik: GoogleFont = {
  name: 'Rubik',
  category: 'Sans Serif',
  popularity: 1,
  trending: 1,
  dateAdded: '2015-01-01',
  axes: '',
};

const loadsSpy = () =>
  ({ load: vi.fn() }) as unknown as GoogleFontLoads & { load: ReturnType<typeof vi.fn> };

describe('loadGoogleFamilies', () => {
  it('loads the families Google Fonts has, whatever their case', async () => {
    const loads = loadsSpy();
    await loadGoogleFamilies(['rubik', 'Made Up'], { catalogue: async () => [rubik], loads });
    expect(loads.load).toHaveBeenCalledExactlyOnceWith(rubik);
  });

  it('never reads the catalogue for families LiveDoc serves or names', async () => {
    const catalogue = vi.fn(async () => [rubik]);
    const loads = loadsSpy();
    await loadGoogleFamilies(['Lora', 'Arial'], { catalogue, loads });
    expect(catalogue).not.toHaveBeenCalled();
    expect(loads.load).not.toHaveBeenCalled();
  });

  it('logs a catalogue that cannot load', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const loads = loadsSpy();
    await loadGoogleFamilies(['Rubik'], {
      catalogue: async () => Promise.reject(new Error('chunk')),
      loads,
    });
    expect(loads.load).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(' ')).toContain(
      '[fonts] google catalogue not loaded Error: chunk',
    );
  });
});
