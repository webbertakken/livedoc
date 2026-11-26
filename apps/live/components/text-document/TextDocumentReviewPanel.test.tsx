// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Reviewing suggestions": the Suggested edits panel: a non-modal dialog with
// the count (each tab's in a document of tabs), Previous and Next, the Preview choice and its note, and Accept all and
// Reject all as the person may; Escape closes it.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextDocumentReviewPanel } from './TextDocumentReviewPanel';

afterEach(cleanup);

function panel(overrides: Partial<Parameters<typeof TextDocumentReviewPanel>[0]> = {}) {
  const props = {
    count: { total: 3, tabs: [{ id: 't.0', name: 'Tab 1', count: 3 }] },
    offers: { accept: true, reject: 'all' as const },
    mode: 'show' as const,
    onMode: vi.fn(),
    onStep: vi.fn(),
    onAcceptAll: vi.fn(),
    onRejectAll: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<TextDocumentReviewPanel {...props} />);
  return props;
}

describe('TextDocumentReviewPanel', () => {
  it('is a non-modal dialog with the count, the arrows and an Editor’s Accept all and Reject all', () => {
    const props = panel();
    const dialog = screen.getByRole('dialog', { name: 'Suggested edits' });
    expect(dialog.getAttribute('aria-modal')).toBe('false');
    expect(screen.getByText('3 suggested edits')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next suggested edit' }));
    expect(props.onStep).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Accept all' }));
    expect(props.onAcceptAll).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Reject all$/ }));
    expect(props.onRejectAll).toHaveBeenCalled();
  });

  it('lists each tab’s count only in a document of more than one tab', () => {
    panel({
      count: {
        total: 3,
        tabs: [
          { id: 't.0', name: 'Tab 1', count: 2 },
          { id: 't.1', name: 'Notes', count: 1 },
        ],
      },
    });
    expect(screen.getByText('Notes: 1')).toBeTruthy();
    cleanup();
    panel();
    expect(screen.queryByText('Tab 1: 3')).toBeNull();
  });

  it('gives a Participant Reject all mine, and a Viewer neither', () => {
    panel({ offers: { accept: false, reject: 'mine' } });
    expect(screen.getByRole('button', { name: 'Reject all mine' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Accept all' })).toBeNull();
    cleanup();
    panel({ offers: { accept: false, reject: null } });
    expect(screen.queryByRole('button', { name: /Reject all/ })).toBeNull();
  });

  it('chooses a preview, saying why the document is read only, the arrows waiting', () => {
    const props = panel({ mode: 'accept-all' });
    expect(screen.getByText(/can’t be edited until you choose Show suggested edits/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Next suggested edit' }).hasAttribute('disabled'),
    ).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: 'Preview' }), {
      target: { value: 'show' },
    });
    expect(props.onMode).toHaveBeenCalledWith('show');
  });

  it('disables what has nothing to act on, and closes with Escape or Close', () => {
    const props = panel({ count: { total: 0, tabs: [] } });
    expect(screen.getByText('No suggested edits')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept all' }).hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });
});
