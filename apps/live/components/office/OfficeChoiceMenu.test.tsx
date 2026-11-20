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

// office-shell.md "Toolbar": a choice with a submenu runs on a press, and opens its submenu from the keyboard.
describe('OfficeChoiceMenu with a choice that has a submenu', () => {
  const STYLE: OfficeEntry = {
    kind: 'submenu',
    id: 'style-title-menu',
    label: 'Title',
    run: 'style-title',
    checkable: 'radio',
    faceStyle: { fontSize: '22px' },
    entries: [
      { kind: 'item', id: 'style-title', label: "Apply 'Title'", level: 'edit', status: 'built' },
      {
        kind: 'item',
        id: 'update-style-title',
        label: "Update 'Title' to match",
        level: 'edit',
        status: 'built',
      },
    ],
  };
  const OPTIONS: OfficeEntry = {
    kind: 'submenu',
    id: 'style-options',
    label: 'Options',
    entries: [
      { kind: 'item', id: 'reset-styles', label: 'Reset styles', level: 'edit', status: 'built' },
    ],
  };

  function open() {
    const apply = vi.fn();
    const update = vi.fn();
    render(
      <OfficeChoiceMenu
        id="styles"
        label="Styles"
        value="Title"
        entries={[STYLE, { kind: 'separator' }, OPTIONS]}
        actions={{
          'style-title': { run: apply, checked: true },
          'update-style-title': { run: update },
          'reset-styles': { run: vi.fn() },
        }}
        width={120}
        tabIndex={0}
        className=""
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Styles: Title' }));
    const menu = screen.getByRole('menu', { name: 'Styles' });
    return { apply, update, menu, row: within(menu).getByRole('menuitem', { name: 'Title' }) };
  }

  it('draws the choice at the caret as current and checked, in its look, and never scrolls the menu', () => {
    const { row, menu } = open();
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(row.getAttribute('aria-haspopup')).toBe('menu');
    expect(row.querySelector('svg')).not.toBeNull();
    expect(row.querySelector<HTMLElement>('span[style]')!.style.fontSize).toBe('22px');
    expect(menu.className).not.toContain('overflow-y-auto');
  });

  it('runs the choice on a press, closing the menu', () => {
    const { row, apply } = open();
    fireEvent.click(row, { detail: 1 });
    expect(apply).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens its submenu on Enter, focus on its first item, and runs Update to match from there', () => {
    const { row, apply, update } = open();
    row.focus();
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(apply).not.toHaveBeenCalled();
    const submenu = screen.getAllByRole('menu').at(-1)!;
    expect(document.activeElement).toBe(
      within(submenu).getByRole('menuitem', { name: "Apply 'Title'" }),
    );
    fireEvent.click(within(submenu).getByRole('menuitem', { name: "Update 'Title' to match" }));
    expect(update).toHaveBeenCalled();
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
