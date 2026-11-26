// docs/specs/035-pdf-documents/custom-stamps.md "Making one", "Errors", "Where they are kept".
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomStampRecord } from '@livedoc/pdf-documents';
import { ApiError } from '@/lib/api/core';
import type { KeptPicture } from './custom-stamp-picture';

const api = vi.hoisted(() => ({
  apiCreateCustomStamp: vi.fn(),
  apiListCustomStamps: vi.fn(),
  apiReadCustomStampPicture: vi.fn(),
}));
const sent = vi.hoisted(() => ({ sendBlob: vi.fn() }));
const kept = vi.hoisted(() => ({
  readKept: vi.fn(),
  keepRead: vi.fn(),
}));
vi.mock('@/lib/api/custom-stamps', () => api);
vi.mock('@/lib/blob-store/send-blob', () => sent);
vi.mock('@/lib/offline/offline-blobs', () => ({ thisBrowserBlobs: () => kept }));
vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }));

const { makeCustomStamp, CUSTOM_STAMP_COPY } = await import('./make-custom-stamp');
const {
  customStampPicture,
  customStampSections,
  customStampsOf,
  loadCustomStamps,
  resetCustomStamps,
} = await import('./custom-stamps');
const { track } = await import('@/lib/telemetry');

const ID = 'custom-0b7c3c2e-5a8f-4f21-9a43-1f2d3e4c5b6a';
const picture: KeptPicture = {
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  type: 'png',
  width: 400,
  height: 200,
  natural: { width: 300, height: 150 },
  scaled: false,
  source: 'png',
  pages: null,
};
const record = (over: Partial<CustomStampRecord> = {}): CustomStampRecord => ({
  id: ID,
  name: 'Paid',
  category: 'Accounts',
  picture: { key: 'k'.repeat(64) as never, type: 'png', width: 400, height: 200 },
  natural: { width: 300, height: 150 },
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  resetCustomStamps();
  sent.sendBlob.mockResolvedValue({ held: false });
  kept.keepRead.mockResolvedValue(undefined);
});

describe('makeCustomStamp', () => {
  it('sends its picture for the owner, makes it and joins it to their stamps', async () => {
    api.apiCreateCustomStamp.mockImplementation(
      async (_owner: string, input: Partial<CustomStampRecord>) => record(input),
    );
    const made = await makeCustomStamp('ada', { picture, name: 'Paid', category: 'Accounts' }, ID);
    expect(made).toMatchObject({ ok: true, stamp: { id: ID, name: 'Paid' } });
    const [owner, key, bytes, options] = sent.sendBlob.mock.calls[0]!;
    expect([owner, bytes, options]).toEqual(['ada', picture.bytes, undefined]);
    expect(api.apiCreateCustomStamp).toHaveBeenCalledWith('ada', {
      id: ID,
      name: 'Paid',
      category: 'Accounts',
      picture: { key, type: 'png', width: 400, height: 200 },
      natural: { width: 300, height: 150 },
    });
    expect(kept.keepRead).toHaveBeenCalledWith(key, picture.bytes);
    expect(customStampsOf('ada').stamps.map((s) => s.id)).toEqual([ID]);
    expect(track).toHaveBeenCalledWith('Pdf', 'Created', 'CustomStamp');
  });

  it.each([
    ['too_many_custom_stamps', 409, CUSTOM_STAMP_COPY.too_many],
    ['usage_exceeded', 403, CUSTOM_STAMP_COPY.files_full],
    ['custom_stamp_picture_too_large', 413, CUSTOM_STAMP_COPY.too_large],
    ['custom_stamp_invalid', 400, CUSTOM_STAMP_COPY.failed],
  ])('says %s in the spec’s words, making nothing', async (code, status, problem) => {
    api.apiCreateCustomStamp.mockRejectedValue(new ApiError('create custom stamp', status, code));
    expect(await makeCustomStamp('ada', { picture, name: 'Paid', category: 'C' })).toEqual({
      ok: false,
      problem,
    });
    expect(customStampsOf('ada').stamps).toEqual([]);
  });

  it('says a failed send as a stamp not made', async () => {
    sent.sendBlob.mockRejectedValue(new TypeError('offline'));
    expect(await makeCustomStamp('ada', { picture, name: 'Paid', category: 'C' })).toEqual({
      ok: false,
      problem: CUSTOM_STAMP_COPY.failed,
    });
    expect(api.apiCreateCustomStamp).not.toHaveBeenCalled();
  });

  it('names the cap in its words', () => {
    expect(CUSTOM_STAMP_COPY.too_many).toBe(
      'You have the most custom stamps LiveDoc keeps (200). Delete one in Manage stamps first.',
    );
  });
});

describe('their stamps', () => {
  it('reads them once, and again only after a failed read', async () => {
    api.apiListCustomStamps.mockRejectedValueOnce(new TypeError('offline'));
    loadCustomStamps('ada');
    await vi.waitFor(() => expect(customStampsOf('ada').phase).toBe('failed'));
    api.apiListCustomStamps.mockResolvedValue([record()]);
    loadCustomStamps('ada');
    loadCustomStamps('ada');
    await vi.waitFor(() => expect(customStampsOf('ada').phase).toBe('ready'));
    loadCustomStamps('ada');
    expect(api.apiListCustomStamps).toHaveBeenCalledTimes(2);
    expect(customStampsOf('ada').stamps).toHaveLength(1);
    expect(customStampsOf('bo').stamps).toEqual([]);
  });

  it('sections them by category, in the order of their newest stamp', () => {
    const sections = customStampSections([
      record({ id: 'a', category: 'Bills', createdAt: 5 }),
      record({ id: 'b', category: 'Accounts', createdAt: 9 }),
      record({ id: 'c', category: 'Bills', createdAt: 7 }),
    ]);
    expect(sections.map((s) => [s.category, s.stamps.map((t) => t.id)])).toEqual([
      ['Accounts', ['b']],
      ['Bills', ['c', 'a']],
    ]);
  });

  it('reads a picture from this browser first, else from LiveDoc, keeping it', async () => {
    const bytes = new Uint8Array([1, 2]);
    kept.readKept.mockResolvedValueOnce(bytes);
    expect(await customStampPicture('ada', record())).toBe(bytes);
    expect(api.apiReadCustomStampPicture).not.toHaveBeenCalled();
    kept.readKept.mockResolvedValueOnce(null);
    api.apiReadCustomStampPicture.mockResolvedValue(bytes);
    expect(await customStampPicture('ada', record())).toBe(bytes);
    expect(api.apiReadCustomStampPicture).toHaveBeenCalledWith('ada', ID);
    expect(kept.keepRead).toHaveBeenCalledWith(record().picture.key, bytes);
  });
});
