// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "Version history": naming a version (or the current one), removing a name,
// the 40 names refusal, Restore this version asked once then the mode closing, File > Version history > Name current
// version's dialog keeping a refusal in it, This Browser dimmed, and the telemetry.
import { useLayoutEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_VERSION } from '@/components/office/review/OfficeVersionHistory';
import { ApiError } from '@/lib/api/core';
import {
  NAME_CURRENT_VERSION,
  NAMED_VERSIONS_FULL,
  useTextDocumentVersionWrites,
  VERSION_FAILED,
} from './useTextDocumentVersionWrites';
import { RESTORE_VERSION_TEXT } from './TextDocumentVersionDialogs';
import { VERSION_COPY_FAILED } from '@/lib/text-document/text-document-version-copy';

const api = vi.hoisted(() => ({
  nameCurrent: vi.fn(),
  name: vi.fn(),
  restore: vi.fn(),
  read: vi.fn(),
  copy: vi.fn(),
}));
vi.mock('@/lib/api/text-document-versions', () => ({
  apiNameCurrentTextDocumentVersion: api.nameCurrent,
  apiNameTextDocumentVersion: api.name,
  apiRestoreTextDocumentVersion: api.restore,
  apiReadTextDocumentVersion: api.read,
}));
vi.mock('@/lib/text-document/text-document-version-copy', async (actual) => ({
  ...(await actual<typeof import('@/lib/text-document/text-document-version-copy')>()),
  makeVersionCopy: api.copy,
}));
const tracked = vi.hoisted(() => [] as string[][]);
vi.mock('@/lib/telemetry', () => ({ track: (...args: string[]) => tracked.push(args) }));

afterEach(cleanup);

const where = { ownerId: 'me', documentId: 'D', tabId: 't1', shareCode: null };
const ADA = { name: 'Ada', color: '#0284c7' };
const full = () => new ApiError('text document version name', 409, 'named_versions_full');

let hooks: ReturnType<typeof useTextDocumentVersionWrites>;
function Harness({
  local = null,
  state = new Uint8Array([1]),
  open = () => {},
  say,
  onNamed,
  onRestored,
}: {
  local?: { note: string; hint: string } | null;
  state?: Uint8Array | null;
  open?: (id: string) => void;
  say: (status: string | null) => void;
  onNamed: () => void;
  onRestored: () => void;
}) {
  const made = useTextDocumentVersionWrites({
    where,
    local,
    author: ADA,
    say,
    onNamed,
    onRestored,
    copying: { documentName: 'Plan', format: 'ooxml', state: () => state },
    open,
    now: () => new Date(2026, 10, 27, 9, 15).getTime(),
  });
  useLayoutEffect(() => {
    hooks = made;
  });
  return <>{made.dialogs}</>;
}

function setUp(
  local: { note: string; hint: string } | null = null,
  state: Uint8Array | null = new Uint8Array([1]),
) {
  const said: (string | null)[] = [];
  const onNamed = vi.fn();
  const onRestored = vi.fn();
  const open = vi.fn();
  render(
    <Harness
      local={local}
      state={state}
      open={open}
      say={(s) => said.push(s)}
      onNamed={onNamed}
      onRestored={onRestored}
    />,
  );
  return { said, onNamed, onRestored, open };
}

