// @vitest-environment jsdom
// docs/specs/034-text-documents/lists.md "Numbering": Restart numbering's dialog.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  readRestartField,
  TextDocumentRestartNumberingDialog,
} from './TextDocumentRestartNumberingDialog';

function setup(start: number) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <TextDocumentRestartNumberingDialog open start={start} onApply={onApply} onClose={onClose} />,
  );
  return {
    onApply,
    onClose,
    field: screen.getByRole<HTMLInputElement>('textbox', { name: 'Start at' }),
    ok: screen.getByRole<HTMLButtonElement>('button', { name: 'OK' }),
  };
}

describe('readRestartField', () => {
  it('reads a whole number from 0 to 32767, and nothing else', () => {
    expect(readRestartField(' 7 ')).toBe(7);
    expect(readRestartField('0')).toBe(0);
    expect(readRestartField('32767')).toBe(32767);
    for (const text of ['', '-1', '32768', '1.5', 'x', '1e3'])
      expect(readRestartField(text)).toBeNull();
  });
});

describe('TextDocumentRestartNumberingDialog', () => {
  it('opens at the number it starts with and restarts at what is typed', () => {
    const { field, ok, onApply } = setup(4);
    expect(field.value).toBe('4');
    fireEvent.change(field, { target: { value: '12' } });
    fireEvent.click(ok);
    expect(onApply).toHaveBeenCalledWith(12);
  });

  it('refuses anything else under the field, and OK with it', () => {
    const { field, ok, onApply } = setup(1);
    fireEvent.change(field, { target: { value: '40000' } });
    expect(screen.getByText('Enter a whole number from 0 to 32767.')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(ok.disabled).toBe(true);
    fireEvent.click(ok);
    expect(onApply).not.toHaveBeenCalled();
  });
});
