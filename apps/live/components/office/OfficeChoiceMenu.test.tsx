// @vitest-environment jsdom
// docs/specs/004-interface-design/office-shell.md "Toolbar", choice controls: the Styles control.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { OfficeEntry } from '@/lib/office/office-catalogue';
import { OfficeChoiceMenu } from './OfficeChoiceMenu';
import { OfficeToolbar } from './OfficeToolbar';

const ENTRIES: OfficeEntry[] = [
  {
    kind: 'item',
    id: 'style-normal',
    label: 'Normal text',
    level: 'edit',
    status: 'built',
    checkable: 'radio',
  },
  {
    kind: 'item',
    id: 'style-title',
    label: 'Title',
    level: 'edit',
    status: 'built',
    checkable: 'radio',
    faceStyle: { fontSize: '22px', fontWeight: 700, fontStyle: 'italic' },
  },
];

function setup(value: string | null) {
  const run = vi.fn();
  const onOpen = vi.fn();
  render(
    <OfficeChoiceMenu
      id="styles"
      label="Styles"
      value={value}
      entries={ENTRIES}
      actions={{
        'style-normal': { run, checked: value === 'Normal text' },
        'style-title': { run, checked: value === 'Title' },
      }}
      width={120}
      tabIndex={0}
      className=""
      onOpen={onOpen}
    />,
  );
  return {
    run,
    onOpen,
    button: screen.getByRole('button', { name: value ? `Styles: ${value}` : 'Styles' }),
  };
}

describe('OfficeChoiceMenu', () => {
  it('shows the value at the caret, blank over a mixed selection', () => {
    expect(setup('Normal text').button.textContent).toBe('Normal text');
  });

  it('shows nothing over a mixed selection', () => {
    expect(setup(null).button.textContent).toBe('');
  });

  it('opens its menu over the page, the value checked, each choice in its look, and runs a choice', () => {
    const { button, run, onOpen } = setup('Normal text');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalled();
    const menu = screen.getByRole('menu', { name: 'Styles' });
    expect(menu.closest('[data-office-popup]')).not.toBeNull();
    expect(
      within(menu).getByRole('menuitemradio', { name: 'Normal text' }).getAttribute('aria-checked'),
    ).toBe('true');
    const title = within(menu).getByRole('menuitemradio', { name: 'Title' });
    const face = title.querySelector<HTMLElement>('span[style]')!;
    expect([face.style.fontSize, face.style.fontWeight, face.style.fontStyle]).toEqual([
      '22px',
      '700',
      'italic',
    ]);
    fireEvent.click(title);
    expect(run).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens from the keyboard with Down, and closes again from its control', () => {
    const { button } = setup('Title');
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.keyDown(button, { key: 'ArrowDown' });
    fireEvent.click(button);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('OfficeToolbar choices', () => {
  it('draws a choice control where the kind binds it, with its value', () => {
    const control = (id: string) => ({
      id,
      label: id === 'styles' ? 'Styles' : 'Other',
      level: 'edit' as const,
      status: 'built' as const,
      look: { kind: 'choice' as const, width: 120 },
    });
    render(
      <OfficeToolbar
        groups={[{ id: 'style', label: 'Style', controls: [control('styles'), control('other')] }]}
        actions={{}}
        shortcutOf={() => null}
        zoom={null}
        choices={{ styles: { read: () => 'Heading 1', entries: ENTRIES, actions: {} } }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Styles: Heading 1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Other/ })).toBeNull();
  });
});
