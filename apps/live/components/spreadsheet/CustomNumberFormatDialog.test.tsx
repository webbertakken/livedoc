// @vitest-environment jsdom
// formatting.md "Number formats": the Custom Number Formats dialog: its start, preview, examples, problems and Apply.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomNumberFormatDialog } from './CustomNumberFormatDialog';

function open(over: Partial<Parameters<typeof CustomNumberFormatDialog>[0]> = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <CustomNumberFormatDialog
      value={-2.5}
      format={{ nf: 'number', dp: 1 }}
      locale="en-GB"
      onApply={onApply}
      onClose={onClose}
      {...over}
    />,
  );
  const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Format Code' });
  const apply = screen.getByRole('button', { name: 'Apply' });
  return { onApply, onClose, field, apply };
}

describe('CustomNumberFormatDialog', () => {
  it('starts from the cell’s format and previews the cell’s value in the code', () => {
    const { field } = open();
    expect(screen.getByRole('dialog', { name: 'Custom Number Formats' })).toBeTruthy();
    expect(field.value).toBe('#,##0.0');
    expect(screen.getByRole('status').textContent).toBe('Preview: -2.5');
  });

  it('draws the preview in the code’s colour, and an example fills the field without applying', () => {
    const { field, onApply } = open();
    fireEvent.click(screen.getByRole('button', { name: '#,##0.00;[Red]-#,##0.00, 1,234.50' }));
    expect(field.value).toBe('#,##0.00;[Red]-#,##0.00');
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Preview: -2.50');
    expect(status.style.color).toBe('rgb(255, 0, 0)');
    expect(onApply).not.toHaveBeenCalled();
  });

  it('says why a code cannot be read and dims Apply', () => {
    const { field, apply, onApply } = open();
    fireEvent.change(field, { target: { value: '[Purple]0' } });
    expect(screen.getByRole('status').textContent).toBe(
      '`[Purple]` is not a colour or a condition',
    );
    expect(apply.hasAttribute('disabled') || apply.getAttribute('aria-disabled') === 'true').toBe(
      true,
    );
    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies the code typed, and Cancel changes nothing', () => {
    const { field, apply, onApply, onClose } = open({ value: null, format: undefined });
    expect(field.value).toBe('#,##0.00');
    expect(screen.getByRole('status').textContent).toBe('Preview: 1,234.50');
    fireEvent.change(field, { target: { value: '0.0"kg"' } });
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith('0.0"kg"');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });
});
