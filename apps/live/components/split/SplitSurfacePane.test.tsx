// @vitest-environment jsdom
// docs/specs/006-document/kinds-outside-the-canvas.md "Side by side": the other pane holds a text document's surface,
// live and read-only; a surface without a read-only view shows its tab's name; a press moves the editor across.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tab } from '@livedoc/document';

const context = vi.hoisted(() => ({ documentWorkbook: null as unknown }));
vi.mock('@/app/document/[id]/EditorContext', () => ({ useEditorContext: () => context }));
vi.mock('@/components/text-document/TextDocumentHost', () => ({
  TextDocumentHost: ({ tab, readOnly }: { tab: Tab; readOnly?: boolean }) => (
    <div data-testid="text-document" data-tab={tab.id} data-read-only={String(readOnly)} />
  ),
}));

const { SplitSurfacePane } = await import('./SplitSurfacePane');

afterEach(() => {
  cleanup();
  context.documentWorkbook = null;
});

const textTab = { id: 't', name: 'Notes', kind: 'text-document', elements: [] } as Tab;

describe('SplitSurfacePane', () => {
  it('shows a text document’s surface, read-only', () => {
    render(<SplitSurfacePane tab={textTab} onFocus={vi.fn()} />);
    const surface = screen.getByTestId('text-document');
    expect(surface.dataset.tab).toBe('t');
    expect(surface.dataset.readOnly).toBe('true');
    expect(
      screen.getByRole('region', { name: 'Notes, side by side. Click to edit.' }),
    ).toBeTruthy();
  });

  it('shows a spreadsheet’s sheet by its name until its surface has a read-only view', () => {
    context.documentWorkbook = { id: 'w' };
    const sheet = { id: 's', name: 'Budget', kind: 'sheet', elements: [] } as unknown as Tab;
    render(<SplitSurfacePane tab={sheet} onFocus={vi.fn()} />);
    expect(screen.getByText('Budget')).toBeTruthy();
    expect(screen.getByText('Click to edit.')).toBeTruthy();
  });

  it('moves the editor across on a press', () => {
    const onFocus = vi.fn();
    render(<SplitSurfacePane tab={textTab} onFocus={onFocus} />);
    fireEvent.pointerDown(screen.getByTestId('text-document'));
    expect(onFocus).toHaveBeenCalledWith('Click');
  });
});
