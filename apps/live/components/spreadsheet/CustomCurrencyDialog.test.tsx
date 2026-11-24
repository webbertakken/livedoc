// @vitest-environment jsdom
// formatting.md "Number formats": Custom Currencies: search, pick, the formats with previews, Apply (D195, D196).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CustomCurrencyDialog } from './CustomCurrencyDialog';

function open() {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(<CustomCurrencyDialog locale="en-GB" onApply={onApply} onClose={onClose} />);
  return { onApply, onClose, apply: screen.getByRole('button', { name: 'Apply' }) };
}

describe('CustomCurrencyDialog', () => {
  it('opens with nothing picked and Apply dimmed (D196)', () => {
    const { apply, onApply } = open();
    expect(screen.getByRole('dialog', { name: 'Custom Currencies' })).toBeTruthy();
    expect(screen.queryByRole('radiogroup', { name: 'Format' })).toBeNull();
    expect(apply.hasAttribute('disabled') || apply.getAttribute('aria-disabled') === 'true').toBe(
      true,
    );
    fireEvent.click(apply);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('searches, says so when nothing matches, and picks a currency with its first format', () => {
    const { onApply, apply } = open();
    const search = screen.getByRole('searchbox', { name: 'Search currencies' });
    fireEvent.change(search, { target: { value: 'zzzz' } });
    expect(screen.getByText('No currencies match')).toBeTruthy();
    fireEvent.change(search, { target: { value: 'yen' } });
    fireEvent.click(screen.getByRole('radio', { name: /^Japanese Yen/ }));
    const formats = within(screen.getByRole('radiogroup', { name: 'Format' })).getAllByRole(
      'radio',
    );
    expect(formats.map((r) => r.closest('label')!.textContent)).toEqual([
      '¥1,000.12"¥"#,##0.00',
      '¥1,000"¥"#,##0',
      '1,000.12¥#,##0.00"¥"',
      '1,000¥#,##0"¥"',
    ]);
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith('"¥"#,##0.00');
  });
});
