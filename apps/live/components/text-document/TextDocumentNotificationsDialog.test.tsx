// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoticeSettingDto } from '@livedoc/api-schema';
import {
  NOTICE_LOAD_FAILED,
  NOTICE_SAVE_FAILED,
  TextDocumentNotificationsDialog,
} from './TextDocumentNotificationsDialog';

// docs/specs/034-text-documents/review.md "Notifications" (The setting).

afterEach(() => vi.restoreAllMocks());

const FOR_YOU: NoticeSettingDto = { comments: 'for-you', edits: 'none' };

function open({
  kept = FOR_YOU,
  read = vi.fn(async () => kept),
  write = vi.fn(async () => undefined),
} = {}) {
  const onKeeping = vi.fn();
  const onClose = vi.fn();
  const { unmount } = render(
    <TextDocumentNotificationsDialog
      read={read}
      write={write}
      onKeeping={onKeeping}
      onClose={onClose}
    />,
  );
  return { read, write, onKeeping, onClose, unmount };
}

const radio = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name}$`) });
const ok = () => screen.getByRole('button', { name: /^OK$/ });

describe('Notification settings', () => {
  it('offers Google’s choices, drawn as the person keeps them', async () => {
    open({ kept: { comments: 'all', edits: 'added-or-removed' } });
    expect(screen.getByRole('dialog', { name: /^Notification settings$/ })).toBeTruthy();
    await act(async () => {});
    expect(screen.getByRole('group', { name: /^Comments$/ })).toBeTruthy();
    expect(screen.getByRole('group', { name: /^Edits$/ })).toBeTruthy();
    expect((radio('All comments') as HTMLInputElement).checked).toBe(true);
    expect((radio('Comments for you') as HTMLInputElement).checked).toBe(false);
    expect((radio('Added or removed content') as HTMLInputElement).checked).toBe(true);
    expect(screen.getAllByRole('radio', { name: /^None$/ })).toHaveLength(2);
  });

  it('waits for the setting before anything can be chosen', async () => {
    let answer: (s: NoticeSettingDto) => void = () => {};
    open({ read: vi.fn(() => new Promise<NoticeSettingDto>((r) => (answer = r))) });
    expect(radio('All comments').matches(':disabled')).toBe(true);
    expect((ok() as HTMLButtonElement).disabled).toBe(true);
    await act(async () => answer({ comments: 'none', edits: 'none' }));
    expect(radio('All comments').matches(':disabled')).toBe(false);
  });

  it('tells what is being kept, keeps it on OK, then closes', async () => {
    const { write, onKeeping, onClose } = open();
    await act(async () => {});
    fireEvent.click(radio('All comments'));
    fireEvent.click(radio('Added or removed content'));
    await act(async () => fireEvent.click(ok()));
    const chosen = { comments: 'all', edits: 'added-or-removed' };
    expect(write).toHaveBeenCalledWith(chosen);
    expect(onKeeping).toHaveBeenCalledWith(chosen);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps nothing on Cancel', async () => {
    const { write, onClose } = open();
    await act(async () => {});
    fireEvent.click(radio('All comments'));
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(write).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('says a setting it could not read, and offers nothing to keep', async () => {
    open({ read: vi.fn(async () => Promise.reject(new Error('down'))) });
    await act(async () => {});
    expect(screen.getByRole('alert').textContent).toBe(NOTICE_LOAD_FAILED);
    expect((ok() as HTMLButtonElement).disabled).toBe(true);
  });

  it('says a setting it could not keep, and stays', async () => {
    const { onKeeping, onClose } = open({
      write: vi.fn(async () => Promise.reject(new Error('x'))),
    });
    await act(async () => {});
    await act(async () => fireEvent.click(ok()));
    expect(screen.getByRole('alert').textContent).toBe(NOTICE_SAVE_FAILED);
    expect(onKeeping).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect((ok() as HTMLButtonElement).disabled).toBe(false);
  });

  it('ignores a reading that lands after it closed', async () => {
    let answer: (s: NoticeSettingDto) => void = () => {};
    const { read, unmount } = open({
      read: vi.fn(() => new Promise<NoticeSettingDto>((r) => (answer = r))),
    });
    unmount();
    await act(async () => answer({ comments: 'all', edits: 'none' }));
    expect(read).toHaveBeenCalledTimes(1);
  });
});
