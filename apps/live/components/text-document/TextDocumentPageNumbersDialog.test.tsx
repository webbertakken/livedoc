// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Page numbers": the Page numbers dialog.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  readStart,
  START_OUT_OF_RANGE,
  TextDocumentPageNumbersDialog,
} from './TextDocumentPageNumbersDialog';

const open = (start: number | undefined, scopes: ('section' | 'document')[] = ['section']) => {
  const onApply = vi.fn();
  render(
    <TextDocumentPageNumbersDialog
      open
      start={start}
      scopes={scopes}
      onApply={onApply}
      onClose={vi.fn()}
    />,
  );
  return onApply;
};
const apply = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Apply' });
const startAt = () => screen.getByRole<HTMLInputElement>('textbox', { name: 'Start at' });

describe('TextDocumentPageNumbersDialog', () => {
  it('opens at Header, on the first page, continuing; no Apply to with one section', () => {
    const onApply = open(undefined);
    expect(screen.getByRole('dialog', { name: 'Page numbers' })).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('radio', { name: 'Header' }).checked).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: 'Show on first page' }).checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Continue from previous section' })
        .checked,
    ).toBe(true);
    expect(startAt().disabled).toBe(true);
    expect(screen.queryByRole('combobox', { name: 'Apply to' })).toBeNull();
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith(
      { position: 'header', firstPage: true, start: null },
      'section',
    );
  });

  it('applies the footer, no first page, a start and the scope', () => {
    const onApply = open(3, ['section', 'document']);
    expect(startAt().value).toBe('3');
    fireEvent.click(screen.getByRole('radio', { name: 'Footer' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show on first page' }));
    fireEvent.change(startAt(), { target: { value: '0' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Apply to' }), {
      target: { value: 'document' },
    });
    fireEvent.click(apply());
    expect(onApply).toHaveBeenCalledWith(
      { position: 'footer', firstPage: false, start: 0 },
      'document',
    );
  });

  it('refuses a start that is no whole number from 0 to 9999', () => {
    open(1);
    fireEvent.change(startAt(), { target: { value: '10000' } });
    expect(screen.getByText(START_OUT_OF_RANGE)).toBeTruthy();
    expect(apply().disabled).toBe(true);
    expect(readStart('2.5')).toBeNull();
    expect(readStart(' 12 ')).toBe(12);
  });
});
