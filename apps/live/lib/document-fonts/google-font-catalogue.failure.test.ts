// docs/specs/004-interface-design/fonts.md "More fonts": a catalogue that could not load is asked for again next time.
import { describe, expect, it, vi } from 'vitest';

vi.mock('./google-fonts.json', () => {
  throw new Error('chunk');
});

describe('loadGoogleFonts, when its file cannot load', () => {
  it('fails, and asks again next time', async () => {
    const { loadGoogleFonts } = await import('./google-font-catalogue');
    const first = loadGoogleFonts();
    await expect(first).rejects.toThrow();
    const second = loadGoogleFonts();
    expect(second).not.toBe(first);
    await expect(second).rejects.toThrow();
  });
});
