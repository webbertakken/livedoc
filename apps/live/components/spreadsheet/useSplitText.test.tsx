// @vitest-environment jsdom
// data-tools.md "Split Text to Columns": the column split at once by the separator found, Replace Data? asked first
// where it writes over cells, the Separator chip splitting the original text again, two columns refused.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
} from '@/components/sheets/sheet-ui-test-utils';
import { SheetSplitChip } from '@/components/sheets/SheetSplitChip';
import { SplitChipContext } from '@/components/sheets/sheet-split-chip-context';
import { useSplitText } from './useSplitText';

beforeAll(stubResizeObserver);

function Host() {
  const { actions, chip, dialog } = useSplitText();
  return (
    <SplitChipContext.Provider value={chip}>
      {Object.entries(actions).map(([id, a]) => (
        <button key={id} type="button" onClick={() => a?.run()}>
          {id}
        </button>
      ))}
      <SheetSplitChip />
      {dialog}
    </SplitChipContext.Provider>
  );
}

const split = () => fireEvent.click(screen.getByRole('button', { name: 'split-text-to-columns' }));
const separator = () => screen.getByRole<HTMLSelectElement>('combobox', { name: 'Separator:' });

describe('useSplitText', () => {
  it('splits at commas at once, then splits the original again by the separator chosen', async () => {
    const h = await makeSheet({ cells: { A1: 'a,b;c', A2: 'p;q' } });
    renderSheet(h, () => <Host />, { at: 'A1:A2' });
    split();
    expect([h.value('A1'), h.value('B1'), h.value('A2')]).toEqual(['a', 'b;c', 'p;q']);
    expect(separator().value).toBe('detect');
    fireEvent.change(separator(), { target: { value: 'semicolon' } });
    expect([h.value('A1'), h.value('B1'), h.value('A2'), h.value('B2')]).toEqual([
      'a,b',
      'c',
      'p',
      'q',
    ]);
  });

  it('splits by a custom separator on Enter, and Escape puts the chip away', async () => {
    const h = await makeSheet({ cells: { A1: 'a::b' } });
    renderSheet(h, () => <Host />, { at: 'A1' });
    split();
    expect(h.value('B1')).toBeNull();
    fireEvent.change(separator(), { target: { value: 'custom' } });
    const field = screen.getByRole('textbox', { name: 'Custom separator' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(h.value('A1')).toBe('a::b');
    fireEvent.change(field, { target: { value: '::' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect([h.value('A1'), h.value('B1')]).toEqual(['a', 'b']);
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Split text to columns' })).toBeNull();
  });

  it('asks before writing over cells to the right; Cancel changes nothing', async () => {
    const h = await makeSheet({ cells: { A1: 'a,b', B1: 'keep' } });
    renderSheet(h, () => <Host />, { at: 'A1' });
    split();
    expect(screen.getByRole('dialog', { name: 'Replace Data?' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.value('B1')).toBe('keep');
    split();
    fireEvent.click(screen.getByRole('button', { name: 'Replace' }));
    expect([h.value('A1'), h.value('B1')]).toEqual(['a', 'b']);
  });

  it('refuses more than one column in Google’s words, and binds nothing for a non-Editor', async () => {
    const h = await makeSheet({ cells: { A1: 'a,b', B1: 'c,d' } });
    renderSheet(h, () => <Host />, { at: 'A1:B1' });
    split();
    expect(h.toast).toHaveBeenLastCalledWith(
      'You cannot split data that spans more than one column.',
    );
    const v = await makeSheet({ cells: { A1: 'a' } });
    renderSheet(v, () => <Host />, { at: 'A1', canShape: false });
    expect(screen.getAllByRole('button', { name: 'split-text-to-columns' })).toHaveLength(1);
  });

  it('hides the chip once the active cell leaves the range', async () => {
    const h = await makeSheet({ cells: { A1: 'a,b' } });
    renderSheet(h, () => <Host />, { at: 'A1' });
    split();
    expect(separator()).toBeTruthy();
    act(() => h.select('C3'));
    expect(screen.queryByRole('combobox', { name: 'Separator:' })).toBeNull();
  });
});