describe('useTextDocumentVersionWrites', () => {
  beforeEach(() => {
    tracked.splice(0);
    api.nameCurrent.mockReset().mockResolvedValue({});
    api.name.mockReset().mockResolvedValue({});
    api.restore.mockReset().mockResolvedValue({});
  });

  it('names the current version or one, removes a name, and reads the list again', async () => {
    const { onNamed } = setUp();
    act(() => hooks.writes.name(CURRENT_VERSION, 'Final'));
    await waitFor(() => expect(onNamed).toHaveBeenCalledTimes(1));
    expect(api.nameCurrent).toHaveBeenCalledWith(where, 'Final', ADA);
    act(() => hooks.writes.name('v1', ''));
    await waitFor(() => expect(onNamed).toHaveBeenCalledTimes(2));
    expect(api.name).toHaveBeenCalledWith(where, 'v1', '', ADA);
    expect(tracked).toEqual([['Document', 'Changed', 'TextDocumentVersionNamed']]);
    expect(hooks.writes.nameMax).toBe(100);
  });

  it('says why a name was refused: forty names, or anything else', async () => {
    const { said, onNamed } = setUp();
    api.name.mockRejectedValueOnce(full());
    act(() => hooks.writes.name('v1', 'One more'));
    await waitFor(() => expect(said.at(-1)).toBe(NAMED_VERSIONS_FULL));
    api.name.mockRejectedValueOnce(new Error('offline'));
    act(() => hooks.writes.name('v1', 'One more'));
    await waitFor(() => expect(said.at(-1)).toBe(VERSION_FAILED));
    expect(onNamed).not.toHaveBeenCalled();
  });

  it('asks before restoring, then restores and closes the mode', async () => {
    const { onRestored } = setUp();
    act(() => hooks.writes.restore('v1'));
    expect(screen.getByRole('dialog', { name: 'Restore this version?' })).toBeTruthy();
    expect(screen.getByText(RESTORE_VERSION_TEXT)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.restore).not.toHaveBeenCalled();
    act(() => hooks.writes.restore('v1'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(onRestored).toHaveBeenCalled());
    expect(api.restore).toHaveBeenCalledWith(where, 'v1', ADA);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(tracked).toEqual([['Document', 'Changed', 'TextDocumentVersionRestored']]);
  });

  it('says a failed restore in the panel, the mode staying', async () => {
    const { said, onRestored } = setUp();
    api.restore.mockRejectedValueOnce(new Error('503'));
    act(() => hooks.writes.restore('v1'));
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(said.at(-1)).toBe(VERSION_FAILED));
    expect(onRestored).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('names the current version from File, waiting for a name and keeping a refusal in the dialog', async () => {
    setUp();
    act(() => hooks.actions[NAME_CURRENT_VERSION]!.run());
    const dialog = screen.getByRole('dialog', { name: 'Name current version' });
    const field = screen.getByRole('textbox', { name: 'Version name' });
    expect(field.getAttribute('placeholder')).toBe('09:15');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);
    api.nameCurrent.mockRejectedValueOnce(full());
    fireEvent.change(field, { target: { value: 'Sent to Ben' } });
    fireEvent.click(save);
    expect((await screen.findByRole('alert')).textContent).toBe(NAMED_VERSIONS_FULL);
    expect(dialog.isConnected).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.nameCurrent).toHaveBeenLastCalledWith(where, 'Sent to Ben', ADA);
    act(() => hooks.actions[NAME_CURRENT_VERSION]!.run());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is dimmed in This Browser, saying why', () => {
    setUp({ note: 'LiveDoc only', hint: 'Kept in LiveDoc.' });
    const action = hooks.actions[NAME_CURRENT_VERSION]!;
    expect(action).toMatchObject({
      disabled: true,
      note: 'LiveDoc only',
      hint: 'Kept in LiveDoc.',
    });
    action.run();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('makes a copy of a version under the name given, opening it in a new tab', async () => {
    api.read.mockReset().mockResolvedValue({ snapshot: 'c25hcA==' });
    api.copy.mockReset().mockResolvedValue('NEW');
    const { open } = setUp();
    act(() => hooks.writes.copy('v1'));
    const field = screen.getByRole('textbox', { name: 'Name' });
    expect((field as HTMLInputElement).value).toBe('Copy of Plan');
    fireEvent.change(field, { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Make a copy' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(field, { target: { value: 'Old plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('NEW'));
    expect(api.read).toHaveBeenCalledWith(where, 'v1');
    expect(api.copy).toHaveBeenCalledWith({
      ownerId: 'me',
      documentId: 'D',
      format: 'ooxml',
      state: new Uint8Array([1]),
      snapshot: 'c25hcA==',
      name: 'Old plan',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says a copy that could not be made in its dialog, which stays', async () => {
    api.read.mockReset().mockRejectedValueOnce(new Error('404'));
    api.copy.mockReset().mockResolvedValue(null);
    const { open } = setUp();
    act(() => hooks.writes.copy('v1'));
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    expect((await screen.findByRole('alert')).textContent).toBe(VERSION_COPY_FAILED);
    api.read.mockResolvedValue({ snapshot: 'x' });
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    await waitFor(() => expect(api.copy).toHaveBeenCalled());
    expect(screen.getByRole('alert').textContent).toBe(VERSION_COPY_FAILED);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    cleanup();
    setUp(null, null);
    act(() => hooks.writes.copy('v1'));
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    expect((await screen.findByRole('alert')).textContent).toBe(VERSION_COPY_FAILED);
    expect(open).not.toHaveBeenCalled();
  });
});
