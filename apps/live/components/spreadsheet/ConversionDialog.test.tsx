// @vitest-environment jsdom

// docs/specs/029-sheets/files-and-print.md "Converting" (D88): checking, listed, failed and running, each with its
// words and buttons; the losses as a list; Cancel always there.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConversionDialog } from './ConversionDialog';
import type { ConversionState } from './useWorkbookConversion';

afterEach(cleanup);

const handlers = () => ({ onConfirm: vi.fn(), onRetry: vi.fn(), onCancel: vi.fn() });

const show = (state: ConversionState) => {
  const h = handlers();
  render(<ConversionDialog state={state} {...h} />);
  return h;
};

describe('ConversionDialog', () => {
  it('is nothing while closed', () => {
    const { container } = render(<ConversionDialog state={{ k: 'closed' }} {...handlers()} />);
    expect(container.innerHTML).toBe('');
  });

  it('says what it checks, with Convert off and Cancel on', () => {
    const h = show({ k: 'checking', purpose: 'convert', to: 'xlsx' });
    expect(screen.getByRole('dialog', { name: 'Convert to Excel?' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Checking what the .xlsx file can hold…');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Convert' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(h.onCancel).toHaveBeenCalled();
  });

  it('lists the losses, one line a kind, and converts on Convert', () => {
    const h = show({
      k: 'listed',
      purpose: 'convert',
      to: 'xlsx',
      losses: [
        { k: 'formula_unwritten', count: 2 },
        { k: 'text_cut', count: 1 },
      ],
    });
    expect(screen.getByText('The .xlsx file cannot hold:')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '2 formulas are written as their values only',
      '1 cell’s text is cut to Excel’s 32,767 characters',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Convert' }));
    expect(h.onConfirm).toHaveBeenCalled();
  });

  it('says when everything fits, and downloads on Download', () => {
    const h = show({ k: 'listed', purpose: 'download', to: 'ods', losses: [] });
    expect(screen.getByRole('dialog', { name: 'Download as OpenDocument?' })).toBeTruthy();
    expect(
      screen.getByText('Everything in this spreadsheet fits the OpenDocument format.'),
    ).toBeTruthy();
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(h.onConfirm).toHaveBeenCalled();
  });

  it('keeps the list while it runs, its button busy and off', () => {
    show({ k: 'running', purpose: 'convert', to: 'xlsx', losses: [{ k: 'text_cut', count: 1 }] });
    const convert = screen.getByRole<HTMLButtonElement>('button', { name: 'Convert' });
    expect(convert.disabled).toBe(true);
    expect(convert.getAttribute('aria-busy')).toBe('true');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('says a failed check, with Try Again', () => {
    const h = show({ k: 'failed', purpose: 'convert', to: 'xlsx' });
    expect(screen.getByRole('alert').textContent).toBe(
      'This spreadsheet could not be checked. Try again.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(h.onRetry).toHaveBeenCalled();
  });
});
