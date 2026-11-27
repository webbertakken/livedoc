// @vitest-environment jsdom

// A text document email's settings link (docs/specs/034-text-documents/review.md "Notifications", In every email):
// opening it only reads; each choice is kept at once, for that person and document alone.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOTICE_LINK_SAVE_FAILED, NoticeLinkSettings } from './NoticeLinkSettings';

const track = vi.hoisted(() => vi.fn());
vi.mock('@/lib/telemetry', () => ({ track }));
const read = vi.hoisted(() => vi.fn());
const write = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/notification-settings', () => ({
  apiReadNoticeLink: read,
  apiWriteNoticeLink: write,
}));

const kept = { documentName: 'Plan', setting: { comments: 'for-you', edits: 'none' } };

async function open(search: string) {
  window.history.replaceState(null, '', `/notification-settings${search}`);
  render(<NoticeLinkSettings />);
  await act(async () => {});
}

const radio = (name: string) =>
  screen.getByRole<HTMLInputElement>('radio', { name: new RegExp(`^${name}$`) });

afterEach(() => {
  cleanup();
  read.mockReset();
  write.mockReset();
  track.mockReset();
});

describe('NoticeLinkSettings', () => {
  it('reads the document’s setting, changing nothing on open', async () => {
    read.mockResolvedValue(kept);
    await open('?token=abc');
    expect(read).toHaveBeenCalledWith('abc');
    expect(write).not.toHaveBeenCalled();
    expect(screen.getByText('Plan')).toBeTruthy();
    expect(radio('Comments for you').checked).toBe(true);
  });

  it('keeps a choice as it is made, counted first, and says so', async () => {
    read.mockResolvedValue(kept);
    write.mockImplementation(async (_t: string, setting: unknown) => ({ ...kept, setting }));
    await open('?token=abc');
    await act(async () => fireEvent.click(radio('All comments')));
    expect(track).toHaveBeenCalledWith('Document', 'Changed', 'TextDocumentNoticesAllNone');
    expect(write).toHaveBeenCalledWith('abc', { comments: 'all', edits: 'none' });
    expect(radio('All comments').checked).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Saved');
  });

  it('puts a choice back when it could not be kept', async () => {
    read.mockResolvedValue(kept);
    write.mockRejectedValue(new Error('down'));
    await open('?token=abc');
    await act(async () => fireEvent.click(screen.getAllByRole('radio', { name: /^None$/ })[0]!));
    expect(screen.getByRole('alert').textContent).toBe(NOTICE_LINK_SAVE_FAILED);
    expect(radio('Comments for you').checked).toBe(true);
  });

  it('says a link that names nothing, with the way to turn every email off', async () => {
    read.mockResolvedValue(null);
    await open('?token=abc');
    expect(screen.getByText('This Link Isn’t Valid')).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Open Settings$/ }).getAttribute('href')).toBe(
      '/explorer?settings=notifications',
    );
  });

  it('says so without asking when there is no token, or the read fails, or a write finds nothing', async () => {
    await open('');
    expect(read).not.toHaveBeenCalled();
    expect(screen.getByText('This Link Isn’t Valid')).toBeTruthy();
    cleanup();
    read.mockRejectedValue(new Error('x'));
    await open('?token=abc');
    expect(screen.getByText('This Link Isn’t Valid')).toBeTruthy();
    cleanup();
    read.mockResolvedValue(kept);
    write.mockResolvedValue(null);
    await open('?token=abc');
    await act(async () => fireEvent.click(radio('All comments')));
    expect(screen.getByText('This Link Isn’t Valid')).toBeTruthy();
  });

  it('shows loading until the setting is read', async () => {
    read.mockReturnValue(new Promise(() => {}));
    await open('?token=abc');
    expect(screen.getByText('Loading your notification settings…')).toBeTruthy();
  });
});
