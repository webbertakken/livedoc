// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useRef } from 'react';
import type { AccessLevel } from '@livedoc/api-schema';
import { track } from '@/lib/telemetry';
import { textDocumentEditorActions } from '@/lib/text-document/text-document-editor-actions';
import { clipboardActions } from '@/lib/text-document/text-document-clipboard';
import {
  textDocumentMenus,
  textDocumentTextContextMenu,
} from '@/lib/text-document/text-document-menus';
import { TEXT_DOCUMENT_SHORTCUTS } from '@/lib/text-document/text-document-shortcuts';
import type { OfficeActions } from '@/lib/office/office-catalogue';
import { OfficeTitleRow } from './OfficeTitleRow';

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const CATALOGUE = textDocumentMenus('odf');

function Surface({
  level = 'edit',
  placeCaret = () => {},
  extra = {},
}: {
  level?: AccessLevel;
  placeCaret?: (p: { x: number; y: number }) => void;
  extra?: OfficeActions;
}) {
  const root = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={root}>
      <OfficeTitleRow
        name="Notes"
        format=".ODT"
        formatTitle="OpenDocument format"
        problem={null}
        catalogue={CATALOGUE}
        level={level}
        actions={{
          ...textDocumentEditorActions(null, { canEdit: level === 'edit' }),
          ...clipboardActions(null, { canEdit: level === 'edit', onRefused: () => {} }),
          // Clear formatting is built: the surface binds it for a session that writes.
          ...(level === 'edit' ? { 'clear-formatting': { run: () => {} } } : {}),
          ...extra,
        }}
        shortcuts={TEXT_DOCUMENT_SHORTCUTS}
        keyScope={root}
        telemetryKind="TextDocument"
        contextMenu={{
          entries: textDocumentTextContextMenu(CATALOGUE),
          caretPoint: () => ({ x: 40, y: 50 }),
          placeCaret,
        }}
      />
      <div data-region="document">
        <div role="textbox" tabIndex={0} aria-label="Document body" />
      </div>
      <p>Outside</p>
    </div>
  );
}

const menu = () => screen.queryByRole('menu', { name: 'Context menu' });
const rightClick = (target: Element, init: MouseEventInit = {}) => {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 120,
    clientY: 90,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

// docs/specs/004-interface-design/office-shell.md "Context menus"; editing-surface.md "Context menus".
describe('the context menu', () => {
  it('opens at the pointer on a right-click in the document, moving the caret there', () => {
    const placeCaret = vi.fn();
    render(<Surface placeCaret={placeCaret} />);
    const event = rightClick(screen.getByRole('textbox'));
    expect(event.defaultPrevented).toBe(true);
    expect(placeCaret).toHaveBeenCalledWith({ x: 120, y: 90 });
    const opened = menu()!;
    expect(opened.style.left).toBe('120px');
    expect(track).toHaveBeenCalledWith('UI', 'Opened', 'TextDocumentContextMenu');
    expect(
      within(opened)
        .getAllByRole('menuitem')
        .map((i) => i.textContent?.replace('Coming soon', '')),
    ).toEqual([
      'CutCtrl+X',
      'CopyCtrl+C',
      'PasteCtrl+V',
      'Paste without formattingCtrl+Shift+V',
      'Delete',
      'Comment',
      'Suggest edits',
      'Insert link',
      'Format options',
      'Clear formattingCtrl+\\',
      'Select all matching text',
    ]);
    expect(document.activeElement).toBe(within(opened).getAllByRole('menuitem')[0]);
  });

  // lists.md "Numbering": Restart and Continue numbering show on a numbered item only.
  it('shows a contextual item only while it can run where the menu opens', () => {
    let onItem = false;
    const contextual = {
      run: () => {},
      get disabled() {
        return !onItem;
      },
    };
    render(
      <Surface
        placeCaret={() => {
          onItem = true;
        }}
        extra={{
          'restart-numbering': contextual,
          'continue-numbering': { run: () => {}, disabled: true },
        }}
      />,
    );
    const names = () =>
      within(menu()!)
        .getAllByRole('menuitem')
        .map((i) => i.textContent?.replace('Coming soon', ''));
    const writing = screen.getByRole('textbox');
    writing.focus();
    fireEvent.keyDown(writing, { key: 'F10', code: 'F10', shiftKey: true });
    expect(names()).not.toContain('Restart numbering');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    rightClick(screen.getByRole('textbox'));
    expect(names()).toContain('Restart numbering');
    expect(names()).not.toContain('Continue previous numbering');
  });

  it('leaves Shift+right-click, and a right-click outside the document, to the browser', () => {
    render(<Surface />);
    expect(rightClick(screen.getByRole('textbox'), { shiftKey: true }).defaultPrevented).toBe(
      false,
    );
    expect(rightClick(screen.getByText('Outside')).defaultPrevented).toBe(false);
    expect(menu()).toBeNull();
  });

  it('opens at the caret with Shift+F10 and from the menu key, and closes with Escape', () => {
    render(<Surface />);
    const writing = screen.getByRole('textbox');
    writing.focus();
    fireEvent.keyDown(writing, { key: 'F10', code: 'F10', shiftKey: true });
    expect(menu()!.style.left).toBe('40px');
    const first = within(menu()!).getAllByRole('menuitem')[0]!;
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Escape' });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(writing);
    rightClick(screen.getByRole('textbox'), { clientX: 0, clientY: 0 });
    expect(menu()!.style.top).toBe('50px');
  });

  it('dims what is not built, and Delete while nothing is selected', () => {
    render(<Surface />);
    rightClick(screen.getByRole('textbox'));
    const item = (name: string) =>
      within(menu()!).getByRole('menuitem', { name: new RegExp(`^${name}`) });
    expect(item('Comment').getAttribute('aria-disabled')).toBe('true');
    expect(item('Cut').getAttribute('aria-disabled')).toBe('true');
    expect(item('Delete').getAttribute('aria-disabled')).toBe('true');
  });

  it('shows a Viewer only what a Viewer may do: Copy', () => {
    render(<Surface level="view" />);
    rightClick(screen.getByRole('textbox'));
    expect(
      within(menu()!)
        .getAllByRole('menuitem')
        .map((i) => i.textContent?.replace('Coming soon', '')),
    ).toEqual(['CopyCtrl+C']);
  });
});
