// @vitest-environment jsdom
// data-tools.md "Remove Duplicates", "Trim Whitespace", "Randomise Range": the menu items an Editor's, each on the
// selection (the block around a single cell), one write; Remove Duplicates asks its columns, then says what it found.
import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
} from '@/components/sheets/sheet-ui-test-utils';
import { MERGE_SORT_REFUSAL } from '@livedoc/sheets';
import { useCleanUpTools } from './useCleanUpTools';

beforeAll(stubResizeObserver);

function Host() {
  const { actions, dialog } = useCleanUpTools();
  return (
    <>
      {Object.entries(actions).map(([id, a]) => (
        <button key={id} type="button" onClick={() => a?.run()}>
          {id}
        </button>
      ))}
      {dialog}
    </>
  );
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('useCleanUpTools', () => {
  it('removes duplicates over the block around the active cell, by the columns ticked', async () => {
    const h = await makeSheet({
      cells: { A1: 'Name', B1: 'n', A2: 'x', B2: '1', A3: 'X', B3: '2', A4: 'y', B4: '3' },
    });
    renderSheet(h, () => <Host />, { at: 'A2' });
    click('remove-duplicates');
    expect(screen.getByRole('dialog', { name: 'Remove Duplicates' })).toBeTruthy();
    expect(screen.getByText('Selected range: A1:B4')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Data has header row'));
    expect(screen.getByLabelText('Column A - Name')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Column B - n'));
    expect(screen.getByLabelText<HTMLInputElement>('Select All').indeterminate).toBe(true);
    click('Remove Duplicates');
    expect(screen.getByRole('status').textContent).toBe(
      '1 duplicate row found and removed. 2 unique rows remain.',
    );
    expect([h.value('A2'), h.value('B2'), h.value('A3'), h.value('B3'), h.value('A4')]).toEqual([
      'x',
      1,
      'y',
      3,
      null,
    ]);
    click('OK');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('dims Remove Duplicates with no column ticked, and says when none are found', async () => {
    const h = await makeSheet({ cells: { A1: 'a', A2: 'b' } });
    renderSheet(h, () => <Host />, { at: 'A1:A2' });
    click('remove-duplicates');
    fireEvent.click(screen.getByLabelText('Select All'));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Remove Duplicates' }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByLabelText('Select All'));
    click('Remove Duplicates');
    expect(screen.getByRole('status').textContent).toBe('No duplicate rows found.');
    expect(h.writes).toHaveLength(0);
  });

  it('trims whitespace and toasts the count', async () => {
    const h = await makeSheet({ cells: { A1: '  a  b ', A2: 'ok', A3: ' c' } });
    renderSheet(h, () => <Host />, { at: 'A1:A3' });
    click('trim-whitespace');
    expect([h.value('A1'), h.value('A3')]).toEqual(['a b', 'c']);
    expect(h.toast).toHaveBeenLastCalledWith('2 cells trimmed');
    click('trim-whitespace');
    expect(h.toast).toHaveBeenLastCalledWith('No whitespace to trim');
  });

  it('randomises the range’s rows whole', async () => {
    const random = vi.spyOn(crypto, 'getRandomValues').mockImplementation((a) => a);
    const h = await makeSheet({ cells: { A1: '1', B1: 'a', A2: '2', B2: 'b' } });
    renderSheet(h, () => <Host />, { at: 'A1:B2' });
    click('randomise-range');
    expect([h.value('A1'), h.value('B1'), h.value('A2'), h.value('B2')]).toEqual([2, 'b', 1, 'a']);
    random.mockRestore();
  });

  it('refuses across a merge, saying why', async () => {
    const h = await makeSheet({ cells: { A1: '1', A2: '2', B1: 'x' } });
    renderSheet(
      h,
      ({ actions }) => (
        <>
          <Host />
          <button type="button" onClick={() => actions.merge('all', () => true)}>
            merge
          </button>
        </>
      ),
      { at: 'A1:A2' },
    );
    click('merge');
    click('randomise-range');
    expect(h.toast).toHaveBeenLastCalledWith(MERGE_SORT_REFUSAL);
  });

  it('binds nothing for someone who may not shape the sheet', async () => {
    const h = await makeSheet({ cells: { A1: 'a' } });
    renderSheet(h, () => <Host />, { at: 'A1', canShape: false });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
