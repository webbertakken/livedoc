import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/core';

const copyMock = vi.fn<typeof import('@/lib/api-client').apiCopyDocument>();
vi.mock('@/lib/api-client', () => ({
  apiCopyDocument: (...a: Parameters<typeof copyMock>) => copyMock(...a),
}));
const duplicateMock = vi.fn<typeof import('@/lib/duplicate-document').duplicateDocument>();
vi.mock('@/lib/duplicate-document', () => ({
  duplicateDocument: (...a: Parameters<typeof duplicateMock>) => duplicateMock(...a),
}));

const { copyOpenDocument, defaultCopyFolder } = await import('./office-copy');

const folders = [{ id: 'f1', name: 'Reports' }];

// docs/specs/034-text-documents/files-and-print.md "Make a copy": the source's folder for its owner, else My Documents.
describe('defaultCopyFolder', () => {
  it('starts in the source’s folder for its owner', () => {
    expect(defaultCopyFolder({ isOwner: true, teamId: null, folderId: 'f1', folders })).toBe('f1');
  });

  it('starts in My Documents for anyone else, a team’s document, or a folder that is not theirs', () => {
    expect(defaultCopyFolder({ isOwner: false, teamId: null, folderId: 'f1', folders })).toBeNull();
    expect(defaultCopyFolder({ isOwner: true, teamId: 't1', folderId: 'f1', folders })).toBeNull();
    expect(
      defaultCopyFolder({ isOwner: true, teamId: null, folderId: 'gone', folders }),
    ).toBeNull();
    expect(defaultCopyFolder({ isOwner: true, teamId: null, folderId: null, folders })).toBeNull();
  });
});

describe('copyOpenDocument', () => {
  const request = {
    ownerId: 'me',
    documentId: 'd1',
    shareCode: 'code',
    local: false,
    name: '  Copy of Plan ',
    folderId: 'f1',
    review: { comments: true, resolved: false },
    share: false,
  };
  const made = (shared: boolean | null = null) =>
    ({ document: { id: 'd2' }, shared }) as Awaited<ReturnType<typeof copyMock>>;

  beforeEach(() => {
    copyMock.mockReset();
    duplicateMock.mockReset();
  });

  it('asks the api for the copy with the name, folder and review chosen', async () => {
    copyMock.mockResolvedValue(made());
    expect(await copyOpenDocument(request)).toEqual({ ok: true, id: 'd2', shared: null });
    expect(copyMock).toHaveBeenCalledExactlyOnceWith('me', 'd1', {
      name: 'Copy of Plan',
      shareCode: 'code',
      folderId: 'f1',
      comments: true,
      resolved: false,
    });
  });

  it('leaves the name and the review to the api when none is given', async () => {
    copyMock.mockResolvedValue(made());
    await copyOpenDocument({ ...request, name: ' ', review: null, folderId: null });
    expect(copyMock).toHaveBeenCalledExactlyOnceWith('me', 'd1', {
      name: undefined,
      shareCode: 'code',
      folderId: null,
    });
  });

  // Share it with the same people: asked only when chosen, and a copy left private said apart.
  it('asks the api to share the copy with the same people only when chosen', async () => {
    copyMock.mockResolvedValue(made(false));
    expect(await copyOpenDocument({ ...request, share: true })).toEqual({
      ok: true,
      id: 'd2',
      shared: false,
    });
    expect(copyMock.mock.calls[0]?.[2]).toMatchObject({ share: true });
  });

  it('says a copy that does not fit apart from any other refusal', async () => {
    copyMock.mockRejectedValueOnce(new ApiError('copy', 403, 'usage_exceeded'));
    expect(await copyOpenDocument(request)).toEqual({ ok: false, reason: 'usage_exceeded' });
    copyMock.mockRejectedValueOnce(new Error('offline'));
    expect(await copyOpenDocument(request)).toEqual({ ok: false, reason: 'failed' });
  });

  it('copies a document in This Browser there, with the name and review chosen', async () => {
    duplicateMock.mockResolvedValueOnce('d3');
    expect(await copyOpenDocument({ ...request, local: true })).toEqual({
      ok: true,
      id: 'd3',
      shared: null,
    });
    expect(duplicateMock).toHaveBeenCalledExactlyOnceWith('me', 'd1', undefined, {
      name: 'Copy of Plan',
      review: { comments: true, resolved: false },
    });
    expect(copyMock).not.toHaveBeenCalled();
    duplicateMock.mockResolvedValueOnce(undefined);
    expect(await copyOpenDocument({ ...request, local: true })).toEqual({
      ok: false,
      reason: 'failed',
    });
  });
});
