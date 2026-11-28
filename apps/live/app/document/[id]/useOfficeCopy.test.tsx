// @vitest-environment jsdom

// docs/specs/034-text-documents/files-and-print.md "Make a copy": the Copy document dialog opened, its folder, the
// copy opened in a new browser tab, and a refusal said in the dialog.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CopyOutcome, CopyRequest } from '@/lib/office/office-copy';

const copyMock = vi.fn<(request: CopyRequest) => Promise<CopyOutcome>>();
vi.mock('@/lib/office/office-copy', async (actual) => ({
  ...(await actual<typeof import('@/lib/office/office-copy')>()),
  copyOpenDocument: (request: CopyRequest) => copyMock(request),
}));
const trackMock = vi.fn<typeof import('@/lib/telemetry').track>();
vi.mock('@/lib/telemetry', () => ({
  track: (...a: Parameters<typeof trackMock>) => trackMock(...a),
}));

const toastError = vi.fn<(message: string) => void>();
vi.mock('@/hooks/ui/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: toastError }),
}));

// The dialog loads on demand; here it is there at once.
vi.mock('next/dynamic', () => ({
  default: (load: () => Promise<unknown>) => {
    let Loaded: React.ComponentType<Record<string, unknown>> | null = null;
    void load().then((c) => (Loaded = c as never));
    return (props: Record<string, unknown>) => (Loaded ? <Loaded {...props} /> : null);
  },
}));

const { useOfficeCopy } = await import('./useOfficeCopy');
await import('@/components/office/OfficeCopyDialog');
await new Promise((resolve) => setTimeout(resolve, 0));
type Source = Parameters<typeof useOfficeCopy>[0];

const folder = (id: string, name: string) => ({
  id,
  name,
  parentId: null,
  ownerId: 'me',
  teamId: null,
  createdAt: 0,
  updatedAt: 0,
});
const folders = [folder('f1', 'Reports'), folder('f2', 'Letters')];

const SOURCE: Source = {
  documentId: 'd1',
  documentName: 'Plan',
  ownerId: 'me',
  shareCode: null,
  local: false,
  isOwner: true,
  teamId: null,
  folderId: 'f1',
  folders,
  viewer: false,
};

