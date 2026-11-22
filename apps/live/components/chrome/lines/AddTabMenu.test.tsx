// @vitest-environment jsdom

// The add menu (docs/specs/007-editor/editor-modes.md "+ adds a tab or a Plan tab", toolbar-layout.md "The bottom
// line"): + opens Tab, Board, Sheet and Dashboard, styled as the mode menu, each adding its choice.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { track } from '@/lib/telemetry';
import { AddTabMenu } from './AddTabMenu';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

function open(tabMode: 'draw' | 'diagram' | 'pages' = 'diagram') {
  const onAdd = vi.fn();
  render(<AddTabMenu onAdd={onAdd} tabMode={tabMode} />);
  fireEvent.click(screen.getByRole('button', { name: 'Add tab' }));
  return onAdd;
}

const items = () => screen.getAllByRole('menuitem');

describe('AddTabMenu', () => {
  it('is a menu button named Add tab', () => {
    render(<AddTabMenu onAdd={vi.fn()} tabMode="diagram" />);
    const button = screen.getByRole('button', { name: 'Add tab' });
    expect(button.getAttribute('aria-haspopup')).toBe('menu');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.dataset.tourId).toBe('add-tab');
  });

  it('offers Tab, Board, Sheet and Dashboard, each with its mark', () => {
    open();
    expect(screen.getByRole('menu', { name: 'Add tab' })).toBeTruthy();
    expect(items().map((i) => i.textContent)).toEqual(['Tab', 'Board', 'Sheet', 'Dashboard']);
    for (const item of items()) expect(item.querySelector('svg')).not.toBeNull();
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'AddTabMenu');
  });

  // docs/specs/006-document/kinds-outside-the-canvas.md "The tab strip": Text document after the Plan rows, only where
  // the document can hold one (stored on LiveDoc).
  it('offers Text document after the Plan rows when the document can hold one', () => {
    const onAdd = vi.fn();
    render(
      <AddTabMenu onAdd={onAdd} tabMode="diagram" offers={{ textDocument: true, pdf: false }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add tab' }));
    expect(items().map((i) => i.textContent)).toEqual([
      'Tab',
      'Board',
      'Sheet',
      'Dashboard',
      'Text document',
    ]);
    fireEvent.click(document.querySelector('[data-add-tab-row="text-document"]')!);
    expect(onAdd).toHaveBeenCalledWith('text-document');
  });

  // docs/specs/035-pdf-documents/pdf-document.md "A PDF tab from a file": after Text document, only where the
  // document is stored on LiveDoc and the host stores files.
  it('offers PDF from a file last, with its mark, where the document can take one', () => {
    const onAdd = vi.fn();
    render(
      <AddTabMenu onAdd={onAdd} tabMode="diagram" offers={{ textDocument: true, pdf: true }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add tab' }));
    expect(items().map((i) => i.textContent)).toEqual([
      'Tab',
      'Board',
      'Sheet',
      'Dashboard',
      'Text document',
      'PDF from a file',
    ]);
    const row = document.querySelector<HTMLElement>('[data-add-tab-row="pdf"]')!;
    expect(row.querySelector('svg')).not.toBeNull();
    fireEvent.click(row);
    expect(onAdd).toHaveBeenCalledWith('pdf');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers PDF from a file without Text document where only it is offered, and never unasked', () => {
    const { unmount } = render(
      <AddTabMenu onAdd={vi.fn()} tabMode="diagram" offers={{ textDocument: false, pdf: true }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add tab' }));
    expect(items().map((i) => i.textContent)).toEqual([
      'Tab',
      'Board',
      'Sheet',
      'Dashboard',
      'PDF from a file',
    ]);
    unmount();
    open();
    expect(document.querySelector('[data-add-tab-row="pdf"]')).toBeNull();
  });

  it('draws the Tab row with the mark of the mode it will open in', () => {
    open('draw');
    expect(items()[0]!.dataset.addTabRow).toBe('tab');
    expect(items()[0]!.dataset.opensIn).toBe('draw');
  });

  it.each(['tab', 'board', 'sheet', 'dashboard'] as const)('adds a %s and closes', (choice) => {
    const onAdd = open();
    fireEvent.click(document.querySelector(`[data-add-tab-row="${choice}"]`)!);
    expect(onAdd).toHaveBeenCalledWith(choice);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('keeps the menu keyboard: first row focused, arrows move, Enter adds, Escape closes', () => {
    const onAdd = open();
    expect(document.activeElement).toBe(items()[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items()[1]);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(items()[3]);
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('dashboard');
  });

  it('closes on Escape, returning focus to +', () => {
    open();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add tab' }));
  });
});
