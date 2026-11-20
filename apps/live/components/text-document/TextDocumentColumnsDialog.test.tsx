// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Columns": Column options.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PageSetup } from '@livedoc/text-documents';
import { TextDocumentColumnsDialog } from './TextDocumentColumnsDialog';

const letter = PageSetup.of('letter');

const open = (setup = letter, onApply = vi.fn()) => {
  render(
    <TextDocumentColumnsDialog open setup={setup} unit="in" onApply={onApply} onClose={vi.fn()} />,
  );
  return onApply;
};

const spacing = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Spacing (in)' });
const count = () => screen.getByRole<HTMLSelectElement>('combobox', { name: 'Number of columns' });
const line = () => screen.getByRole<HTMLInputElement>('checkbox', { name: 'Line between columns' });

describe('TextDocumentColumnsDialog', () => {
  it("opens at the section's columns, spacing and line dimmed with one column", () => {
    open();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'One column' }).checked).toBe(true);
    expect(count().value).toBe('1');
    expect(spacing().value).toBe('0.5');
    expect(spacing().disabled).toBe(true);
    expect(line().disabled).toBe(true);
  });

  it('shows Presets and Number of columns as one choice', () => {
    open();
    fireEvent.click(screen.getByRole('radio', { name: 'Three columns' }));
    expect(count().value).toBe('3');
    fireEvent.change(count(), { target: { value: '2' } });
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Two columns' }).checked).toBe(true);
    expect(spacing().disabled).toBe(false);
  });

  it('applies the count, spacing in the unit and the line', () => {
    const onApply = open();
    fireEvent.click(screen.getByRole('radio', { name: 'Two columns' }));
    fireEvent.change(spacing(), { target: { value: '0.25' } });
    fireEvent.click(line());
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ count: 2, gap: 18, separator: true });
  });

  it('refuses spacing that leaves a column narrower than 0.5 in, holding Apply', () => {
    open();
    fireEvent.change(count(), { target: { value: '3' } });
    // Letter's 6.5 in less three 0.5 in columns, in two gaps: 2.5 in at most.
    fireEvent.change(spacing(), { target: { value: '2.6' } });
    expect(screen.getByText('Enter a number from 0 to 2.5.')).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' }).disabled).toBe(true);
    fireEvent.change(spacing(), { target: { value: '2.5' } });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' }).disabled).toBe(false);
  });

  it("keeps the section's exact gap when spacing is left as shown, and offers a file's larger count", () => {
    const onApply = open({ ...letter, columns: { count: 4, gap: 20.3, separator: true } });
    expect(count().value).toBe('4');
    expect(line().checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ count: 4, gap: 20.3, separator: true });
  });

  it('applies one column without a line', () => {
    const onApply = open({ ...letter, columns: { count: 2, gap: 36, separator: true } });
    fireEvent.click(screen.getByRole('radio', { name: 'One column' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onApply).toHaveBeenCalledWith({ count: 1, gap: 36 });
  });
});
