// @vitest-environment jsdom
// data-tools.md "Column Stats" and "Clean-up Suggestions": the active column's figures, its switcher, Ignore rows and
// the frequent values; the suggestions found, applied as one write each, set aside by ×, and their empty line.
import { act, fireEvent, screen, within } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  makeSheet,
  renderSheet,
  stubResizeObserver,
} from '@/components/sheets/sheet-ui-test-utils';
import { EMPTY_COLUMN, NO_SUGGESTIONS } from '@/lib/spreadsheet/clean-up-panels';
import { SpreadsheetColumnStatsBody } from './SpreadsheetColumnStatsBody';
import { SpreadsheetCleanUpSuggestionsBody } from './SpreadsheetCleanUpSuggestionsBody';

beforeAll(stubResizeObserver);

const figure = (name: string) => screen.getByText(name).nextElementSibling?.textContent;

describe('SpreadsheetColumnStatsBody', () => {
  it('shows the active column’s figures, ignoring rows as asked, and switches columns', async () => {
    const h = await makeSheet({
      cells: {
        A1: 'Score',
        A2: '4',
        A3: '2',
        A4: '4',
        B1: 'Team',
        B2: 'Red',
        B3: 'red',
        B4: 'Blue',
      },
    });
    renderSheet(h, () => <SpreadsheetColumnStatsBody />, { at: 'A2' });
    expect([figure('Count'), figure('Unique'), figure('Sum')]).toEqual(['4', '3', '10']);
    fireEvent.change(screen.getByLabelText('Ignore rows'), { target: { value: '1' } });
    expect(screen.getByText('Score')).toBeTruthy();
    expect([figure('Count'), figure('Unique'), figure('Average'), figure('Median')]).toEqual([
      '3',
      '2',
      '3.33',
      '4',
    ]);
    const frequency = within(screen.getByRole('region', { name: 'Frequency' }));
    expect(frequency.getAllByRole('listitem')[0]!.textContent).toBe('42');
    fireEvent.click(frequency.getByRole('button', { name: 'Least Frequent' }));
    expect(frequency.getAllByRole('listitem')[0]!.textContent).toBe('21');
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Previous column' }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Next column' }));
    expect(screen.getByText('Team')).toBeTruthy();
    expect([figure('Count'), figure('Unique')]).toEqual(['3', '2']);
    expect(screen.queryByText('Sum')).toBeNull();
    const bars = within(screen.getByRole('region', { name: 'Distribution' })).getAllByRole(
      'listitem',
    );
    expect(bars[0]!.textContent).toBe('Red2');
    fireEvent.click(screen.getByRole('button', { name: 'Previous column' }));
    fireEvent.change(screen.getByLabelText('Ignore rows'), { target: { value: '-3' } });
    expect(figure('Count')).toBe('4');
    act(() => h.select('B1'));
    expect(screen.getByText('Column B')).toBeTruthy();
  });

  it('says when a column is empty', async () => {
    const h = await makeSheet({ cells: { A1: 'x' } });
    renderSheet(h, () => <SpreadsheetColumnStatsBody />, { at: 'C1' });
    expect(screen.getByText(EMPTY_COLUMN)).toBeTruthy();
  });
});

describe('SpreadsheetCleanUpSuggestionsBody', () => {
  it('lists what it finds, applies one as a write, and sets one aside', async () => {
    const h = await makeSheet({
      cells: { A1: 'a', A2: 'a', A3: ' b', B1: '1', B2: '1', B3: "'3" },
    });
    const onColumnStats = vi.fn();
    renderSheet(h, () => <SpreadsheetCleanUpSuggestionsBody onColumnStats={onColumnStats} />, {
      at: 'A1',
    });
    expect(screen.getByText('1 duplicate row in A1:B3')).toBeTruthy();
    expect(screen.getByText('1 cell with extra spaces in A1:B3')).toBeTruthy();
    expect(screen.getByText('1 number stored as text in column B')).toBeTruthy();
    const card = screen.getByText('Inconsistent number format').closest('li')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Apply' }));
    expect(h.value('B3')).toBe(3);
    expect(screen.queryByText('Inconsistent number format')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Set aside: Remove duplicates' }));
    expect(screen.queryByText('Remove duplicates')).toBeNull();
    const spaces = screen.getByText('Trim whitespace').closest('li')!;
    fireEvent.click(within(spaces).getByRole('button', { name: 'Apply' }));
    expect(screen.getByText(NO_SUGGESTIONS)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Column Stats' }));
    expect(onColumnStats).toHaveBeenCalled();
  });
});