function Host(source: Source) {
  const copier = useOfficeCopy(source);
  return (
    <>
      <button type="button" onClick={copier.open}>
        Open
      </button>
      {copier.dialog}
    </>
  );
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

function openDialog(over: Partial<Source> = {}) {
  render(<Host {...SOURCE} {...over} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open' }));
  return screen.getByRole('dialog', { name: 'Copy document' });
}

const tab = { opener: {} as unknown, close: vi.fn<() => void>(), location: { href: '' } };

beforeEach(() => {
  copyMock.mockReset();
  trackMock.mockReset();
  toastError.mockReset();
  tab.close.mockReset();
  tab.location.href = '';
  tab.opener = {};
  vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(cleanup);

describe('useOfficeCopy', () => {
  it('starts in the source’s folder for its owner, and in My Documents for anyone else', () => {
    expect(openDialog().querySelector('[data-office-copy-folder]')!.textContent).toContain(
      'Reports',
    );
    cleanup();
    expect(
      openDialog({ isOwner: false }).querySelector('[data-office-copy-folder]')!.textContent,
    ).toContain('My Documents');
  });

  it('makes the copy as chosen, opens it in a new browser tab, counts it and closes', async () => {
    copyMock.mockResolvedValue({ ok: true, id: 'd2', shared: null });
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    await flush();
    expect(window.open).toHaveBeenCalledWith('', '_blank');
    expect(tab.opener).toBeNull();
    expect(copyMock).toHaveBeenCalledExactlyOnceWith({
      ownerId: 'me',
      documentId: 'd1',
      shareCode: null,
      local: false,
      name: 'Copy of Plan',
      folderId: 'f1',
      review: { comments: false, resolved: false },
      share: false,
    });
    expect(tab.location.href).toBe(`${window.location.origin}/document/d2`);
    expect(trackMock).toHaveBeenCalledExactlyOnceWith('Document', 'Duplicated', 'TextDocument');
    expect(screen.queryByRole('dialog', { name: 'Copy document' })).toBeNull();
  });

  it('says a refusal in the dialog, closes the new tab and lets the person try again', async () => {
    copyMock.mockResolvedValueOnce({ ok: false, reason: 'failed' });
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    await flush();
    expect(tab.close).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert').textContent).toBe('The copy couldn’t be made. Try again.');
    expect(console.warn).toHaveBeenCalledWith('[text-document] copy refused name=failed');
    expect(trackMock).not.toHaveBeenCalled();
    copyMock.mockResolvedValueOnce({ ok: false, reason: 'usage_exceeded' });
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    await flush();
    expect(screen.getByRole('alert').textContent).toBe(
      "This document doesn't fit in the file storage that is left.",
    );
  });

  it('changes the folder through the folder picker and comes back to the dialog', async () => {
    copyMock.mockResolvedValue({ ok: true, id: 'd2', shared: null });
    openDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Change folder, now Reports' }));
    expect(screen.queryByRole('dialog', { name: 'Copy document' })).toBeNull();
    const picker = screen.getByRole('dialog', { name: 'Copy to folder' });
    expect(picker.textContent).toContain('Copy “Plan”');
    fireEvent.click(screen.getByText('Letters'));
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }));
    const dialog = screen.getByRole('dialog', { name: 'Copy document' });
    expect(dialog.querySelector('[data-office-copy-folder]')!.textContent).toContain('Letters');
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    await flush();
    expect(copyMock.mock.calls[0]![0].folderId).toBe('f2');
  });

  it('copies a document in This Browser there, with no folder, and offers a Viewer no review', async () => {
    copyMock.mockResolvedValue({ ok: true, id: 'd3', shared: null });
    const dialog = openDialog({ local: true, viewer: true });
    expect(dialog.querySelector('[data-office-copy-folder]')).toBeNull();
    expect(dialog.querySelector('[data-office-copy-comments]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    await flush();
    expect(copyMock.mock.calls[0]![0]).toMatchObject({
      local: true,
      folderId: null,
      review: null,
      share: false,
    });
  });

  // Share it with the same people (files-and-print.md "Make a copy"): the owner of a stored document's alone.
  it('offers the owner Share it with the same people, and asks for it when ticked', async () => {
    copyMock.mockResolvedValue({ ok: true, id: 'd2', shared: true });
    const dialog = openDialog();
    fireEvent.click(dialog.querySelector('[data-office-copy-share]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    await flush();
    expect(copyMock.mock.calls[0]![0].share).toBe(true);
    expect(toastError).not.toHaveBeenCalled();
  });

  it.each([
    ['an Editor', { isOwner: false }],
    ['a Participant', { isOwner: false }],
    ['a Viewer', { isOwner: false, viewer: true }],
    ['the owner in This Browser', { local: true }],
  ])('offers %s no Share it with the same people', async (_who, over: Partial<Source>) => {
    copyMock.mockResolvedValue({ ok: true, id: 'd2', shared: null });
    const dialog = openDialog(over);
    expect(dialog.querySelector('[data-office-copy-share]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    await flush();
    expect(copyMock.mock.calls[0]![0].share).toBe(false);
  });

  it('says a copy made but left private, as it opens', async () => {
    copyMock.mockResolvedValue({ ok: true, id: 'd2', shared: false });
    const dialog = openDialog();
    fireEvent.click(dialog.querySelector('[data-office-copy-share]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Make a copy' }));
    await flush();
    expect(tab.location.href).toBe(`${window.location.origin}/document/d2`);
    expect(toastError).toHaveBeenCalledExactlyOnceWith(
      'The copy was made but isn’t shared. Share it from the copy.',
    );
    expect(console.warn).toHaveBeenCalledWith('[text-document] copy not shared');
  });
});
