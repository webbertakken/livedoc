// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import type { OfficeActions, OfficeCatalogue } from '@/lib/office/office-catalogue';
import { track } from '@/lib/telemetry';
import { TEXT_DOCUMENT_SHORTCUTS } from '@/lib/text-document/text-document-shortcuts';
import { OfficeTitleRow } from './OfficeTitleRow';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const CATALOGUE: OfficeCatalogue = [
  {
    id: 'edit',
    label: 'Edit',
    entries: [
      { kind: 'item', id: 'undo', label: 'Undo', level: 'edit', status: 'built', shortcut: 'undo' },
      { kind: 'item', id: 'redo', label: 'Redo', level: 'edit', status: 'built', shortcut: 'redo' },
    ],
  },
  {
    id: 'format',
    label: 'Format',
    entries: [
      {
        kind: 'submenu',
        id: 'text',
        label: 'Text',
        entries: [
          {
            kind: 'item',
            id: 'bold',
            label: 'Bold',
            level: 'edit',
            status: 'comingSoon',
            shortcut: 'bold',
          },
        ],
      },
    ],
  },
  {
    id: 'help',
    label: 'Help',
    entries: [
      {
        kind: 'item',
        id: 'search-the-menus',
        label: 'Search the menus',
        level: 'view',
        status: 'built',
        shortcut: 'tool-finder',
      },
    ],
  },
];

function Shell({ actions }: { actions: OfficeActions }) {
  const root = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={root}>
      <OfficeTitleRow
        name="Notes"
        format=".ODT"
        formatTitle="OpenDocument format"
        problem={null}
        catalogue={CATALOGUE}
        level="edit"
        actions={actions}
        shortcuts={TEXT_DOCUMENT_SHORTCUTS}
        keyScope={root}
        telemetryKind="TextDocument"
      />
      <p data-testid="body" tabIndex={0}>
        Body
      </p>
    </div>
  );
}

const openFinder = () => {
  const body = screen.getByTestId('body');
  body.focus();
  fireEvent.keyDown(body, { code: 'Slash', key: '/', altKey: true });
  return screen.getByRole('combobox', { name: 'Search the menus' });
};

// docs/specs/004-interface-design/office-shell.md "Tool finder".
describe('OfficeToolFinder', () => {
  it('opens on Alt+/ with the field focused, and shows nothing for nothing typed', () => {
    render(<Shell actions={{ undo: { run: vi.fn() } }} />);
    const field = openFinder();
    expect(document.activeElement).toBe(field);
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });

  it('opens from Help > Search the menus', () => {
    render(<Shell actions={{}} />);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Help' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Search the menus' }));
    expect(screen.getByRole('combobox', { name: 'Search the menus' })).toBeTruthy();
  });

  it('lists matches with their path and shortcut, and runs the one chosen with Enter', () => {
    const undo = vi.fn();
    render(<Shell actions={{ undo: { run: undo }, redo: { run: vi.fn() } }} />);
    const field = openFinder();
    fireEvent.change(field, { target: { value: 'edit' } });
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['UndoEditCtrl+Z', 'RedoEditCtrl+Shift+Z']);
    expect(screen.getByRole('status').textContent).toBe('2 results');
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    expect(field.getAttribute('aria-activedescendant')).toBe(options[0]!.id);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(track).toHaveBeenCalledWith('UI', 'Used', 'TextDocumentToolFinder');
  });

  it('lists a coming-soon item dimmed, and does nothing when it is chosen', () => {
    render(<Shell actions={{}} />);
    const field = openFinder();
    fireEvent.change(field, { target: { value: 'bold' } });
    const bold = screen.getByRole('option');
    expect(bold.getAttribute('aria-disabled')).toBe('true');
    expect(bold.textContent).toContain('Coming soon');
    expect(bold.textContent).toContain('Format › Text');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(screen.getByRole('combobox')).toBeTruthy();
  });

  it('closes on Escape, focus back where it was', () => {
    render(<Shell actions={{}} />);
    const field = openFinder();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('body'));
  });

  it('runs a result pressed with the pointer', () => {
    const redo = vi.fn();
    render(<Shell actions={{ redo: { run: redo } }} />);
    fireEvent.change(openFinder(), { target: { value: 'redo' } });
    fireEvent.click(screen.getByRole('option'));
    expect(redo).toHaveBeenCalledOnce();
  });
});
