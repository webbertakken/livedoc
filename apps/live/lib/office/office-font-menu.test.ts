// docs/specs/004-interface-design/fonts.md "The font menu".
import { describe, expect, it, vi } from 'vitest';
import { DocumentFonts } from '@livedoc/document';
import {
  fontMenuActions,
  fontMenuEntries,
  fontShownAs,
  MORE_FONTS_ITEM,
  NOT_AVAILABLE_OFFLINE,
} from './office-font-menu';

const MENU = DocumentFonts.menu();

describe('fontMenuEntries', () => {
  it('leads with More fonts, then My fonts, each in its face', () => {
    const entries = fontMenuEntries([], MENU);
    expect(entries[0]).toMatchObject({ id: MORE_FONTS_ITEM, status: 'built' });
    expect(entries[1]).toEqual({ kind: 'separator' });
    expect(entries[2]).toMatchObject({
      label: 'Amatic SC',
      checkable: 'radio',
      face: '"LiveDoc Amatic SC", sans-serif',
    });
    expect(entries.filter((e) => e.kind === 'separator')).toHaveLength(1);
  });

  it('lists My fonts as they are, a family from Google Fonts drawn in itself', () => {
    const entries = fontMenuEntries([], ['Lora', 'Rubik']);
    expect(entries.slice(2)).toEqual([
      expect.objectContaining({ id: 'all-font:Lora' }),
      expect.objectContaining({
        id: 'all-font:Rubik',
        face: '"Rubik", "Arial", "LiveDoc Arimo", sans-serif',
      }),
    ]);
  });

  it('lists the recent families between separators', () => {
    const entries = fontMenuEntries(['Lora', 'Calibri'], MENU);
    expect(entries.slice(2, 5)).toEqual([
      expect.objectContaining({ id: 'recent-font:Lora', label: 'Lora' }),
      expect.objectContaining({
        id: 'recent-font:Calibri',
        face: '"Calibri", "LiveDoc Carlito", sans-serif',
      }),
      { kind: 'separator' },
    ]);
  });

  it('marks a family that could not load, wherever it is listed', () => {
    const entries = fontMenuEntries(['Rubik'], ['Lora', 'Rubik'], (name) =>
      name === 'Rubik' ? 'failed' : 'idle',
    );
    const rubiks = entries.filter((e) => e.kind === 'item' && e.label === 'Rubik');
    expect(rubiks).toHaveLength(2);
    for (const rubik of rubiks) expect(rubik).toMatchObject({ note: NOT_AVAILABLE_OFFLINE });
    expect(entries.find((e) => e.kind === 'item' && e.label === 'Lora')).not.toHaveProperty('note');
  });
});

describe('fontMenuActions', () => {
  it('chooses a family and checks the one at the caret, in either list', () => {
    const choose = vi.fn();
    const more = vi.fn();
    const entries = fontMenuEntries(['Lora'], MENU);
    const actions = fontMenuActions(entries, 'lora', choose, more);
    expect(actions['recent-font:Lora']!.checked).toBe(true);
    expect(actions['all-font:Lora']!.checked).toBe(true);
    expect(actions['all-font:Arial']!.checked).toBe(false);
    actions['all-font:Roboto']!.run();
    expect(choose).toHaveBeenCalledWith('Roboto');
    expect(fontMenuActions(entries, null, choose, more)['all-font:Lora']!.checked).toBe(false);
  });

  it('opens More fonts', () => {
    const more = vi.fn();
    fontMenuActions(fontMenuEntries([], MENU), null, vi.fn(), more)[MORE_FONTS_ITEM]!.run();
    expect(more).toHaveBeenCalledOnce();
  });
});

describe('fontShownAs', () => {
  it('names what a family the menu does not list is drawn in', () => {
    expect(fontShownAs('Arial', MENU)).toBeNull();
    expect(fontShownAs('Calibri', MENU)).toBe('Carlito');
    expect(fontShownAs('Wingdings', MENU)).toBe('Arimo');
  });

  it('shows a family from Google Fonts as itself while it loads or once it has', () => {
    expect(fontShownAs('Rubik', MENU, () => 'loading')).toBeNull();
    expect(fontShownAs('Rubik', MENU, () => 'loaded')).toBeNull();
    expect(fontShownAs('Rubik', ['Rubik'])).toBeNull();
  });

  it('names the default family for one from Google Fonts that could not load, even in My fonts', () => {
    expect(fontShownAs('Rubik', ['Rubik'], () => 'failed')).toBe('Arimo');
  });
});
