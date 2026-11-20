// docs/specs/004-interface-design/fonts.md "The font menu".
import { describe, expect, it, vi } from 'vitest';
import { fontMenuActions, fontMenuEntries, fontShownAs, MORE_FONTS_ITEM } from './office-font-menu';

describe('fontMenuEntries', () => {
  it('leads with More fonts, then the catalogue, each in its face', () => {
    const entries = fontMenuEntries([]);
    expect(entries[0]).toMatchObject({ id: MORE_FONTS_ITEM, status: 'comingSoon' });
    expect(entries[1]).toEqual({ kind: 'separator' });
    expect(entries[2]).toMatchObject({
      label: 'Amatic SC',
      checkable: 'radio',
      face: '"LiveDoc Amatic SC", sans-serif',
    });
    expect(entries.filter((e) => e.kind === 'separator')).toHaveLength(1);
  });

  it('lists the recent families between separators', () => {
    const entries = fontMenuEntries(['Lora', 'Calibri']);
    expect(entries.slice(2, 5)).toEqual([
      expect.objectContaining({ id: 'recent-font:Lora', label: 'Lora' }),
      expect.objectContaining({
        id: 'recent-font:Calibri',
        face: '"Calibri", "LiveDoc Carlito", sans-serif',
      }),
      { kind: 'separator' },
    ]);
  });
});

describe('fontMenuActions', () => {
  it('chooses a family and checks the one at the caret, in either list', () => {
    const choose = vi.fn();
    const entries = fontMenuEntries(['Lora']);
    const actions = fontMenuActions(entries, 'lora', choose);
    expect(actions['recent-font:Lora']!.checked).toBe(true);
    expect(actions['all-font:Lora']!.checked).toBe(true);
    expect(actions['all-font:Arial']!.checked).toBe(false);
    expect(actions[MORE_FONTS_ITEM]).toBeUndefined();
    actions['all-font:Roboto']!.run();
    expect(choose).toHaveBeenCalledWith('Roboto');
    expect(fontMenuActions(entries, null, choose)['all-font:Lora']!.checked).toBe(false);
  });
});

describe('fontShownAs', () => {
  it('names what a family the menu does not list is drawn in', () => {
    expect(fontShownAs('Arial')).toBeNull();
    expect(fontShownAs('Calibri')).toBe('Carlito');
    expect(fontShownAs('Wingdings')).toBe('Arimo');
  });
});
