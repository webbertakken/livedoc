// docs/specs/035-pdf-documents/custom-stamps.md "Managing them", "Telemetry and observability".
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlobKey } from '@livedoc/document';
import type { CustomStampRecord } from '@livedoc/pdf-documents';
import { ApiError } from '@/lib/api/core';

const api = vi.hoisted(() => ({
  apiListCustomStamps: vi.fn(),
  apiReadCustomStampPicture: vi.fn(),
  apiCreateCustomStamp: vi.fn(),
  apiUpdateCustomStamp: vi.fn(),
  apiDeleteCustomStamp: vi.fn(),
  apiRenameCustomStampCategory: vi.fn(),
  apiDeleteCustomStampCategory: vi.fn(),
}));
vi.mock('@/lib/api/custom-stamps', () => api);
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));
vi.mock('@/lib/offline/offline-blobs', () => ({ thisBrowserBlobs: () => ({}) }));

const { track } = await import('@/lib/telemetry');
const { customStampsOf, replaceCustomStamps, resetCustomStamps } = await import('./custom-stamps');
const manage = await import('./manage-custom-stamps');

const stamp = (id: string, category: string, name = id): CustomStampRecord => ({
  id,
  name,
  category,
  picture: { key: 'cd'.repeat(32) as BlobKey, type: 'png', width: 8, height: 4 },
  natural: { width: 6, height: 3 },
  createdAt: 1,
  updatedAt: 1,
});
const PAID = stamp('paid', 'Accounts', 'Paid');
const DUE = stamp('due', 'Accounts', 'Due');
const VOID = stamp('void', 'Bills', 'Void');
const ids = () => customStampsOf('ada').stamps.map((s) => `${s.id}:${s.name}:${s.category}`);

beforeEach(() => {
  vi.clearAllMocks();
  resetCustomStamps();
  replaceCustomStamps('ada', [PAID, DUE, VOID]);
  api.apiListCustomStamps.mockResolvedValue([PAID, DUE, VOID]);
});

describe('renaming and moving a stamp', () => {
  it('keeps a name trimmed and held, in its place', async () => {
    api.apiUpdateCustomStamp.mockResolvedValue({ ...PAID, name: 'Settled' });
    expect(await manage.renameCustomStamp('ada', PAID, '  Settled ')).toEqual({ ok: true });
    expect(api.apiUpdateCustomStamp).toHaveBeenCalledWith('ada', 'paid', { name: 'Settled' });
    expect(ids()[0]).toBe('paid:Settled:Accounts');
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'CustomStamp.Renamed');
  });

  it('sends nothing for an empty or unchanged name', async () => {
    await manage.renameCustomStamp('ada', PAID, '   ');
    await manage.renameCustomStamp('ada', PAID, 'Paid');
    expect(api.apiUpdateCustomStamp).not.toHaveBeenCalled();
  });

  it('moves one to another category', async () => {
    api.apiUpdateCustomStamp.mockResolvedValue({ ...PAID, category: 'Bills' });
    await manage.moveCustomStamp('ada', PAID, 'Bills');
    expect(api.apiUpdateCustomStamp).toHaveBeenCalledWith('ada', 'paid', { category: 'Bills' });
    expect(ids()[0]).toBe('paid:Paid:Bills');
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'CustomStamp.Moved');
  });
});

describe('deleting', () => {
  it('deletes a stamp, gone from their stamps', async () => {
    api.apiDeleteCustomStamp.mockResolvedValue(undefined);
    await manage.deleteCustomStamp('ada', DUE);
    expect(ids()).toEqual(['paid:Paid:Accounts', 'void:Void:Bills']);
    expect(track).toHaveBeenCalledWith('Pdf', 'Deleted', 'CustomStamp.Stamp');
  });

  it('deletes a category with its stamps, their stamps as LiveDoc answers', async () => {
    api.apiDeleteCustomStampCategory.mockResolvedValue([VOID]);
    await manage.deleteCustomStampCategory('ada', 'Accounts', 2);
    expect(api.apiDeleteCustomStampCategory).toHaveBeenCalledWith('ada', 'Accounts');
    expect(ids()).toEqual(['void:Void:Bills']);
    expect(track).toHaveBeenCalledWith('Pdf', 'Deleted', 'CustomStamp.Category');
  });
});

describe('a category renamed', () => {
  it('takes their stamps as LiveDoc answers', async () => {
    api.apiRenameCustomStampCategory.mockResolvedValue([
      { ...PAID, category: 'Bills' },
      { ...DUE, category: 'Bills' },
      VOID,
    ]);
    await manage.renameCustomStampCategory('ada', 'Accounts', 'Bills ');
    expect(api.apiRenameCustomStampCategory).toHaveBeenCalledWith('ada', 'Accounts', 'Bills');
    expect(new Set(customStampsOf('ada').stamps.map((s) => s.category))).toEqual(
      new Set(['Bills']),
    );
    expect(track).toHaveBeenCalledWith('Pdf', 'Changed', 'CustomStamp.CategoryRenamed');
  });
});

describe('a change that fails', () => {
  it('is said, and their stamps read again', async () => {
    api.apiDeleteCustomStamp.mockRejectedValue(
      new ApiError('delete', 404, 'custom_stamp_not_found'),
    );
    expect(await manage.deleteCustomStamp('ada', DUE)).toEqual({
      ok: false,
      problem: manage.MANAGE_STAMPS_COPY.failed,
    });
    await vi.waitFor(() => expect(api.apiListCustomStamps).toHaveBeenCalledWith('ada'));
    expect(track).not.toHaveBeenCalled();
  });
});
