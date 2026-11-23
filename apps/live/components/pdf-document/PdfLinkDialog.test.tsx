// @vitest-environment jsdom
// docs/specs/035-pdf-documents/reading-surface.md "Following a link": an address asked about first and opened in a new
// tab with no opener; one not opened, a path and an action said, never followed; each the shell's dialog, "Link".
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { debugLog } from '@/lib/debug-log';
import { PdfLinkDialog, type PdfLinkAsked } from './PdfLinkDialog';

vi.mock('@/lib/debug-log', () => ({ debugLog: vi.fn() }));

function show(asked: PdfLinkAsked | null) {
  const onClose = vi.fn();
  render(<PdfLinkDialog asked={asked} onClose={onClose} />);
  return onClose;
}

afterEach(() => vi.restoreAllMocks());

describe('the link dialog', () => {
  it('asks before an address, shown as text, and opens it in a new tab with no opener', () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    const onClose = show({ kind: 'ask', address: 'https://example.com/a?b=1' });
    expect(screen.getByRole('dialog', { name: 'Link' })).toBeTruthy();
    expect(screen.getByText('Open this address?')).toBeTruthy();
    expect(screen.getByText('https://example.com/a?b=1').tagName).toBe('P');
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(opened).toHaveBeenCalledWith(
      'https://example.com/a?b=1',
      '_blank',
      'noopener,noreferrer',
    );
    expect(debugLog).toHaveBeenCalledWith('[pdf] link-opened scheme=https');
    expect(onClose).toHaveBeenCalled();
  });

  it('says an address cannot be opened, and copies it', () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    show({ kind: 'refused', address: 'javascript:alert(1)' });
    expect(screen.getByText('This link can’t be opened here.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    expect(writeText).toHaveBeenCalledWith('javascript:alert(1)');
  });

  it('logs a copy the browser refuses', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    show({ kind: 'file', path: '../other.pdf' });
    expect(
      screen.getByText('This link leads to another file, which LiveDoc can’t open.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy path' }));
    await vi.waitFor(() =>
      expect(debugLog).toHaveBeenCalledWith('[pdf] link-copy-failed', 'Error: denied'),
    );
  });

  it('says an action is never done, with nothing to press but Close', () => {
    show({ kind: 'action' });
    expect(screen.getByText('This link asks for something LiveDoc never does.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('shows nothing while no link is pressed', () => {
    show(null);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
