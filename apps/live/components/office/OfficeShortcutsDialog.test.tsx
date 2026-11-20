// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ShortcutRow } from '@/lib/office/shortcut-registry';
import { OfficeShortcutsDialog } from './OfficeShortcutsDialog';

const ROWS: ShortcutRow[] = [
  {
    id: 'undo',
    group: 'Common actions',
    action: 'Undo',
    keys: { pc: 'Ctrl+Z', mac: '⌘+Z', chromeos: 'Ctrl+Z' },
    status: 'built',
  },
  {
    id: 'voice',
    group: 'Common actions',
    action: 'Voice typing',
    keys: { pc: 'Ctrl+Shift+S', mac: '⌘+Shift+S', chromeos: 'Ctrl+Shift+S' },
    status: 'leftOut',
  },
  {
    id: 'bold',
    group: 'Text formatting',
    action: 'Bold',
    keys: { pc: 'Ctrl+B', mac: '⌘+B', chromeos: 'Ctrl+B' },
    status: 'specified',
  },
];

function open() {
  const onClose = vi.fn();
  render(<OfficeShortcutsDialog rows={ROWS} onClose={onClose} />);
  const search = screen.getByRole('searchbox', { name: 'Search keyboard shortcuts' });
  return { onClose, search };
}

const escape = (target: Element) =>
  fireEvent.keyDown(target, { key: 'Escape', code: 'Escape', bubbles: true });

// docs/specs/004-interface-design/office-shell.md "Keyboard shortcuts dialog".
describe('OfficeShortcutsDialog', () => {
  it('opens on its search, listing the registry by group', () => {
    const { search } = open();
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeDefined();
    expect(document.activeElement).toBe(search);
    const common = screen.getByRole('region', { name: 'Common actions' });
    expect(within(common).getByText('Undo')).toBeDefined();
    expect(within(common).getByText('Ctrl+Z')).toBeDefined();
    expect(within(common).queryByText('Voice typing')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('2 shortcuts');
  });

  it('marks a shortcut not yet built as coming soon', () => {
    open();
    const formatting = screen.getByRole('region', { name: 'Text formatting' });
    expect(within(formatting).getByText('Coming soon')).toBeDefined();
  });

  it('filters as words are typed, and says when nothing matches', () => {
    const { search } = open();
    fireEvent.change(search, { target: { value: 'bo' } });
    expect(screen.queryByRole('region', { name: 'Common actions' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('1 shortcut');
    fireEvent.change(search, { target: { value: 'zebra' } });
    expect(screen.getByText('No shortcuts match “zebra”')).toBeDefined();
    expect(screen.getByRole('status').textContent).toBe('0 shortcuts');
  });

  it('clears the search on Escape first, then closes', () => {
    const { search, onClose } = open();
    fireEvent.change(search, { target: { value: 'bo' } });
    escape(search);
    expect(search).toHaveProperty('value', '');
    expect(onClose).not.toHaveBeenCalled();
    escape(search);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lets the list be scrolled from the keyboard', () => {
    open();
    expect(screen.getByRole('group', { name: 'Shortcuts' }).tabIndex).toBe(0);
  });
});
