// @vitest-environment jsdom
// Escape closes a palette dropdown without picking (docs/specs/004-interface-design/escape.md, the `surface` layer;
// docs/specs/004-interface-design/dropdown-tile-grid.md "Escape closes it").
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaletteDropdown } from './PaletteDropdown';

const options = [
  { id: 'select', label: 'Select' },
  { id: 'pan', label: 'Hand' },
];

const menu = () => screen.queryByRole('listbox');

function show() {
  const onChange = vi.fn();
  render(
    <>
      <PaletteDropdown
        ariaLabel="Selection mode"
        value="select"
        options={options}
        onChange={onChange}
      />
      <input aria-label="Elsewhere" />
      <div data-tour-popover="">
        <button type="button">Next</button>
      </div>
    </>,
  );
  const trigger = screen.getByRole('button', { name: 'Selection mode' });
  fireEvent.click(trigger);
  return { onChange, trigger };
}

describe('a palette dropdown on Escape', () => {
  it('closes from the trigger, keeping the keyboard on it, and picks nothing', () => {
    const { onChange, trigger } = show();
    trigger.focus();
    const e = fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(e).toBe(false);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('closes from inside the menu and hands the keyboard to the trigger', () => {
    const { trigger } = show();
    const option = screen.getByRole('option', { name: /Hand/ });
    fireEvent.keyDown(option, { key: 'Escape' });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes from anywhere else, leaving the keyboard where it was', () => {
    const { trigger } = show();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(menu()).toBeNull();
    expect(document.activeElement).not.toBe(trigger);
  });

  it('leaves a field its own Escape', () => {
    show();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Elsewhere' }), { key: 'Escape' });
    expect(menu()).toBeTruthy();
  });

  it('leaves a tour explaining it its own Escape', () => {
    show();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Next' }), { key: 'Escape' });
    expect(menu()).toBeTruthy();
  });

  it('leaves a key another listener claimed', () => {
    show();
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    e.preventDefault();
    document.body.dispatchEvent(e);
    expect(menu()).toBeTruthy();
  });

  it('ignores every other key', () => {
    const { trigger } = show();
    fireEvent.keyDown(trigger, { key: 'a' });
    expect(menu()).toBeTruthy();
  });
});
