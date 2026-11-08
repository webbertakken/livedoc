// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NewDocumentButton } from './NewDocumentButton';
import { prefetchNewDocumentOpen, startNewDocument } from './start-new-document';
import { writeLastBlank } from '@/lib/new-document/last-blank';

vi.mock('./start-new-document', () => ({
  startNewDocument: vi.fn(),
  prefetchNewDocumentOpen: vi.fn(),
}));

const started = vi.mocked(startNewDocument);

async function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'More new document choices' }));
  return screen.findByRole('menu', { name: 'New Document' });
}

// docs/specs/013-workspace/new-document-menu.md
describe('NewDocumentButton', () => {
  // The menu is a lazy chunk: loaded once up front, so opening it never races the first import.
  beforeAll(async () => {
    await import('./NewDocumentMenu');
  });
  beforeEach(() => {
    act(() => writeLastBlank('diagram'));
  });
  afterEach(() => {
    started.mockClear();
    sessionStorage.clear();
  });

  it('makes the last blank from its face, at once', () => {
    render(<NewDocumentButton place={{ folderId: 'f1' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'New Diagram' }));
    expect(started).toHaveBeenCalledWith({
      choice: 'blank',
      blank: 'diagram',
      template: 'blank',
      place: { folderId: 'f1' },
    });
  });

  it('names its face after the blank made last', async () => {
    render(<NewDocumentButton place={{}} />);
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sheet, blank' }));
    expect(started).toHaveBeenLastCalledWith(
      expect.objectContaining({ choice: 'blank', blank: 'sheet', template: 'blank-spreadsheet' }),
    );
    expect(screen.getByRole('button', { name: 'New Sheet' })).toBeTruthy();
  });

  it('opens the menu on the last blank, its row focused', async () => {
    act(() => writeLastBlank('form'));
    render(<NewDocumentButton place={{}} />);
    await openMenu();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Form, blank' })),
    );
    expect(screen.getByRole('group', { name: 'Form templates' })).toBeTruthy();
  });

  it('lists the nine blanks, each with its number key', async () => {
    render(<NewDocumentButton place={{}} />);
    await openMenu();
    const rows = screen
      .getAllByRole('menuitem')
      .filter((el) => el.getAttribute('aria-label')?.endsWith(', blank'));
    expect(rows.map((r) => r.getAttribute('aria-keyshortcuts'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ]);
  });

  it('makes a blank from its number key', async () => {
    render(<NewDocumentButton place={{}} />);
    const menu = await openMenu();
    fireEvent.keyDown(menu.querySelector('[data-spot="list:0"]')!, { key: '6' });
    expect(started).toHaveBeenCalledWith(
      expect.objectContaining({ blank: 'board', template: 'blank-board' }),
    );
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('makes a template from its card', async () => {
    render(<NewDocumentButton place={{}} />);
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Flowchart' }));
    expect(started).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'template', blank: 'diagram', template: 'flowchart' }),
    );
  });

  it('makes a brainstorm from its row, second in the list', async () => {
    render(<NewDocumentButton place={{}} />);
    await openMenu();
    const row = screen.getByRole('menuitem', { name: 'Brainstorm, blank' });
    expect(row.getAttribute('aria-keyshortcuts')).toBe('2');
    fireEvent.click(row);
    expect(started).toHaveBeenCalledWith(
      expect.objectContaining({
        choice: 'blank',
        blank: 'brainstorm',
        template: 'blank-brainstorm',
      }),
    );
  });

  it('lists every template of the blank, in its groups', async () => {
    act(() => writeLastBlank('page'));
    render(<NewDocumentButton place={{}} />);
    await openMenu();
    const pane = screen.getByRole('group', { name: 'Page templates' });
    expect(pane.querySelectorAll('h3')[0]?.textContent).toBe('Articles');
    expect(screen.getByRole('menuitem', { name: 'Project Brief' })).toBeTruthy();
  });

  it('moves along the list and into the pane with the arrow keys', async () => {
    render(<NewDocumentButton place={{}} />);
    const menu = await openMenu();
    const first = menu.querySelector<HTMLElement>('[data-spot="list:0"]')!;
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Brainstorm, blank' }),
    );
    expect(screen.getByRole('group', { name: 'Brainstorm templates' })).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement?.getAttribute('data-spot')).toBe('pane:0:0');
  });

  it('offers New Folder in the menu where the section does', async () => {
    const onCreateFolder = vi.fn();
    render(
      <NewDocumentButton place={{}} onCreateFolder={onCreateFolder} folderLabel="New Subfolder" />,
    );
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Subfolder' }));
    expect(onCreateFolder).toHaveBeenCalledOnce();
    expect(started).not.toHaveBeenCalled();
  });

  it('fetches what opening needs when the pointer reaches it', () => {
    render(<NewDocumentButton place={{}} />);
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'New Diagram' }).parentElement!);
    expect(vi.mocked(prefetchNewDocumentOpen)).toHaveBeenCalled();
  });
});
