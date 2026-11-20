// @vitest-environment jsdom
// docs/specs/004-interface-design/fonts.md "The font menu".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { readRecentFonts } from '@/lib/office/office-recent-fonts';
import { OfficeFontMenu } from './OfficeFontMenu';

afterEach(() => localStorage.clear());

function setup(value: string | null) {
  const font = { read: () => value, set: vi.fn() };
  render(<OfficeFontMenu font={font} value={value} tabIndex={0} className="" />);
  return { font, button: screen.getByRole('button', { name: value ? `Font: ${value}` : 'Font' }) };
}

describe('OfficeFontMenu', () => {
  it('shows the family at the caret', () => {
    const { button } = setup('Lora');
    expect(button.textContent).toBe('Lora');
    expect((button.firstChild as HTMLElement).className).not.toContain('italic');
  });

  it('shows a family the menu does not list in italics', () => {
    const { button } = setup('Calibri');
    expect((button.firstChild as HTMLElement).className).toContain('italic');
  });

  it('opens over the page with More fonts dimmed and the families, the one at the caret checked', () => {
    const { button } = setup('Georgia');
    fireEvent.click(button);
    const menu = screen.getByRole('menu');
    expect(menu.closest('[data-office-popup]')).not.toBeNull();
    expect(
      within(menu)
        .getByRole('menuitem', { name: /More fonts/ })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    const georgia = within(menu).getByRole('menuitemradio', { name: 'Georgia' });
    expect(georgia.getAttribute('aria-checked')).toBe('true');
    expect((georgia.querySelector('span[style]') as HTMLElement).style.fontFamily).toContain(
      'Gelasio',
    );
  });

  it('chooses a family, remembers it among the recent ones, and closes', () => {
    const { button, font } = setup('Arial');
    fireEvent.click(button);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Roboto' }));
    expect(font.set).toHaveBeenCalledWith('Roboto');
    expect(readRecentFonts()).toEqual(['Roboto']);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getAllByRole('menuitemradio', { name: 'Roboto' })).toHaveLength(2);
  });
});
