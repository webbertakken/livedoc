// @vitest-environment jsdom
// docs/specs/029-sheets/data-tools.md "Sort": Data › Sort Range › Advanced Range Sorting Options.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SortRangeDialog } from './SortRangeDialog';

const HEADERS: Record<number, string> = { 0: 'Name', 1: 'Team', 2: 'Score' };

function open() {
  const onSort = vi.fn();
  const onClose = vi.fn();
  render(
    <SortRangeDialog
      range={{ r1: 0, c1: 0, r2: 9, c2: 2 }}
      start={[{ col: 1, ascending: true }]}
      headerText={(col) => HEADERS[col] ?? ''}
      onSort={onSort}
      onClose={onClose}
    />,
  );
  return { onSort, onClose };
}

const sortBy = () => screen.getByRole('group', { name: 'Sort by' });

describe('SortRangeDialog', () => {
  it('titles itself by the range and sorts by the active column A to Z', () => {
    const { onSort } = open();
    expect(screen.getByRole('dialog', { name: 'Sort range from A1 to C10' })).toBeTruthy();
    expect(within(sortBy()).getByRole<HTMLSelectElement>('combobox').value).toBe('1');
    expect(within(sortBy()).getByRole('option', { name: 'Column B' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }));
    expect(onSort).toHaveBeenCalledWith([{ col: 1, ascending: true }], false);
  });

  it('offers the headers once the data has a header row', () => {
    const { onSort } = open();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Data has header row' }));
    expect(within(sortBy()).getByRole('option', { name: 'Team' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }));
    expect(onSort).toHaveBeenCalledWith([{ col: 1, ascending: true }], true);
  });

  it('sorts by several keys, each its own order, an added one removable', () => {
    const { onSort } = open();
    fireEvent.click(within(sortBy()).getByRole('radio', { name: 'Z → A' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Another Sort Column' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Another Sort Column' }));
    const thens = screen.getAllByRole('group', { name: 'Then by' });
    expect(thens).toHaveLength(2);
    fireEvent.change(within(thens[1]!).getByRole('combobox'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove sort column 2' }));
    expect(screen.queryByRole('button', { name: 'Remove sort column 1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }));
    expect(onSort).toHaveBeenCalledWith(
      [
        { col: 1, ascending: false },
        { col: 0, ascending: true },
      ],
      false,
    );
  });

  it('changes nothing on Cancel', () => {
    const { onSort, onClose } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSort).not.toHaveBeenCalled();
  });
});
