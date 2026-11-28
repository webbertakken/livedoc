// docs/specs/034-text-documents/files-and-print.md "Make a copy": Share it with the same people, the owner's alone.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestRouteContext } from './test-route-context';

const db = vi.hoisted(() => ({
  getDocument: vi.fn(),
  copyDocument: vi.fn(),
  shareCopyLikeSource: vi.fn(),
  listSharedWith: vi.fn(async () => []),
  getFolder: vi.fn(),
  getParticipant: vi.fn(),
  CopyUsageExceeded: class extends Error {},
}));
const resolveDocumentGrant = vi.hoisted(() => vi.fn());
vi.mock('../db', () => db);
vi.mock('../auth/document-access', () => ({
  resolveDocumentGrant,
  canReadDocument: vi.fn(),
  canEditDocument: vi.fn(),
}));
vi.mock('../timeline', () => ({
  recordDocumentDuplicated: vi.fn(async () => undefined),
  recordVisitorCopied: vi.fn(async () => undefined),
}));

import { handleDocumentCopy } from './document-copy-route';

const SOURCE = { id: 'd1', ownerId: 'owner-1', teamId: null, name: 'Doc', tabs: [{ id: 't1' }] };
const COPY = { id: 'd2', tabs: [{ id: 'c1' }] };

const copy = (owner: string, body: unknown) =>
  handleDocumentCopy(makeTestRouteContext('POST', '/api/documents/d1/copy', { owner, body }));

beforeEach(() => {
  vi.clearAllMocks();
  db.getDocument.mockResolvedValue(SOURCE);
  db.copyDocument.mockResolvedValue(COPY);
  db.shareCopyLikeSource.mockResolvedValue({
    links: 1,
    linksSkipped: 0,
    people: 1,
    peopleSkipped: 0,
  });
});

describe('Share it with the same people', () => {
  it('shares the owner’s copy as the source, tab for tab', async () => {
    resolveDocumentGrant.mockResolvedValue({ role: 'edit', tabScope: null });
    const res = await copy('owner-1', { share: true });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ document: COPY, shared: true });
    expect(db.shareCopyLikeSource).toHaveBeenCalledWith(expect.anything(), {
      sourceId: 'd1',
      copyId: 'd2',
      copier: 'owner-1',
      sourceTabIds: ['t1'],
      copyTabIds: ['c1'],
    });
  });

  it('shares nothing unless asked: off is the default', async () => {
    resolveDocumentGrant.mockResolvedValue({ role: 'edit', tabScope: null });
    const res = await copy('owner-1', { share: false });
    expect(await res.json()).toEqual({ document: COPY });
    await copy('owner-1', {});
    expect(db.shareCopyLikeSource).not.toHaveBeenCalled();
  });

  it.each(['edit', 'participate', 'view'])(
    'refuses it to a %s, who makes no copy',
    async (role) => {
      resolveDocumentGrant.mockResolvedValue({ role, tabScope: null });
      const res = await copy('visitor-1', { share: true });
      expect(res.status).toBe(403);
      expect(db.copyDocument).not.toHaveBeenCalled();
      expect(db.shareCopyLikeSource).not.toHaveBeenCalled();
    },
  );

  it('refuses a share of the wrong type', async () => {
    resolveDocumentGrant.mockResolvedValue({ role: 'edit', tabScope: null });
    const res = await copy('owner-1', { share: 'yes' });
    expect(res.status).toBe(400);
  });

  it('keeps the copy, private, when sharing fails, and says so', async () => {
    resolveDocumentGrant.mockResolvedValue({ role: 'edit', tabScope: null });
    db.shareCopyLikeSource.mockRejectedValue(new Error('D1 down'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await copy('owner-1', { share: true });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ document: COPY, shared: false });
    expect(error).toHaveBeenCalledWith('[documents] copy share failed', expect.anything());
    error.mockRestore();
  });
});
