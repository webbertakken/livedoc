// @vitest-environment jsdom
// formatting.md "Number formats": Custom Date and Time: the row of parts, Add, remove, presets, preview and Apply.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { serialFromParts } from '@livedoc/sheets';
import { CustomDateTimeDialog } from './CustomDateTimeDialog';

function open(value: number | null = serialFromParts(2026, 1, 5)) {
  const onApply = vi.fn();
  render(
    <CustomDateTimeDialog
      value={value}
      format={{ nf: 'date' }}
      locale="en-GB"
      onApply={onApply}
      onClose={vi.fn()}
    />,
  );
  return { onApply, apply: () => fireEvent.click(screen.getByRole('button', { name: 'Apply' })) };
}
const preview = () => screen.getByRole('status').textContent;

describe('CustomDateTimeDialog', () => {
  it('opens on the cell’s format, previews its date, and changes a block’s token', () => {
    const { onApply, apply } = open();
    expect(screen.getByRole('dialog', { name: 'Custom Date and Time Formats' })).toBeTruthy();
    expect(preview()).toBe('Preview: 05/01/2026');
    fireEvent.change(screen.getByRole('combobox', { name: 'Month' }), {
      target: { value: 'mmmm' },
    });
    expect(preview()).toBe('Preview: 05/January/2026');
    apply();
    expect(onApply).toHaveBeenCalledWith('dd/mmmm/yyyy');
  });

  it('edits and removes text, adds a block at the end, and dims Apply with no block left', () => {
    const { onApply, apply } = open(null);
    expect(preview()).toBe('Preview: 26/09/2008');
    const [first] = screen.getAllByRole('textbox', { name: 'Text' });
    fireEvent.change(first!, { target: { value: ' of ' } });
    expect(preview()).toBe('Preview: 26 of 09/2008');
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove Text' })[1]!);
    fireEvent.change(screen.getByRole('combobox', { name: 'Add' }), { target: { value: 'hour' } });
    apply();
    expect(onApply).toHaveBeenLastCalledWith('dd" of "mmyyyyh');
    for (const name of ['Day', 'Month', 'Year', 'Hour'])
      fireEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Text' }));
    const button = screen.getByRole('button', { name: 'Apply' });
    expect(button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true').toBe(
      true,
    );
  });

  it('replaces the row with a preset', () => {
    const { onApply, apply } = open();
    fireEvent.click(screen.getByRole('button', { name: '3:59 PM, h:mm AM/PM' }));
    expect(screen.getByRole('combobox', { name: 'AM/PM' })).toBeTruthy();
    expect(preview()).toBe('Preview: 12:00 AM');
    apply();
    expect(onApply).toHaveBeenCalledWith('h:mm AM/PM');
  });
});
