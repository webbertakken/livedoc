// @vitest-environment jsdom
// docs/specs/034-text-documents/objects.md "Inserting and editing": over a drawing tab, a bar names its text document
// with Save and close (Close for anyone who cannot edit), also on Shift+Escape and ⌘Escape; nothing over another tab.
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';

const close = vi.hoisted(() => ({
  saveAndClose: vi.fn(),
  refused: null as string | null,
  args: null as unknown,
}));
vi.mock('./useTextDocumentDrawingClose', () => ({
  useTextDocumentDrawingClose: (args: unknown) => {
    close.args = args;
    return {
      saveAndClose: close.saveAndClose,
      close: vi.fn(),
      saving: false,
      refused: close.refused,
    };
  },
}));
const ctx = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/app/document/[id]/EditorContext', () => ({ useEditorContext: () => ctx.value }));
vi.mock('@/app/document/[id]/useSelectTab', () => ({ useSelectTab: () => vi.fn() }));

const { TextDocumentDrawingBar, leavesDrawing } = await import('./TextDocumentDrawingBar');

const text: Tab = { id: 'w', name: 'Notes', kind: 'text-document', elements: [] };
const drawing: Tab = { id: 'd1', name: 'Drawing 1', drawingOf: 'w', elements: [] };

function editor(active: Tab, edits = true) {
  ctx.value = {
    activeTab: active,
    tabs: [text, drawing],
    can: { textDocumentEdits: edits },
    isReadOnly: false,
    selfParticipant: { id: 'me' },
    documentId: 'D',
    imageContext: null,
    deleteTab: vi.fn(),
  };
}

beforeEach(() => {
  close.saveAndClose.mockReset();
  close.refused = null;
});

describe('TextDocumentDrawingBar', () => {
  it('names the text document, with Save and close for an Editor', () => {
    editor(drawing);
    render(<TextDocumentDrawingBar />);
    const bar = screen.getByRole('region', { name: 'Drawing' });
    expect(bar.textContent).toContain('Drawing in Notes');
    fireEvent.click(screen.getByRole('button', { name: 'Save and close' }));
    expect(close.saveAndClose).toHaveBeenCalledTimes(1);
  });

  it('offers Close to anyone who cannot edit', () => {
    editor(drawing, false);
    render(<TextDocumentDrawingBar />);
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(close.args).toMatchObject({ canEdit: false });
  });

  it('saves and closes on Shift+Escape and ⌘Escape, not on Escape alone', () => {
    editor(drawing);
    render(<TextDocumentDrawingBar />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(close.saveAndClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape', shiftKey: true });
    fireEvent.keyDown(window, { key: 'Escape', metaKey: true });
    expect(close.saveAndClose).toHaveBeenCalledTimes(2);
    expect(leavesDrawing({ key: 'Enter', shiftKey: true, metaKey: false })).toBe(false);
  });

  it('says why a picture was not stored', () => {
    close.refused = 'Too big.';
    editor(drawing);
    render(<TextDocumentDrawingBar />);
    expect(screen.getByRole('alert').textContent).toBe('Too big.');
  });

  it('shows nothing over any other tab', () => {
    editor(text);
    const { container } = render(<TextDocumentDrawingBar />);
    expect(container.innerHTML).toBe('');
  });
});
