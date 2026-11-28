// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(started).toHaveBeenCalledWith(
      expect.objectContaining({
        choice: 'blank',
        blank: 'diagram',
        template: 'blank',
        place: { folderId: 'f1' },
        say: expect.any(Function),
      }),
    );
  });

  it('names its face after the blank made last', async () => {
    render(<NewDocumentButton place={{}} />);
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Spreadsheet, blank' }));
    expect(started).toHaveBeenLastCalledWith(
      expect.objectContaining({ choice: 'blank', blank: 'spreadsheet' }),
    );
    expect(screen.getByRole('button', { name: 'New Spreadsheet' })).toBeTruthy();
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
    fireEvent.keyDown(menu.querySelector('[data-spot="list:0"]')!, { key: '7' });
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

  it('makes a brainstorm from its row, third in the list, after Whiteboard', async () => {
    render(<NewDocumentButton place={{}} />);
    await openMenu();
    const row = screen.getByRole('menuitem', { name: 'Brainstorm, blank' });
    expect(row.getAttribute('aria-keyshortcuts')).toBe('3');
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
    act(() => writeLastBlank('board'));
    render(<NewDocumentButton place={{}} />);
    await openMenu();
    const pane = screen.getByRole('group', { name: 'Board templates' });
    expect(pane.querySelectorAll('h3')[0]?.textContent).toBe('Board Templates');
    expect(screen.getByRole('menuitem', { name: 'Kanban Board' })).toBeTruthy();
  });

  // new-document-menu.md "The blanks": a kind's pane says what it makes; PDF document's offers its two cards.
  // docs/specs/034-text-documents/starting-and-finding.md "Where the gallery shows".
  it('lists the text document gallery in its sections, a card making that template', async () => {
    act(() => writeLastBlank('text-document'));
    render(<NewDocumentButton place={{ folderId: 'f1' }} />);
    await openMenu();
    const pane = screen.getByRole('group', { name: 'Text document templates' });
    expect([...pane.querySelectorAll('h3')].map((h) => h.textContent)).toEqual([
      'Letters',
      'Resumes',
      'Personal',
      'Work',
      'Education',
    ]);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Formal letter' }));
    expect(started).toHaveBeenLastCalledWith(
      expect.objectContaining({
        choice: 'template',
        blank: 'text-document',
        textTemplate: 'text-formal-letter',
        place: { folderId: 'f1' },
      }),
    );
  });

  it('says what a kind makes, and offers Blank PDF and Open a PDF file for PDF document', async () => {
    act(() => writeLastBlank('spreadsheet'));
    const { unmount } = render(<NewDocumentButton place={{}} />);
    await openMenu();
    expect(screen.getByText(/An empty spreadsheet/)).toBeTruthy();
    unmount();
    act(() => writeLastBlank('pdf-document'));
    render(<NewDocumentButton place={{ folderId: 'f1' }} />);
    await openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open a PDF file' }));
    expect(started).toHaveBeenLastCalledWith(
      expect.objectContaining({ choice: 'file', blank: 'pdf-document', place: { folderId: 'f1' } }),
    );
  });

  it('no longer offers Page, Sheet or Slides', async () => {
    render(<NewDocumentButton place={{}} />);
    await openMenu();
    for (const gone of ['Page', 'Sheet', 'Slides'])
      expect(screen.queryByRole('menuitem', { name: `${gone}, blank` })).toBeNull();
  });

  it('moves along the list and into the pane with the arrow keys', async () => {
    render(<NewDocumentButton place={{}} />);
    const menu = await openMenu();
    const first = menu.querySelector<HTMLElement>('[data-spot="list:0"]')!;
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: 'Whiteboard, blank' }),
    );
    expect(screen.getByRole('group', { name: 'Whiteboard templates' })).toBeTruthy();
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

  // docs/specs/004-interface-design/sizing.md: rows at the row step in regular body type, labels at the supporting step
  // in their own case.
  it('draws the menu on the sizing scale', async () => {
    const has = (className: string, token: string) => className.split(/\s+/).includes(token);
    render(<NewDocumentButton place={{}} />);
    const menu = await openMenu();
    const row = screen.getByRole('menuitem', { name: 'Diagram, blank' });
    expect(has(row.className, 'min-h-row')).toBe(true);
    const name = within(row).getByText('Diagram');
    expect(has(name.className, 'text-body')).toBe(true);
    expect(name.className).not.toMatch(/font-(medium|semibold)/);
    const heading = menu.querySelector('h3')!;
    expect(has(heading.className, 'text-supporting')).toBe(true);
    expect(heading.className).not.toMatch(/uppercase|tracking-|font-semibold/);
  });
});
